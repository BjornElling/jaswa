import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hooks = await readFile(resolve(helper, 'src-tauri/windows/hooks.nsh'), 'utf8');
const config = JSON.parse(await readFile(resolve(helper, 'src-tauri/tauri.conf.json'), 'utf8'));
const packager = await readFile(resolve(helper, 'scripts/package.cjs'), 'utf8');
assert.equal(config.build.beforeBundleCommand,
  'node src-tauri/sign.cjs src-tauri/target/release/jaswa-helper.exe',
  'the program must be signed before NSIS embeds it; signCommand signs only the installer and uninstaller');
assert.match(packager, /\['verify', '\/pa', '\/tw', path\.join\(tauriDirectory, 'target', 'release', 'jaswa-helper\.exe'\)\]/,
  'packaging must verify the embedded program as well as the installer');

for (const macro of ['NSIS_HOOK_PREINSTALL', 'NSIS_HOOK_PREUNINSTALL']) {
  const start = hooks.indexOf(`!macro ${macro}`);
  const end = hooks.indexOf('!macroend', start);
  assert.ok(start >= 0 && end > start, `${macro} must be defined`);
  const body = hooks.slice(start, end);
  const stop = body.indexOf('taskkill.exe');
  const cleanup = body.indexOf('--jaswa-cleanup');
  assert.ok(stop >= 0, `${macro} must close a running helper`);
  assert.ok(cleanup > stop, `${macro} must clean up only after the helper has stopped`);
  assert.match(body, /MB_OKCANCEL/, `${macro} must let the user cancel before closing the helper`);
  assert.match(body, /\$0 == 128/, `${macro} must accept taskkill's harmless “not running” result`);
  assert.match(body, /Sleep 1000/, `${macro} must wait for Windows to release the helper process`);
  assert.match(body, /Goto (?:un)?closeHelperDone/, `${macro} must verify the helper is gone before cleanup`);
}

console.log('Installer upgrade flow closes a running helper with consent, waits until Windows confirms it is gone, then cleans its redirect; uninstall follows the same order.');
