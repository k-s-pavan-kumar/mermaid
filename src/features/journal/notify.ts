'use client';

// Browser-side helpers for the journal reminder. Shared by the background
// engine (components/JournalReminders.tsx) and the "send a test" button.

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function permissionState(): PermissionState {
  // Notifications need a secure context: https, or http://localhost.
  if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  return Notification.permission as PermissionState;
}

/**
 * Show the reminder. Goes through the service worker when there is one — that's
 * what lets a click on the notification focus/open Meridian (see the
 * `notificationclick` handler in public/sw.js) — and falls back to a plain
 * Notification if the worker isn't ready quickly.
 */
export async function showJournalNotification(body: string): Promise<boolean> {
  if (permissionState() !== 'granted') return false;

  const title = 'Meridian · Journal';
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    // A fixed tag means a newer reminder replaces an unread older one
    // instead of stacking up in the notification centre.
    tag: 'meridian-journal-reminder',
    data: { url: '/journal?focus=1' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500)),
      ]);
      if (reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); window.location.href = '/journal?focus=1'; n.close(); };
    return true;
  } catch {
    return false;
  }
}
