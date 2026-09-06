import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://localhost:3000';
assert.equal((await fetch(origin)).status, 200, 'Start the project server on localhost:3000');
const output = resolve(root, 'outputs/helper-hardening');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const initial = {
  status: { hasProfile: false, profileReady: false, restartRequired: false, lastError: null, source: null, updatedAt: null },
  traffic: { enabled: false, entries: 0, recorded: false, full: false, lastError: null },
};
try {
  const page = await browser.newPage({ viewport: { width: 520, height: 656 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Serve the release dashboard through the one local origin; no second server.
  await page.route(`${origin}/helper-check/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/helper-check/', '');
    const file = resolve(root, 'helper/dist', path || 'index.html');
    assert.ok(file.startsWith(resolve(root, 'helper/dist')));
    let body = await readFile(file);
    if (!path) body = Buffer.from(body.toString().replaceAll('/assets/', '/helper-check/assets/'));
    await route.fulfill({ body, contentType: !path ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'text/css' });
  });
  await page.addInitScript((initial) => {
    window.dashboard = initial;
    window.commands = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        window.commands.push(command);
        if (command === 'helper_status') {
          if (window.statusFailure) throw 'Backend status failed';
          return structuredClone(window.dashboard);
        }
        if (command === 'set_traffic_logging') {
          window.dashboard.traffic.enabled = args.enabled;
          return { deliberately: 'not a text result' };
        }
        if (command === 'save_error_report') return 'Saved a private error report. Send it to the developer.';
        return null;
      },
    };
  }, initial);
  await page.goto(`${origin}/helper-check/`);
  await page.getByText('Waiting for Summoners War', { exact: true }).waitFor();
  const boxes = () => page.locator('.actions button').evaluateAll((buttons) => buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect(); return { x, y, width, height };
  }));
  const before = await boxes();
  await page.screenshot({ path: resolve(output, 'helper-empty.png'), fullPage: true });
  assert.equal(await page.getByRole('button', { name: 'Download JSON' }).isDisabled(), true);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Save error report' }).click();
  assert.equal(await page.evaluate(() => window.commands.includes('save_error_report')), false);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Save error report' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved a private error report' }).waitFor();
  assert.deepEqual(await boxes(), before);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Log all traffic' }).click();
  await page.getByRole('button', { name: 'Stop traffic log', pressed: true }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-recording.png'), fullPage: true });
  await page.evaluate(() => {
    window.dashboard.status = { hasProfile: true, profileReady: false, restartRequired: false, lastError: 'Capture failed. '.repeat(60), source: 'live', updatedAt: '2026-09-06T12:00:00Z' };
    window.dashboard.traffic = { enabled: true, entries: 999999999, recorded: true, full: false, lastError: 'Disk write failed. '.repeat(60) };
  });
  await page.getByText('Connection needs attention', { exact: true }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-full-errors.png'), fullPage: true });
  await page.evaluate(() => { window.statusFailure = true; });
  await page.getByRole('status').filter({ hasText: 'Backend status failed' }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-status-failure.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Helper release dashboard: empty/full states, report consent, traffic toggle, long errors and rejected IPC passed. Six controls keep identical bounds. Screenshots: outputs/helper-hardening.');
} finally { await browser.close(); }
