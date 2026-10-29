import { useEffect } from 'react';
import { supabase } from './supabase';

const VAPID_KEY_FETCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push/vapid-key`;
let cachedVapidKey: string | null = null;

async function getVapidKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey;
  try {
    const res = await fetch(VAPID_KEY_FETCH_URL);
    if (!res.ok) return null;
    const data = await res.json();
    cachedVapidKey = data.publicKey ?? null;
    return cachedVapidKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

async function subscribeToPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();

    if (existing) {
      // Check if we already have this endpoint stored
      const { data: stored } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', existing.endpoint)
        .maybeSingle();

      if (!stored) {
        await storeSubscription(userId, existing);
      }
      return;
    }

    const vapidKey = await getVapidKey();
    if (!vapidKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    await storeSubscription(userId, sub);
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

async function storeSubscription(userId: string, sub: PushSubscription) {
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');

  if (!p256dh || !auth) return;

  const p256dhB64 = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
  const authB64 = btoa(String.fromCharCode(...new Uint8Array(auth)));

  await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh_key: p256dhB64,
      auth_key: authB64,
      device_type: getDeviceType(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
}

export function usePushNotifications() {
  useEffect(() => {
    if (!('Notification' in window)) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
}

export async function ensurePushSubscription(userId: string) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return;
  }

  if (Notification.permission === 'granted') {
    await subscribeToPush(userId);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function showPushNotification(title: string, body: string, tag?: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83.jpg',
        badge: '/grok-image-f587b157-0d4d-493c-95b9-11f95f3e5929.png',
        tag: tag ?? 'bubble',
        renotify: true,
        vibrate: [200, 100, 200],
      } as NotificationOptions);
    } else {
      new Notification(title, {
        body,
        icon: '/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83.jpg',
        tag: tag ?? 'bubble',
      });
    }
  } catch {
    try {
      new Notification(title, { body });
    } catch {}
  }
}

export async function sendPushToRecipient(recipientId: string, title: string, body: string, tag?: string, data?: Record<string, any>) {
  try {
    const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push/send`;
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.session?.access_token ?? ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ recipient_id: recipientId, title, body, tag, data }),
    });
    if (!res.ok) return;
    const result = await res.json();
    return result;
  } catch (err) {
    console.warn('sendPushToRecipient failed:', err);
  }
}
