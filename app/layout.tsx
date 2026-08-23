import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Swaggr — Summoners War Tools', description: 'A private, local-first workspace for Summoners War runes, monsters and upgrades.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
