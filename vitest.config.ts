import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// A verification run must never evict the live application's Vite cache.
const cacheDir = mkdtempSync(join(tmpdir(), 'jaswa-vitest-'));
process.once('exit', () => rmSync(cacheDir, { recursive: true, force: true }));

export default defineConfig({
  cacheDir,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { hmr: false, ws: false, watch: null },
  test: { include: ['app/**/*.test.ts'], watch: false, bail: 0 },
});
