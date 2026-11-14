import { useEffect } from 'react';

/**
 * Registers the production PWA worker without interfering with Vite HMR.
 *
 * A new build's worker installs beside the running one and waits. It is applied
 * only as the page goes away (`pagehide`: a reload, a navigation away, a closed
 * tab), the safe reload point `ARCHITECTURE-FROM-SCRATCH.md` §14.2 asks for. A
 * page that is merely hidden keeps running its build and may still lazy-load
 * that build's chunks, so it is never switched underneath itself.
 */
export function PwaServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const onPageHide = () => registration?.waiting?.postMessage({ type: 'apply-update' });
    window.addEventListener('pagehide', onPageHide);
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registered) => { registration = registered; });
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  return null;
}
