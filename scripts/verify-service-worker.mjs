import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
if (!source.includes("fetch('/precache-manifest.json'")) throw new Error('The service worker must consume the generated precache manifest.');
if (!source.includes("event.request.mode === 'navigate'")) throw new Error('The service worker must identify navigation requests explicitly.');
if (!source.includes('if (navigation) return caches.match(APP_SHELL);')) throw new Error('Only navigation requests may fall back to the app shell.');
if (/catch\(async \(\) => \(await caches\.match\(event\.request\)\) \?\? \(await caches\.match\(APP_SHELL\)\)/.test(source)) throw new Error('A failed asset request must not receive cached HTML.');
console.log('Service worker uses generated precache data and navigation-only HTML fallback.');
