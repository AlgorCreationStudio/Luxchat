import webpush from 'web-push';
import { storage } from './storage';

// VAPID keys must be set in environment variables
// Generate once with: npx web-push generate-vapid-keys
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_EMAIL   = process.env.VAPID_EMAIL       ?? 'mailto:admin@luxchat.app';

let initialized = false;

export function initWebPush() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[Push] VAPID keys not set — push notifications disabled');
    return;
  }
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  initialized = true;
  console.log('[Push] Web Push initialized');
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!initialized) return;

  const subs = await storage.getPushSubscriptions(userId);
  if (subs.length === 0) return;

  const json = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json
      );
    } catch (err: any) {
      // 410 Gone = subscription expired, remove it
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await storage.deletePushSubscription(sub.endpoint).catch(() => {});
      } else {
        console.error('[Push] Failed to send:', err?.message);
      }
    }
  }
}
