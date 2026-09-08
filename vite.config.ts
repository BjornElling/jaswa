import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
    watch: {
      /* Rust build intermediates are not application source and Windows can
         keep them locked while Cargo runs. Excluding them keeps HMR reliable. */
      ignored: ['**/helper/src-tauri/target/**'],
    },
  },
});
