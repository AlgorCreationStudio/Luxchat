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
  // Promise that resolves when the shared key is ready
  const keyReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const keyReadyResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Reset state for new otherUserId
    sharedKeyRef.current = null;
    readyRef.current = false;

    if (!user?.id || !otherUserId) return;

    // Create a new promise that callers can await
    let resolve: () => void;
    keyReadyPromiseRef.current = new Promise<void>((res) => { resolve = res; });
    keyReadyResolveRef.current = resolve!;

    let cancelled = false;

    (async () => {
      try {
        const myKeyPair = await getOrCreateKeyPair();
        await uploadPublicKey(user.id, myKeyPair.publicKeyJwk);

        const theirPublicKeyJwk = await fetchPublicKey(otherUserId);
        if (!theirPublicKeyJwk || cancelled) {
          keyReadyResolveRef.current?.();
          return;
        }

        const sharedKey = await getSharedKey(myKeyPair.privateKey, theirPublicKeyJwk);
        if (!cancelled) {
          sharedKeyRef.current = sharedKey;
          readyRef.current = true;
        }
      } catch (err) {
        console.warn('[E2E] Key setup failed, falling back to plaintext:', err);
      } finally {
        if (!cancelled) keyReadyResolveRef.current?.();
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, otherUserId]);

  const encrypt = useCallback(async (plaintext: string): Promise<{ text: string; encrypted: boolean }> => {
    // Wait for key to be ready (max 5s)
    await Promise.race([
      keyReadyPromiseRef.current,
      new Promise<void>((r) => setTimeout(r, 5000)),
    ]);
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
    // Wait for key to be ready (max 5s)
    await Promise.race([
      keyReadyPromiseRef.current,
      new Promise<void>((r) => setTimeout(r, 5000)),
    ]);
    if (!sharedKeyRef.current || !readyRef.current) return ciphertext;
    try {
      return await decryptMessage(ciphertext, sharedKeyRef.current);
    } catch {
      return '🔒 [No se pudo descifrar]';
    }
  }, []);

  // Expose a way to know when key is ready (for re-triggering decryption)
  const waitForKey = useCallback(() => keyReadyPromiseRef.current, []);

  return { encrypt, decrypt, isReady: () => readyRef.current, waitForKey };
}
