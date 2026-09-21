'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag — not part of the standard matchMedia check.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * A visible "Install app" control, instead of relying only on the browser's
 * own (easy-to-miss, sometimes-never-shown) install icon in the address bar.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` once the PWA criteria are
 * met; we capture that event, stop the browser's default mini-infobar, and
 * trigger it ourselves from this button. Safari (iOS/macOS) never fires
 * that event at all — there we show the manual "Add to Home Screen" steps
 * instead. Once the app is already installed (standalone display mode),
 * this renders nothing.
 */
export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Meridian is installed on this device. ✓
      </p>
    );
  }

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferred(null);
  }

  if (deferred) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn" style={{ fontSize: 12.5 }} onClick={handleInstall}>
          📲 Install Meridian
        </button>
        <span className="text-muted" style={{ fontSize: 11.5 }}>
          Adds it to your home screen / app list, no browser chrome.
        </span>
      </div>
    );
  }

  if (isIOS()) {
    return (
      <div>
        <button type="button" className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setShowIOSHelp((v) => !v)}>
          📲 Install on iPhone / iPad
        </button>
        {showIOSHelp && (
          <p className="text-muted" style={{ fontSize: 11.5, margin: '8px 0 0', maxWidth: 420 }}>
            Safari doesn&apos;t offer a one-tap install here — tap the <strong>Share</strong> icon
            in the toolbar, then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
    );
  }

  // Not installable yet: criteria not met (e.g. plain http on a non-localhost
  // host), the browser doesn't support it (Firefox desktop), or the browser
  // hasn't fired the event yet (some Chromium builds wait for a bit of
  // engagement first — reload after clicking around the app for a minute).
  return (
    <p className="text-muted" style={{ fontSize: 12.5, margin: 0, maxWidth: 460 }}>
      Install isn&apos;t available yet in this browser/session. On Chrome or Edge, reload after
      clicking around for a minute, or use the install icon (⊕ / a monitor-with-arrow icon)
      at the right of the address bar. This needs HTTPS (or localhost) and won&apos;t appear in
      an incognito/private window.
    </p>
  );
}
