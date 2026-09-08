import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hooks = await readFile(resolve(helper, 'src-tauri/windows/hooks.nsh'), 'utf8');

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
