import type { Metadata, Viewport } from 'next';
import { PwaServiceWorker } from './components/pwa-service-worker';
import { AppViewport } from './components/app-viewport';
import './globals.css';

export const metadata: Metadata = {
  title: 'JASWA — Just Another Summoners War App',
  description: 'A private, local-first workspace for Summoners War runes, monsters and upgrades.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon-180x180.png',
  },
};
/* Handheld browsers need their native viewport for the device-only notice;
   desktop canvas scaling is owned by AppViewport rather than this meta tag. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0d12' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><PwaServiceWorker /><AppViewport>{children}</AppViewport></body></html>; }
