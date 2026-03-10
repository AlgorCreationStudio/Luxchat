// End-to-End Encryption using ECDH (P-256) + AES-GCM
// Keys are generated once per user and stored in IndexedDB
// The public key is uploaded to the server so contacts can derive a shared secret

const DB_NAME = 'luxchat-e2e';
const STORE_NAME = 'keys';
const KEY_ID = 'main';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Key management ───────────────────────────────────────────────────────────
export interface E2EKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

let cachedKeyPair: E2EKeyPair | null = null;

export async function getOrCreateKeyPair(): Promise<E2EKeyPair> {
  if (cachedKeyPair) return cachedKeyPair;

  // Try loading from IndexedDB
  const stored = await idbGet(KEY_ID);
  if (stored) {
    const privateKey = await crypto.subtle.importKey(
      'jwk', stored.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveKey']
    );
    const publicKey = await crypto.subtle.importKey(
      'jwk', stored.publicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, []
    );
    cachedKeyPair = { publicKeyJwk: stored.publicKeyJwk, privateKey, publicKey };
    return cachedKeyPair;
  }

  // Generate new key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  await idbSet(KEY_ID, { publicKeyJwk, privateKeyJwk });

  cachedKeyPair = {
    publicKeyJwk,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };

  return cachedKeyPair;
}

// ─── Shared secret derivation ─────────────────────────────────────────────────
const derivedKeys = new Map<string, CryptoKey>();

export async function getSharedKey(myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<CryptoKey> {
  const cacheKey = JSON.stringify(theirPublicKeyJwk);
  if (derivedKeys.has(cacheKey)) return derivedKeys.get(cacheKey)!;

  const theirPublicKey = await crypto.subtle.importKey(
    'jwk', theirPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  derivedKeys.set(cacheKey, sharedKey);
  return sharedKey;
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────
export async function encryptMessage(plaintext: string, sharedKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);

  // Combine iv + ciphertext → base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(encrypted: string, sharedKey: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ─── Fetch contact's public key from server ───────────────────────────────────
export async function fetchPublicKey(userId: string): Promise<JsonWebKey | null> {
  try {
    const res = await fetch(`/api/users/${userId}/public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey ? JSON.parse(publicKey) : null;
  } catch {
    return null;
  }
}

// ─── Upload my public key to server ──────────────────────────────────────────
export async function uploadPublicKey(userId: string, publicKeyJwk: JsonWebKey): Promise<void> {
  await fetch(`/api/users/${userId}/public-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: JSON.stringify(publicKeyJwk) }),
  });
}
