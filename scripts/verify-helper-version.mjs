import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function versionFromCargo(source) {
  const match = source.match(/^version\s*=\s*"(\d+\.\d+\.\d+)"/m);
  assert.ok(match, 'Cargo.toml must declare a helper version');
  return match[1];
}

function versionFromApp(source) {
  const match = source.match(/recommendedHelperVersion\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(match, 'The app must declare the helper version it supports');
  return match[1];
}

const [cargo, tauri, packageJson, lock, app] = await Promise.all([
  readFile(path.join(root, 'helper/src-tauri/Cargo.toml'), 'utf8'),
  readFile(path.join(root, 'helper/src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'helper/package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'helper/package-lock.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'app/lib/helper-version.ts'), 'utf8'),
]);

const versions = {
  cargo: versionFromCargo(cargo),
  tauri: tauri.version,
  package: packageJson.version,
  lockfile: lock.packages?.['']?.version,
  app: versionFromApp(app),
};
for (const [source, version] of Object.entries(versions)) {
  assert.match(String(version), /^\d+\.\d+\.\d+$/, `${source} must use semantic patch versions`);
}
assert.equal(new Set(Object.values(versions)).size, 1, `Helper versions disagree: ${JSON.stringify(versions)}`);
console.log(`Helper version ${versions.app} is consistent across the app, Cargo, Tauri and npm metadata.`);
