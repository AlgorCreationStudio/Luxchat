import { useEffect, useRef, useCallback } from 'react';
import {
  getOrCreateKeyPair,
  getSharedKey,
  encryptMessage,
  decryptMessage,
  fetchPublicKey,
  uploadPublicKey,
} from '@/lib/e2e-crypto';
import { useAuthStore } from '@/store/use-auth-store';

export function useE2E(otherUserId: string | null) {
  const user = useAuthStore((s) => s.user);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const readyRef = useRef(false);

  // Init: generate/load our key pair, upload public key, derive shared key
  useEffect(() => {
    if (!user?.id || !otherUserId) return;
    let cancelled = false;

    (async () => {
      try {
        const myKeyPair = await getOrCreateKeyPair();

        // Upload our public key (idempotent)
        await uploadPublicKey(user.id, myKeyPair.publicKeyJwk);

        // Fetch the contact's public key
        const theirPublicKeyJwk = await fetchPublicKey(otherUserId);
        if (!theirPublicKeyJwk || cancelled) return;

        // Derive shared secret
        const sharedKey = await getSharedKey(myKeyPair.privateKey, theirPublicKeyJwk);
        if (!cancelled) {
          sharedKeyRef.current = sharedKey;
          readyRef.current = true;
        }
      } catch (err) {
        console.warn('[E2E] Key setup failed, falling back to plaintext:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, otherUserId]);

  const encrypt = useCallback(async (plaintext: string): Promise<{ text: string; encrypted: boolean }> => {
    if (!sharedKeyRef.current || !readyRef.current) {
      return { text: plaintext, encrypted: false };
    }
    try {
      const text = await encryptMessage(plaintext, sharedKeyRef.current);
      return { text, encrypted: true };
    } catch {
      return { text: plaintext, encrypted: false };
    }
  }, []);

  const decrypt = useCallback(async (ciphertext: string): Promise<string> => {
    if (!sharedKeyRef.current || !readyRef.current) return ciphertext;
    try {
      return await decryptMessage(ciphertext, sharedKeyRef.current);
    } catch {
      return '🔒 [No se pudo descifrar]';
    }
  }, []);

  return { encrypt, decrypt, isReady: () => readyRef.current };
}
