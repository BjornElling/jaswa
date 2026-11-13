import { useEffect } from 'react';

/** Registers the production PWA worker without interfering with Vite HMR. */
export function PwaServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }, []);

  return null;
}
