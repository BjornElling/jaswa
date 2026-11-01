import { createServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** Read TypeScript in checks without competing with the live app's optimizer.
 * A different Vite configuration in node_modules/.vite invalidates the browser's
 * dependency URLs. Parallel checks must not evict the code a worker is loading.
 * These servers only evaluate modules; none listens on another preview port. */
export async function createVerificationServer(options = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'jaswa-verification-'));
  const removeCache = async () => {
    if (dirname(resolve(cacheDir)) !== resolve(tmpdir()) || !basename(cacheDir).startsWith('jaswa-verification-')) {
      throw new Error('The verification cache must stay in its own temporary directory.');
    }
    await rm(cacheDir, { recursive: true, force: true });
  };
  try {
    const server = await createServer({
      ...options, configFile: false, appType: 'custom', cacheDir,
      // SSR needs neither browser prebundling nor filesystem-triggered reloads.
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    });
    const close = server.close.bind(server);
    server.close = async () => {
      try { await close(); } finally { await removeCache(); }
    };
    return server;
  } catch (error) {
    await removeCache();
    throw error;
  }
}
