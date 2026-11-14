import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const publicFilePath = (fileName: string) => `/${fileName.replaceAll('\\', '/')}`;

function referencedPublicFiles(projectRoot: string): string[] {
  const indexHtml = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'public/manifest.webmanifest'), 'utf8')) as {
    icons?: Array<{ src?: unknown }>;
  };
  const references = new Set<string>();
  const referencePattern = /(?:href|src)\s*=\s*["'](\/[^"'?#]+)["']/g;
  for (const match of indexHtml.matchAll(referencePattern)) references.add(match[1]);
  for (const icon of manifest.icons ?? []) {
    if (typeof icon.src === 'string' && icon.src.startsWith('/')) references.add(icon.src);
  }

  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      const fileName = publicFilePath(relative(resolve(projectRoot, 'public'), absolutePath));
      const lowerName = fileName.toLowerCase();
      if (references.has(fileName)
        && !lowerName.endsWith('.map')
        && !lowerName.endsWith('.exe')
        && !lowerName.endsWith('.blockmap')
        && lowerName !== '/sw.js'
        && !lowerName.includes('/release')) {
        files.push(fileName);
      }
    }
  };
  walk(resolve(projectRoot, 'public'));
  return files.sort();
}

function serviceWorkerPlugin(): Plugin {
  let projectRoot = process.cwd();
  return {
    name: 'jaswa-service-worker',
    configResolved(config) {
      projectRoot = config.root;
    },
    generateBundle(_options, bundle) {
      const emittedFiles = Object.keys(bundle)
        .filter((fileName) => !fileName.endsWith('.map'))
        .map((fileName) => `/${fileName}`);
      const files = [...new Set([...emittedFiles, ...referencedPublicFiles(projectRoot)])].sort();
      const serializedFiles = JSON.stringify(files);
      const precacheHash = createHash('sha256').update(serializedFiles).digest('hex').slice(0, 12);
      const template = readFileSync(resolve(projectRoot, 'scripts/sw-template.js'), 'utf8');
      const source = template
        .replace('__JASWA_PRECACHE_FILES__', serializedFiles)
        .replaceAll('__JASWA_PRECACHE_HASH__', precacheHash)
        .replaceAll('__JASWA_BUILD_ORDER__', String(Date.now()));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
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
