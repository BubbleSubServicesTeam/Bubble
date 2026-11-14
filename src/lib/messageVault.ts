import { supabase } from './supabase';
import type { Message, VaultEnvelope } from './supabase';

const DB_NAME = 'bubble-vault';
const STORE_NAME = 'identities';
const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const WRAP_PARAMS: AesDerivedKeyParams = { name: 'AES-GCM', length: 256 };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Identity = { deviceId: string; privateKey: CryptoKey; publicKey: JsonWebKey };

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

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

export async function sealTextForConversation(
  userId: string,
  conversationId: string,
  plaintext: string,
): Promise<VaultEnvelope | null> {
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
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bodyIv }, messageKey, encoder.encode(plaintext));

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
      eph: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
      body: { iv: toBase64(bodyIv), c: toBase64(new Uint8Array(body)) },
      keys,
    };
  } catch (err) {
    console.error('Failed to encrypt message', err);
    return null;
  }
}

async function openEnvelope(userId: string, vault: VaultEnvelope): Promise<string | null> {
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
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(vault.body.iv) },
      messageKey,
      fromBase64(vault.body.c),
    );
    return decoder.decode(plain);
  } catch {
    return null;
  }
}

export async function revealMessage(userId: string, message: Message): Promise<Message> {
  if (!message.vault) return message;
  const text = await openEnvelope(userId, message.vault);
  return { ...message, content: text, vault_locked: text === null };
}

export function revealMessages(userId: string, messages: Message[]): Promise<Message[]> {
  return Promise.all(messages.map(message => revealMessage(userId, message)));
}
