import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
