'use client';

import { permissionState } from '@/features/journal/notify';

/** Task reminder via the service worker when there is one (so a click opens Meridian). */
export async function showTaskNotification(title: string, body: string, tag: string, url = '/today'): Promise<boolean> {
  if (permissionState() !== 'granted') return false;
  const options: NotificationOptions = { body, icon: '/icons/icon-192.png', tag, data: { url } };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500)),
      ]);
      if (reg) { await reg.showNotification(title, options); return true; }
    }
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); window.location.href = url; n.close(); };
    return true;
  } catch { return false; }
}
