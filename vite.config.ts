import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'jaswa-precache-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((fileName) => !fileName.endsWith('.map'))
        .map((fileName) => `/${fileName}`);
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify([...assets, '/manifest.webmanifest', '/favicon.svg', '/favicon.ico', '/pwa-192x192.png', '/pwa-512x512.png', '/maskable-icon-512x512.png'], null, 2),
      });
    },
  }],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
    watch: {
      /* Checks and Playwright write traces and HTML snapshots while other
         browsers are calculating. Generated files must never trigger HMR. */
      ignored: ['**/helper/src-tauri/target/**', '**/helper/dist/**', '**/work/**', '**/outputs/**', '**/test-results/**'],
    },
  },
});
