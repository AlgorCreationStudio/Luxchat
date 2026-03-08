import { useEffect } from 'react';
import { useAuthStore } from '@/store/use-auth-store';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const res = await fetch('/api/push/vapid-key');
    if (!res.ok) return;
    const { publicKey } = await res.json();
    if (!publicKey) return;

    // Check existing subscription
    let sub = await reg.pushManager.getSubscription();

    // If already subscribed, just save it (in case it wasn't saved before)
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: sub }),
    });

    console.log('[Push] Subscribed successfully');
  } catch (err) {
    console.warn('[Push] Subscription failed:', err);
  }
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user?.id) return;

    // Request permission then subscribe
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribeToPush(user.id);
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') subscribeToPush(user.id);
        });
      }
    }
  }, [user?.id]);
}
