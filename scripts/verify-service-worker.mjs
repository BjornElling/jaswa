import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const templatePath = resolve(repositoryRoot, 'scripts/sw-template.js');
const distDirectory = resolve(repositoryRoot, process.argv[2] ?? 'dist');
const builtWorkerPath = resolve(distDirectory, 'sw.js');
const template = await readFile(templatePath, 'utf8');

if (template.includes('precache-manifest.json')) throw new Error('The worker must carry its precache list instead of fetching a separate manifest.');
if (!template.includes('event.data?.type === \'apply-update\'')) throw new Error('The worker must wait for an explicit update message.');
const installStart = template.indexOf("self.addEventListener('install'");
const messageStart = template.indexOf("self.addEventListener('message'");
if (installStart < 0 || messageStart < 0 || template.slice(installStart, messageStart).includes('skipWaiting()')) throw new Error('The install handler must not activate updates unconditionally.');
if (!template.includes('function shouldCache(')) throw new Error('The worker must expose a pure response-cache decision.');
if (!/older\.slice\(1\)/.test(template)) throw new Error('Activation must keep the previous build’s shell for tabs still running it.');

/* Execute the actual fetch handler with two installed builds. Stable URLs must
   read this build, while a running older tab may still load its hashed chunk. */
const cacheContents = new Map([
  ['jaswa-shell-1-old', new Map([['/manifest.webmanifest', 'old manifest'], ['/assets/previous-hash.js', 'previous chunk'], ['/old-icon.png', 'old icon']])],
  ['jaswa-shell-2-current', new Map([['/manifest.webmanifest', 'current manifest']])],
  ['jaswa-artwork', new Map([['/monster-images/test.png', 'artwork']])],
]);
const handlers = new Map();
const pathOf = (request) => typeof request === 'string' ? request : new URL(request.url).pathname;
runInNewContext(template.replace('__JASWA_PRECACHE_FILES__', '[]').replaceAll('__JASWA_PRECACHE_HASH__', 'current').replace('__JASWA_BUILD_ORDER__', '2'), {
  URL,
  self: { location: { origin: 'https://jaswa.test' }, addEventListener: (type, handler) => handlers.set(type, handler) },
  caches: {
    open: async (name) => ({ match: async (request) => cacheContents.get(name)?.get(pathOf(request)) }),
    match: async (request) => [...cacheContents.values()].map((cache) => cache.get(pathOf(request))).find(Boolean),
  },
  fetch: async (request) => ({ ok: false, headers: new Headers(), value: `network:${pathOf(request)}` }),
});
async function fetchAsset(path) {
  let answer;
  handlers.get('fetch')({ request: { method: 'GET', url: `https://jaswa.test${path}`, mode: 'cors' },
    respondWith: (value) => { answer = value; }, waitUntil: () => {} });
  return answer;
}
assert.equal(await fetchAsset('/manifest.webmanifest'), 'current manifest');
assert.equal(await fetchAsset('/assets/previous-hash.js'), 'previous chunk');
assert.equal((await fetchAsset('/old-icon.png')).value, 'network:/old-icon.png');
assert.equal(await fetchAsset('/monster-images/test.png'), 'artwork');

/* This check runs inside `npm run lint`, where `dist/` may be missing or built
   from older sources. Neither is a failure of the sources; the build assertions
   then wait for the next `npm run build`, which says so rather than passing. */
const sourcesChangedAt = Math.max(...[templatePath, resolve(repositoryRoot, 'vite.config.ts')].map((path) => statSync(path).mtimeMs));
if (!existsSync(builtWorkerPath) || statSync(builtWorkerPath).mtimeMs < sourcesChangedAt) {
  console.log(`PASS: service-worker source policy and pure cache decision are structurally verified; build output is ${existsSync(builtWorkerPath) ? 'older than its sources' : 'absent'}, so build assertions wait for npm run build.`);
  process.exit(0);
}

const source = await readFile(builtWorkerPath, 'utf8');
const filesMatch = source.match(/const PRECACHE_FILES = (\[[\s\S]*?\]);\s*const PRECACHE_HASH = '([a-f0-9]+)';/);
if (!filesMatch) throw new Error('The emitted service worker must contain an injected precache list and hash.');
const files = JSON.parse(filesMatch[1]);
if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) throw new Error('The injected precache list must be an array of paths.');

const expectedHash = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
if (filesMatch[2] !== expectedHash) throw new Error(`The precache hash ${filesMatch[2]} does not match the injected list (${expectedHash}).`);
const cacheMatch = source.match(/const SHELL_CACHE = 'jaswa-shell-(\d+)-([a-f0-9]+)';/);
if (!cacheMatch || cacheMatch[2] !== expectedHash) throw new Error('The shell cache name must carry its build order and the precache-list hash.');
if (!source.includes("const ARTWORK_CACHE = 'jaswa-artwork';")) throw new Error('Artwork must use a stable cache separate from shell caches.');
if (source.includes('precache-manifest.json')) throw new Error('The emitted worker must not fetch a separate precache manifest.');

const outputFiles = new Set();
const collectOutputFiles = async (directory, prefix = '') => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collectOutputFiles(resolve(directory, entry.name), relativePath);
    else outputFiles.add(relativePath.replaceAll('\\', '/'));
  }
};
await collectOutputFiles(distDirectory);
for (const file of files) {
  if (!file.startsWith('/')) throw new Error(`Precache entry is not an absolute URL path: ${file}`);
  if (file.toLowerCase().endsWith('.map')) throw new Error(`Source maps must not be precached: ${file}`);
  if (file.toLowerCase().endsWith('.exe')) throw new Error(`Helper installers must not be precached: ${file}`);
  if (file.toLowerCase().endsWith('.html') && file !== '/index.html') throw new Error(`Only index.html may be an HTML precache entry: ${file}`);
  if (file === '/') continue;
  if (!outputFiles.has(file)) throw new Error(`Precache entry is missing from the build output: ${file}`);
}

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name} in emitted worker.`);
  const opening = sourceText.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < sourceText.length; index += 1) {
    if (sourceText[index] === '{') depth += 1;
    if (sourceText[index] === '}' && --depth === 0) return sourceText.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name} from emitted worker.`);
}

const decisionCode = ['isNavigationRequest', 'isExcludedPath', 'shouldCache']
  .map((name) => extractFunction(source, name))
  .join('\n');
const { shouldCache } = new Function('URL', 'Headers', `${decisionCode}; return { shouldCache };`)(URL, Headers);
const request = (url, mode = 'cors', accept = 'application/javascript') => ({
  method: 'GET',
  url,
  mode,
  headers: new Headers({ accept }),
});
const response = (contentType, type = 'basic') => ({
  ok: true,
  type,
  headers: new Headers({ 'content-type': contentType }),
});
const origin = 'https://jaswa.test';
if (shouldCache(request(`${origin}/assets/page.js`), response('text/html'), origin)) throw new Error('A script URL answered with HTML must not be cached.');
if (!shouldCache(request(`${origin}/monster-images/unit.png`), response('image/png'), origin)) throw new Error('A same-origin image response should be cacheable.');
if (shouldCache(request(`${origin}/`, 'navigate', 'text/html'), response('text/html'), origin)) throw new Error('Navigation responses must not enter the runtime cache decision.');
if (shouldCache(request('https://cdn.example.test/image.png'), response('image/png'), origin)) throw new Error('Cross-origin responses must not be cached.');
if (shouldCache(request(`${origin}/JASWA-Helper-Setup-1.0.58.exe`), response('application/octet-stream'), origin)) throw new Error('Helper downloads must not be cached.');

console.log(`PASS: emitted service worker precaches ${files.length} build files in jaswa-shell-${cacheMatch[1]}-${expectedHash}, preserves jaswa-artwork, and passes cache-decision cases.`);
