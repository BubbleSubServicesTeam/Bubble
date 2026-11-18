import { supabase } from './supabase';
import type { Message, VaultEnvelope } from './supabase';

const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const WRAP_PARAMS: AesDerivedKeyParams = { name: 'AES-GCM', length: 256 };
const PBKDF2_ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type VaultIdentity = { privateKey: CryptoKey; publicKey: JsonWebKey };
type VaultMember = { user_id: string; public_key: JsonWebKey };
type WrappedKey = { iv: string; c: string; salt: string };
type SealedBytes = { envelope: VaultEnvelope; ciphertext: Uint8Array };

// The unlocked private key for the signed-in account, held for the session
// only. It never leaves this module except through crypto operations.
let sessionIdentity: { userId: string; privateKey: CryptoKey } | null = null;

export type VaultUnlockResult = 'unlocked' | 'created' | 'wrong_password' | 'unavailable';

export function isVaultUnlocked(userId: string): boolean {
  return sessionIdentity?.userId === userId;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function deriveWrapKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    WRAP_PARAMS,
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapPrivateKey(privateKey: CryptoKey, password: string): Promise<WrappedKey> {
  const raw = await crypto.subtle.exportKey('pkcs8', privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(password, salt);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, raw);
  return { iv: toBase64(iv), c: toBase64(new Uint8Array(sealed)), salt: toBase64(salt) };
}

async function unwrapPrivateKey(wrapped: WrappedKey, password: string): Promise<CryptoKey | null> {
  try {
    const wrapKey = await deriveWrapKey(password, fromBase64(wrapped.salt));
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
      wrapKey,
      fromBase64(wrapped.c),
    );
    return await crypto.subtle.importKey('pkcs8', raw, ECDH_PARAMS, false, ['deriveKey']);
  } catch {
    return null;
  }
}

/**
 * Unlocks (or creates) the account's vault identity using the sign-in
 * password. Members of a chat can always read its messages once unlocked;
 * the database only ever holds the private key wrapped under the password,
 * so a database leak reveals nothing.
 */
export async function unlockVault(userId: string, password: string): Promise<VaultUnlockResult> {
  try {
    const { data: row, error } = await supabase
      .from('vault_identities')
      .select('public_key, wrapped_private_key')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return 'unavailable';

    if (row) {
      const privateKey = await unwrapPrivateKey(row.wrapped_private_key as WrappedKey, password);
      if (!privateKey) return 'wrong_password';
      sessionIdentity = { userId, privateKey };
      return 'unlocked';
    }

    const pair = await crypto.subtle.generateKey(ECDH_PARAMS, false, ['deriveKey']);
    const wrapped = await wrapPrivateKey(pair.privateKey, password);
    const { error: insertError } = await supabase.from('vault_identities').insert({
      user_id: userId,
      public_key: await crypto.subtle.exportKey('jwk', pair.publicKey),
      wrapped_private_key: wrapped,
    });
    if (insertError) return 'unavailable';
    sessionIdentity = { userId, privateKey: pair.privateKey };
    return 'created';
  } catch {
    return 'unavailable';
  }
}

/**
 * Re-wraps the account's private key under a new password after a password
 * change. Best-effort: if the vault is locked (e.g. signed in via QR), the
 * old wrapping is left in place and the next password sign-in re-wraps.
 */
export async function rewrapVaultKey(userId: string, newPassword: string): Promise<void> {
  if (!isVaultUnlocked(userId)) return;
  try {
    const privateKey = sessionIdentity!.privateKey;
    const wrapped = await wrapPrivateKey(privateKey, newPassword);
    // The identity must already exist — it was unlocked this session.
    await supabase
      .from('vault_identities')
      .update({ wrapped_private_key: wrapped, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch { /* best effort */ }
}

export function lockVault(): void {
  sessionIdentity = null;
}

async function sealBytesForMembers(plain: Uint8Array, members: VaultMember[]): Promise<SealedBytes> {
  const ephemeral = await crypto.subtle.generateKey(ECDH_PARAMS, false, ['deriveKey']);
  const messageKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawMessageKey = await crypto.subtle.exportKey('raw', messageKey);
  const bodyIv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bodyIv }, messageKey, plain);
  const keys = await Promise.all(members.map(async member => {
    const recipientKey = await crypto.subtle.importKey('jwk', member.public_key, ECDH_PARAMS, false, []);
    const wrapKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientKey },
      ephemeral.privateKey,
      WRAP_PARAMS,
      false,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, rawMessageKey);
    return { d: member.user_id, iv: toBase64(iv), k: toBase64(new Uint8Array(wrapped)) };
  }));
  return {
    envelope: {
      eph: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
      body: { iv: toBase64(bodyIv), c: '' },
      keys,
    },
    ciphertext: new Uint8Array(body),
  };
}

async function sealBytes(userId: string, conversationId: string, plain: Uint8Array): Promise<SealedBytes | null> {
  try {
    if (!isVaultUnlocked(userId)) return null;
    const { data: members, error } = await supabase.rpc('get_conversation_vault_identities', {
      p_conversation_id: conversationId,
    });
    if (error || !members || members.length === 0) return null;
    return sealBytesForMembers(plain, members as VaultMember[]);
  } catch (err) {
    console.error('Failed to encrypt message', err);
    return null;
  }
}

async function openBytes(userId: string, vault: VaultEnvelope, ciphertext: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (!isVaultUnlocked(userId)) return null;
    const entry = vault.keys.find(key => key.d === userId);
    if (!entry) return null;

    const ephemeralPublic = await crypto.subtle.importKey('jwk', vault.eph, ECDH_PARAMS, false, []);
    const unwrapKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPublic },
      sessionIdentity!.privateKey,
      WRAP_PARAMS,
      false,
      ['decrypt'],
    );
    const rawMessageKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(entry.iv) },
      unwrapKey,
      fromBase64(entry.k),
    );
    const messageKey = await crypto.subtle.importKey('raw', rawMessageKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.body.iv) }, messageKey, ciphertext);
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

export async function sealTextForConversation(
  userId: string,
  conversationId: string,
  plaintext: string,
): Promise<VaultEnvelope | null> {
  const sealed = await sealBytes(userId, conversationId, encoder.encode(plaintext));
  if (!sealed) return null;
  return { ...sealed.envelope, body: { iv: sealed.envelope.body.iv, c: toBase64(sealed.ciphertext) } };
}

const MEDIA_HEADER_BYTES = 4;

export async function uploadMedia(
  userId: string,
  folder: string,
  file: Blob,
  meta: { file_name: string; file_mime: string },
): Promise<{ media_url: string; file_name: string; file_mime: string; file_size: number }> {
  const path = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID()}-${meta.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage
    .from('media')
    .upload(path, file, { contentType: meta.file_mime || 'application/octet-stream', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { media_url: data.publicUrl, file_name: meta.file_name, file_mime: meta.file_mime, file_size: file.size };
}

export async function uploadSealedMedia(
  userId: string,
  conversationId: string,
  folder: string,
  file: Blob,
  meta: { file_name: string; file_mime: string },
): Promise<{ media_url: string; vault: VaultEnvelope } | null> {
  const header = encoder.encode(JSON.stringify(meta));
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const plain = new Uint8Array(MEDIA_HEADER_BYTES + header.length + fileBytes.length);
  new DataView(plain.buffer).setUint32(0, header.length);
  plain.set(header, MEDIA_HEADER_BYTES);
  plain.set(fileBytes, MEDIA_HEADER_BYTES + header.length);

  const sealed = await sealBytes(userId, conversationId, plain);
  if (!sealed) return null;

  const path = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage
    .from('media')
    .upload(path, new Blob([sealed.ciphertext]), { contentType: 'application/octet-stream', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { media_url: data.publicUrl, vault: sealed.envelope };
}

async function revealText(userId: string, message: Message, vault: VaultEnvelope): Promise<Message> {
  const plain = await openBytes(userId, vault, fromBase64(vault.body.c));
  return { ...message, content: plain ? decoder.decode(plain) : null, vault_locked: plain === null };
}

async function revealMedia(userId: string, message: Message, vault: VaultEnvelope): Promise<Message> {
  const locked = { ...message, media_url: null, vault_locked: true };
  try {
    const response = await fetch(message.media_url!);
    if (!response.ok) return locked;
    const ciphertext = new Uint8Array(await response.arrayBuffer());
    const plain = await openBytes(userId, vault, ciphertext);
    if (!plain) return locked;
    const headerLength = new DataView(plain.buffer, plain.byteOffset).getUint32(0);
    const meta = JSON.parse(decoder.decode(plain.subarray(MEDIA_HEADER_BYTES, MEDIA_HEADER_BYTES + headerLength))) as {
      file_name: string;
      file_mime: string;
    };
    const fileBytes = plain.subarray(MEDIA_HEADER_BYTES + headerLength);
    const blob = new Blob([fileBytes], { type: meta.file_mime });
    return {
      ...message,
      media_url: URL.createObjectURL(blob),
      file_name: meta.file_name,
      file_mime: meta.file_mime,
      file_size: fileBytes.byteLength,
      vault_locked: false,
    };
  } catch {
    return locked;
  }
}

export async function revealMessage(userId: string, message: Message): Promise<Message> {
  if (!message.vault) return message;
  return message.media_url
    ? revealMedia(userId, message, message.vault)
    : revealText(userId, message, message.vault);
}

export function revealMessages(userId: string, messages: Message[]): Promise<Message[]> {
  return Promise.all(messages.map(message => revealMessage(userId, message)));
}

/**
 * One-time upgrade: messages sealed under the retired per-device vault are
 * re-sealed under the account's key, so they become readable on every device
 * the account signs in on. Runs silently after a successful vault unlock;
 * messages whose old device key is gone are left untouched.
 */
export async function rekeyLegacyVaultMessages(userId: string): Promise<void> {
  if (!isVaultUnlocked(userId)) return;
  try {
    const { data: rows, error } = await supabase
      .from('messages')
      .select('id, conversation_id, message_type, vault, media_url, file_name, file_mime, file_size')
      .eq('sender_id', userId)
      .not('vault', 'is', null)
      .limit(500);
    if (error || !rows || rows.length === 0) return;

    for (const row of rows as Array<{
      id: string;
      conversation_id: string;
      message_type: Message['message_type'];
      vault: VaultEnvelope;
      media_url: string | null;
      file_name: string | null;
      file_mime: string | null;
      file_size: number | null;
    }>) {
      // Already user-scoped when a key entry names a member account.
      if (row.vault.keys.some(k => k.d === userId)) continue;

      const { data: members, error: membersError } = await supabase.rpc('get_conversation_vault_identities', {
        p_conversation_id: row.conversation_id,
      });
      if (membersError || !members || members.length === 0) continue;

      if (row.media_url) {
        try {
          const response = await fetch(row.media_url);
          if (!response.ok) continue;
          const ciphertext = new Uint8Array(await response.arrayBuffer());
          const plain = await openBytes(userId, row.vault, ciphertext);
          if (!plain || plain.byteLength < MEDIA_HEADER_BYTES) continue;
          const headerLength = new DataView(plain.buffer, plain.byteOffset).getUint32(0);
          const meta = JSON.parse(decoder.decode(plain.subarray(MEDIA_HEADER_BYTES, MEDIA_HEADER_BYTES + headerLength))) as {
            file_name: string;
            file_mime: string;
          };
          const fileBytes = plain.subarray(MEDIA_HEADER_BYTES + headerLength);
          const sealed = await sealBytesForMembers(plain, members as VaultMember[]);
          const path = `restored/${userId}/${Date.now()}-${crypto.randomUUID()}.bin`;
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(path, new Blob([sealed.ciphertext]), { contentType: 'application/octet-stream', upsert: false });
          if (uploadError) continue;
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
          await supabase
            .from('messages')
            .update({
              media_url: urlData.publicUrl,
              file_name: meta.file_name,
              file_mime: meta.file_mime,
              file_size: fileBytes.byteLength,
              vault: sealed.envelope,
            })
            .eq('id', row.id)
            .eq('sender_id', userId);
        } catch { /* skip this attachment */ }
      } else {
        const plain = await openBytes(userId, row.vault, fromBase64(row.vault.body.c));
        if (!plain) continue;
        const sealed = await sealBytesForMembers(plain, members as VaultMember[]);
        await supabase
          .from('messages')
          .update({ vault: { ...sealed.envelope, body: { iv: sealed.envelope.body.iv, c: toBase64(sealed.ciphertext) } } })
          .eq('id', row.id)
          .eq('sender_id', userId);
      }
    }
  } catch (err) {
    console.error('Failed to rekey legacy vault messages', err);
  }
}
