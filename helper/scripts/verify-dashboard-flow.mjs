import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/* The version the helper actually declares, not a literal to bump by hand. */
const version = JSON.parse(await readFile(resolve(root, 'helper/package.json'), 'utf8')).version;
const origin = 'http://localhost:3000';
assert.equal((await fetch(origin)).status, 200, 'Start the project server on localhost:3000');
const output = resolve(root, 'outputs/helper-hardening');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const initial = {
  status: { version, hasProfile: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: null, updatedAt: null },
  traffic: { enabled: false, entries: 0, recorded: false, full: false, lastError: null },
};
try {
  const page = await browser.newPage({ viewport: { width: 520, height: 704 } });
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
        /* The window is undecorated, so its own title bar drives minimise and
           close through the core window API — which arrives here as an
           `invoke` like any other. Record them and answer, so the caption
           buttons are exercised by this check rather than throwing. */
        if (command.startsWith('plugin:window|')) { window.commands.push(command); return null; }
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
        if (command === 'download_json') {
          if (window.downloadFailure) throw window.downloadFailure;
          return 'Saved Culpa-1.json to your Downloads folder.';
        }
        return null;
      },
    };
  }, initial);
  await page.goto(`${origin}/helper-check/`);
  /* Scoped to the card: a capture state is also an activity entry now, so an
     unscoped match for a headline finds both. */
  const headline = (text) => page.locator('.capture-headline').filter({ hasText: text });
  await headline('Waiting for Summoners War').waitFor();

  /* The window is its own frame now: the wordmark is the application's, set
     lowercase with `sw` marked, and the caption buttons are the helper's own
     rather than the system's light-grey plate. */
  assert.equal(await page.locator('.titlebar-brand').textContent(), 'jaswa helper');
  assert.equal(await page.locator('.titlebar-brand .brand-sw').textContent(), 'sw');
  assert.equal(await page.locator('.titlebar .version').textContent(), `v${version}`);
  assert.equal(await page.locator('header').count(), 0, 'the wordmark is not repeated below the title bar');

  /* Every control in the window, not just the two primary ones: the capture
     card and the activity box each absorb their own long text, and neither may
     move a button when they do. The caption buttons are excluded — they belong
     to the frame, and are checked separately below. */
  const boxes = () => page.locator('main button').evaluateAll((buttons) => buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect(); return { x, y, width, height };
  }));
  const before = await boxes();

  /* The activity box reaches the window's floor: the old layout ended with a
     56px strip and left the rest of the window empty below it. */
  const filled = await page.locator('.activity').evaluate((box) => {
    const { bottom } = box.getBoundingClientRect();
    return window.innerHeight - bottom;
  });
  assert.ok(filled <= 25, `the activity box must reach the window floor, not stop ${filled}px short`);
  /* The capture state is itself an entry, so the list is never empty for long
     — but every entry carries a time and its own words, which is exactly what
     the homeless traffic line and message strip did not. */
  await page.locator('.activity-list li').first().waitFor();
  assert.match(await page.locator('.activity-time').first().textContent(), /^\d{2}:\d{2}:\d{2}$/);
  await page.locator('.activity-text').filter({ hasText: 'Waiting for Summoners War' }).waitFor();
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
  /* The running count rides on the button, where a number that changes every
     second belongs; the activity box records only that recording started. */
  await page.getByRole('button', { name: /^Stop traffic log \(\d/, pressed: true }).waitFor();
  await page.locator('.activity-text').filter({ hasText: 'Recording traffic to your Downloads folder' }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-recording.png'), fullPage: true });
  /* The four healthy and waiting states the old check never drove. This is
     where the misleading copy lived: a connected, capturing helper still read
     "Open Summoners War on Steam", because the headline was derived from the
     status and the explanation beneath it was a constant. Each state now
     asserts its own explanation, so the two cannot drift apart again. */
  const state = async (status, title, detail) => {
    await page.evaluate((value) => { window.dashboard.status = value; }, { version, updatedAt: '2026-09-06T12:00:00Z', ...status });
    await headline(title).waitFor();
    await page.locator('.capture .detail').filter({ hasText: detail }).waitFor();
    const detailBox = await page.locator('.capture .detail').evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
    }));
    assert.equal(detailBox.overflowY, 'visible', 'the capture explanation must not become a scroll box');
    assert.ok(detailBox.scrollHeight <= detailBox.clientHeight,
      'every normal capture explanation must fit in the reserved card height');
    /* A healthy state enters the activity list as its headline alone — the
       card beside it is already showing the explanation, and repeating it made
       one state change fill the box. */
    await page.locator('.activity-text').filter({ hasText: title }).first().waitFor();
    assert.equal(await page.locator('.activity-text').filter({ hasText: detail }).count(), 0,
      'a healthy state logs its headline, not the card\'s whole explanation');
    assert.deepEqual(await boxes(), before);
  };
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'game-start' },
    'Account captured', 'read your account when the game logged in');
  await page.screenshot({ path: resolve(output, 'helper-captured.png'), fullPage: true });
  await page.getByRole('button', { name: 'Download JSON' }).click();
  assert.ok(await page.evaluate(() => window.commands.includes('download_json')),
    'the captured-account action must reach the SWEX-compatible download command');
  /* A second download overwrites the same file and replies with the same
     words. It still has to answer: collapsed as a repeat, the click looked
     dead. */
  const saved = page.locator('.activity-text').filter({ hasText: 'Saved Culpa-1.json' });
  await saved.first().waitFor();
  await page.getByRole('button', { name: 'Download JSON' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.activity-text')]
    .filter((node) => node.textContent.startsWith('Saved Culpa-1.json')).length === 2);
  /* A refusal is written in the failure colour, not the trail's grey. */
  await page.evaluate(() => { window.downloadFailure = 'Windows could not find your Downloads folder.'; });
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const refused = page.locator('.activity-error .activity-text').filter({ hasText: 'could not find your Downloads folder' });
  await refused.waitFor();
  assert.notEqual(await refused.evaluate((node) => getComputedStyle(node).color),
    await saved.first().evaluate((node) => getComputedStyle(node).color));
  await page.evaluate(() => { window.downloadFailure = undefined; });
  await page.screenshot({ path: resolve(output, 'helper-download-refused.png'), fullPage: true });
  assert.deepEqual(await boxes(), before);
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live' },
    'Following your account', 'keeps up with what you do in the game');
  await page.screenshot({ path: resolve(output, 'helper-live.png'), fullPage: true });
  await state(
    { hasProfile: false, profileReady: false, restartRequired: true, gameStartedBeforeHelper: true, gameLoginPending: false, lastError: null, source: null },
    'Summoners War was already open', 'found Summoners War running as it started');
  await page.screenshot({ path: resolve(output, 'helper-restart.png'), fullPage: true });
  await state(
    { hasProfile: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: true, lastError: null, source: null },
    'Summoners War is connected', 'has not received an account login');
  await page.screenshot({ path: resolve(output, 'helper-login-pending.png'), fullPage: true });
  await state(
    { hasProfile: true, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live' },
    'Summoners War is not running', 'Open the game to capture a fresh one');
  await page.screenshot({ path: resolve(output, 'helper-game-closed.png'), fullPage: true });

  await page.evaluate((version) => {
    window.dashboard.status = { version, hasProfile: true, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: 'Capture failed. '.repeat(60), source: 'live', updatedAt: '2026-09-06T12:00:00Z' };
    window.dashboard.traffic = { enabled: true, entries: 999999999, recorded: true, full: false, lastError: 'Disk write failed. '.repeat(60) };
  }, version);
  await headline('Capture stopped').waitFor();
  /* Two 1,200-character errors at once — one in the capture card, one in the
     activity list. Each scrolls inside its own box, so no button moves and
     nothing overflows the window. */
  await page.locator('.activity-text').filter({ hasText: 'Disk write failed.' }).first().waitFor();
  assert.deepEqual(await boxes(), before);
  assert.equal(
    await page.evaluate(() => document.body.scrollHeight > window.innerHeight || document.body.scrollWidth > window.innerWidth),
    false, 'long errors scroll inside their own boxes, never the window');
  await page.screenshot({ path: resolve(output, 'helper-full-errors.png'), fullPage: true });
  await page.evaluate(() => { window.statusFailure = true; });
  await page.locator('.activity-error').filter({ hasText: 'Backend status failed' }).waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-status-failure.png'), fullPage: true });

  /* The frame's own controls: close hides to the tray, exactly as the
     decorated window's `CloseRequested` handler did. */
  await page.getByRole('button', { name: 'Minimise' }).click();
  await page.getByRole('button', { name: 'Close to the system tray' }).click();
  const caption = await page.evaluate(() => window.commands.filter((entry) => entry.startsWith('plugin:window|')));
  assert.ok(caption.some((entry) => entry.includes('minimize')), `expected a minimize call, saw ${caption}`);
  assert.ok(caption.some((entry) => entry.includes('close')), `expected a close call, saw ${caption}`);

  assert.deepEqual(errors, []);
  console.log('Helper release dashboard: waiting, captured, live, restart-required, game-closed, long errors, report consent, traffic toggle, caption buttons and rejected IPC passed. The frame is the helper\'s own, the wordmark matches the application\'s, every state states its own explanation, the activity box reaches the window floor, and all six controls keep identical bounds throughout. Screenshots: outputs/helper-hardening.');
} finally { await browser.close(); }
