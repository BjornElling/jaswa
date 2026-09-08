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
  status: { version: '1.0.1', hasProfile: false, profileReady: false, restartRequired: false, lastError: null, source: null, updatedAt: null },
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
  /* Every control in the window, not just the two primary ones: the
     troubleshooting block reserves its own height for the traffic line, and a
     long error there must not move the four buttons above it either. */
  const boxes = () => page.locator('button').evaluateAll((buttons) => buttons.map((button) => {
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
  /* The four healthy and waiting states the old check never drove. This is
     where the misleading copy lived: a connected, capturing helper still read
     "Open Summoners War on Steam", because the headline was derived from the
     status and the explanation beneath it was a constant. Each state now
     asserts its own explanation, so the two cannot drift apart again. */
  const state = async (status, headline, detail) => {
    await page.evaluate((value) => { window.dashboard.status = value; }, { version: '1.0.1', updatedAt: '2026-09-06T12:00:00Z', ...status });
    await page.getByText(headline, { exact: true }).waitFor();
    await page.locator('.capture .detail').filter({ hasText: detail }).waitFor();
    assert.deepEqual(await boxes(), before);
  };
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, lastError: null, source: 'game-start' },
    'Account captured', 'read your account when the game logged in');
  await page.screenshot({ path: resolve(output, 'helper-captured.png'), fullPage: true });
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, lastError: null, source: 'live' },
    'Following your account', 'keeps up with what you do in the game');
  await page.screenshot({ path: resolve(output, 'helper-live.png'), fullPage: true });
  await state(
    { hasProfile: false, profileReady: false, restartRequired: true, lastError: null, source: null },
    'Summoners War logged in too early', 'Quit Summoners War and open it again');
  await page.screenshot({ path: resolve(output, 'helper-restart.png'), fullPage: true });
  await state(
    { hasProfile: true, profileReady: false, restartRequired: false, lastError: null, source: 'live' },
    'Summoners War is not running', 'Open the game to capture a fresh one');
  await page.screenshot({ path: resolve(output, 'helper-game-closed.png'), fullPage: true });

  await page.evaluate(() => {
    window.dashboard.status = { version: '1.0.1', hasProfile: true, profileReady: false, restartRequired: false, lastError: 'Capture failed. '.repeat(60), source: 'live', updatedAt: '2026-09-06T12:00:00Z' };
    window.dashboard.traffic = { enabled: true, entries: 999999999, recorded: true, full: false, lastError: 'Disk write failed. '.repeat(60) };
  });
  await page.getByText('Capture stopped', { exact: true }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-full-errors.png'), fullPage: true });
  await page.evaluate(() => { window.statusFailure = true; });
  await page.getByRole('status').filter({ hasText: 'Backend status failed' }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-status-failure.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Helper release dashboard: waiting, captured, live, restart-required, game-closed, long errors, report consent, traffic toggle and rejected IPC passed. Each state states its own explanation, and all six controls keep identical bounds throughout. Screenshots: outputs/helper-hardening.');
} finally { await browser.close(); }
