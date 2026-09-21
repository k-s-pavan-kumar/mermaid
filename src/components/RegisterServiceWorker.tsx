'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (public/sw.js) once the app has hydrated.
 * Renders nothing — mount it once near the root of the tree.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    };

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
