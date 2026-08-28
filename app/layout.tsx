import type { Metadata, Viewport } from 'next';
import { PwaServiceWorker } from './components/pwa-service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Swaggr — Summoners War Tools',
  description: 'A private, local-first workspace for Summoners War runes, monsters and upgrades.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon-180x180.png',
  },
};
/* The manifest carries this for the installed app; the meta tag is what a
   plain mobile browser tab reads. Both are the app's own ground, so the
   chrome around the page does not flash a colour the page never uses. */
export const viewport: Viewport = { themeColor: '#0b0d12' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><PwaServiceWorker />{children}</body></html>; }
