/**
 * Uploads the game's artwork to the R2 bucket the published site reads it from.
 *
 * The images are never committed (.gitignore), so jaswa.net — built from git —
 * would otherwise have none; worker/index.ts serves them from the bucket
 * instead. Run this after `fetch:monster-images`, `fetch:rune-images` or
 * `fetch:artifact-images` has
 * brought in new artwork. Uploading a file that is already there replaces it
 * with the same bytes, so a full run is always safe.
 *
 * It uploads exactly what the committed manifests name, because those are the
 * files the published page will ask for: one present locally but missing from
 * a manifest is never requested, and one named but missing locally is a gap
 * this refuses to hide.
 *
 * Needs `npx wrangler login` once.
 *
 * Usage: npm run upload:artwork
 */
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bucket = 'jaswa-artwork';

async function manifest(file) {
  const source = await readFile(path.join(root, file), 'utf8');
  return [...source.matchAll(/^\s*'([^']+\.png)',$/gm)].map((match) => match[1]);
}

const folders = [
  ['monster-images', await manifest('app/data/local-monster-images.ts')],
  ['rune-images', await manifest('app/data/local-rune-images.ts')],
  ['artifact-images', await manifest('app/data/local-artifact-images.ts')],
];

const entries = [];
const missing = [];
for (const [folder, names] of folders) {
  if (names.length === 0) throw new Error(`The ${folder} manifest names no files; refusing to treat that as nothing to upload.`);
  for (const name of names) {
    const file = path.join(root, 'public', folder, name);
    try {
      await access(file);
      entries.push({ key: `${folder}/${name}`, file });
    } catch {
      missing.push(`${folder}/${name}`);
    }
  }
}
if (missing.length) {
  console.error(`${missing.length} file(s) the manifests name are not on disk, starting with ${missing.slice(0, 5).join(', ')}.\nRun the fetch script that writes that manifest first.`);
  process.exit(1);
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'jaswa-artwork-'));
const list = path.join(scratch, 'artwork.json');
await writeFile(list, JSON.stringify(entries));
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
console.log(`Uploading ${entries.length} images to R2 bucket ${bucket}…`);
const result = spawnSync(process.execPath, [
  wrangler, 'r2', 'bulk', 'put', bucket,
  '--filename', list,
  '--remote',
  '--content-type', 'image/png',
], { cwd: root, stdio: 'inherit' });
await rm(scratch, { recursive: true, force: true });
if (result.status !== 0) {
  console.error('The upload did not finish; run it again once the cause above is fixed.');
  process.exit(result.status ?? 1);
}
console.log(`Uploaded ${entries.length} images.`);
