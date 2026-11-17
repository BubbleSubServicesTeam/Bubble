import { supabase } from './supabase';
import type { Message, VaultEnvelope } from './supabase';

const DB_NAME = 'bubble-vault';
const STORE_NAME = 'identities';
const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const WRAP_PARAMS: AesDerivedKeyParams = { name: 'AES-GCM', length: 256 };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Identity = { deviceId: string; privateKey: CryptoKey; publicKey: JsonWebKey };
type SealedBytes = { envelope: VaultEnvelope; ciphertext: Uint8Array };

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openVaultDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function identityKey(userId: string) {
  return `identity:${userId}`;
}

async function loadOrCreateIdentity(userId: string): Promise<Identity> {
  const existing = await withStore<Identity | undefined>('readonly', store => store.get(identityKey(userId)));
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey(ECDH_PARAMS, false, ['deriveKey']);
  const identity: Identity = {
    deviceId: crypto.randomUUID(),
    privateKey: pair.privateKey,
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
  };
  await withStore('readwrite', store => store.put(identity, identityKey(userId)));
  return identity;
}

async function registerDevice(userId: string, identity: Identity) {
  const { error } = await supabase.from('vault_devices').upsert(
    {
      user_id: userId,
      device_id: identity.deviceId,
      public_key: identity.publicKey,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' },
  );
  if (error) throw error;
}

async function currentIdentity(userId: string): Promise<Identity | null> {
  try {
    const identity = await loadOrCreateIdentity(userId);
    await registerDevice(userId, identity);
    return identity;
  } catch {
    return null;
  }
}

export async function ensureDeviceRegistered(userId: string): Promise<string | null> {
  const identity = await currentIdentity(userId);
  return identity?.deviceId ?? null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function sealBytes(userId: string, conversationId: string, plain: Uint8Array): Promise<SealedBytes | null> {
  try {
    const identity = await loadOrCreateIdentity(userId);
    await registerDevice(userId, identity);

    const { data: devices, error } = await supabase.rpc('get_conversation_vault_devices', {
      p_conversation_id: conversationId,
    });
    if (error || !devices || devices.length === 0) return null;

    const ephemeral = await crypto.subtle.generateKey(ECDH_PARAMS, false, ['deriveKey']);
    const messageKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rawMessageKey = await crypto.subtle.exportKey('raw', messageKey);
    const bodyIv = crypto.getRandomValues(new Uint8Array(12));
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bodyIv }, messageKey, plain);

    const keys = await Promise.all(
      (devices as { device_id: string; public_key: JsonWebKey }[]).map(async device => {
        const recipientKey = await crypto.subtle.importKey('jwk', device.public_key, ECDH_PARAMS, false, []);
        const wrapKey = await crypto.subtle.deriveKey(
          { name: 'ECDH', public: recipientKey },
          ephemeral.privateKey,
          WRAP_PARAMS,
          false,
          ['encrypt'],
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, rawMessageKey);
        return { d: device.device_id, iv: toBase64(iv), k: toBase64(new Uint8Array(wrapped)) };
      }),
    );

    return {
      envelope: {
        eph: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
        body: { iv: toBase64(bodyIv), c: '' },
        keys,
      },
      ciphertext: new Uint8Array(body),
    };
  } catch (err) {
    console.error('Failed to encrypt message', err);
    return null;
  }
}

async function openBytes(userId: string, vault: VaultEnvelope, ciphertext: Uint8Array): Promise<Uint8Array | null> {
  try {
    const identity = await withStore<Identity | undefined>('readonly', store => store.get(identityKey(userId)));
    if (!identity) return null;
    const entry = vault.keys.find(key => key.d === identity.deviceId);
    if (!entry) return null;

    const ephemeralPublic = await crypto.subtle.importKey('jwk', vault.eph, ECDH_PARAMS, false, []);
    const unwrapKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPublic },
      identity.privateKey,
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

export async function shareVaultKeysWithNewDevices(userId: string, conversationId: string): Promise<void> {
  try {
    const identity = await currentIdentity(userId);
    if (!identity) return;

    const { data: devices, error } = await supabase.rpc('get_conversation_vault_devices', {
      p_conversation_id: conversationId,
    });
    if (error || !devices) return;

    const { data: sealed, error: sealedError } = await supabase
      .from('messages')
      .select('id, vault')
      .eq('conversation_id', conversationId)
      .eq('sender_id', userId)
      .not('vault', 'is', null);
    if (sealedError || !sealed) return;

    type DeviceRow = { device_id: string; public_key: JsonWebKey };
    const allDevices = devices as DeviceRow[];

    for (const row of sealed as { id: string; vault: VaultEnvelope }[]) {
      const envelope = row.vault;
      if (!envelope?.keys) continue;
      const missing = allDevices.filter(device => {
        const entry = envelope.keys.find(key => key.d === device.device_id);
        return !entry && device.device_id !== identity.deviceId;
      });
      if (missing.length === 0) continue;

      const ownEntry = envelope.keys.find(key => key.d === identity.deviceId);
      if (!ownEntry) continue;

      const ephemeralPublic = await crypto.subtle.importKey('jwk', envelope.eph, ECDH_PARAMS, false, []);
      const unwrapKey = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: ephemeralPublic },
        identity.privateKey,
        WRAP_PARAMS,
        false,
        ['decrypt'],
      );
      const rawMessageKey = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(ownEntry.iv) },
        unwrapKey,
        fromBase64(ownEntry.k),
      );

      for (const device of missing) {
        try {
          const recipientKey = await crypto.subtle.importKey('jwk', device.public_key, ECDH_PARAMS, false, []);
          const wrapKey = await crypto.subtle.deriveKey(
            { name: 'ECDH', public: recipientKey },
            ephemeralPublic,
            WRAP_PARAMS,
            false,
            ['encrypt'],
          );
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, rawMessageKey);
          await supabase.rpc('grant_message_key_to_device', {
            p_message_id: row.id,
            p_device_id: device.device_id,
            p_iv: toBase64(iv),
            p_key: toBase64(new Uint8Array(wrapped)),
          });
        } catch (err) {
          console.error('Failed to share message key with device', err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to share vault keys', err);
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
