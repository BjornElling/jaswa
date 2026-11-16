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
  status: { version, updateVersion: null, hasProfile: false, gameRunning: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: null, updatedAt: null, missedChanges: [] },
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
        if (command === 'download_update') return `Downloading helper ${window.dashboard.status.updateVersion} — run the installer to update.`;
        if (command === 'save_error_report') return 'Saved a private error report. Send it to the developer.';
        if (command === 'restart_helper') {
          if (window.recoveryFailure) throw window.recoveryFailure;
          if (window.dashboard.status.hasProfile && window.dashboard.status.missedChanges.length) {
            return 'Connections recovered, but live import still has a gap. Reopen Summoners War for a complete account. Your account and error evidence were kept.';
          }
          return window.dashboard.status.hasProfile
            ? 'Helper connections recovered. Your account and session were kept; Summoners War can stay open.'
            : 'Helper connections recovered. Waiting for an account login from Summoners War.';
        }
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
  /* No update known: the sixth cell is already there, quiet and disabled, and
     the title bar's mark is unlit. */
  const update = page.locator('.tool-grid button.update');
  assert.equal(await update.textContent(), 'No newer version');
  assert.equal(await update.isDisabled(), true);
  const mark = () => page.locator('.version-mark').evaluate((node) => getComputedStyle(node).opacity);
  assert.equal(await mark(), '0');
  assert.equal(await page.locator('header').count(), 0, 'the wordmark is not repeated below the title bar');

  /* Every control in the window, not just the two primary ones: the capture
     card and the activity box each absorb their own long text, and neither may
     move a button when they do. The caption buttons are excluded — they belong
     to the frame, and are checked separately below. */
  const boxes = () => page.locator('main button').evaluateAll((buttons) => buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect(); return { x, y, width, height };
  }));
  const before = await boxes();
  await page.screenshot({ path: resolve(output, 'helper-empty-before-recovery.png'), fullPage: true });
  await page.getByRole('button', { name: 'Restart helper' }).click();
  assert.ok(await page.evaluate(() => window.commands.includes('restart_helper')));
  await page.locator('.activity-text').filter({ hasText: 'Helper connections recovered. Waiting' }).waitFor();
  await headline('Waiting for Summoners War').waitFor();
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-empty-after-recovery.png'), fullPage: true });

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
    await page.evaluate((value) => { window.dashboard.status = value; }, { version, updateVersion: null, updatedAt: '2026-09-06T12:00:00Z', missedChanges: [], gameRunning: true, ...status });
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
  await page.getByRole('button', { name: 'Close helper' }).click();
  assert.equal(await page.evaluate(() => window.commands.at(-1)), 'plugin:window|close');
  const destination = page.getByRole('switch', { name: 'Minimise to' });
  const destinationBox = await destination.boundingBox();
  const destinationTextBox = await page.locator('#minimize-destination').boundingBox();
  await page.screenshot({ path: resolve(output, 'helper-captured-tray.png'), fullPage: true });
  await destination.click();
  assert.deepEqual(await destination.boundingBox(), destinationBox);
  assert.deepEqual(await page.locator('#minimize-destination').boundingBox(), destinationTextBox);
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-captured-taskbar.png'), fullPage: true });
  await destination.click();
  const captured = await page.evaluate(() => structuredClone(window.dashboard));
  await page.getByRole('button', { name: 'Restart helper' }).click();
  await page.locator('.activity-text').filter({ hasText: 'Your account and session were kept' }).waitFor();
  await headline('Account captured').waitFor();
  assert.deepEqual(await page.evaluate(() => window.dashboard), captured);
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-captured-after-recovery.png'), fullPage: true });
  await page.evaluate(() => { window.recoveryFailure = 'Connections recovered, but account changes are missing or unreadable.'; });
  await page.getByRole('button', { name: 'Restart helper' }).click();
  await page.locator('.activity-error').filter({ hasText: 'account changes are missing or unreadable' }).waitFor();
  assert.deepEqual(await boxes(), before);
  assert.deepEqual(await page.evaluate(() => window.dashboard), captured);
  await page.evaluate(() => { window.recoveryFailure = null; });
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
  /* A missed change is a gap to know about, never a stop: the card warns and
     names the command, and capture goes on. One command, then the same one
     repeated beside forty others, which the card names once each and trims. */
  const missed = (command, cause = 'unread') => ({ command, reason: '1 rune record at gift_box.rune was not read', cause });
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live', missedChanges: [missed('FutureRuneGift')] },
    'Following your account, with a gap', '(FutureRuneGift). Everything else keeps arriving');
  await page.screenshot({ path: resolve(output, 'helper-missed-one.png'), fullPage: true });
  const gapped = await page.evaluate(() => structuredClone(window.dashboard));
  const gapBoxes = await boxes();
  await page.getByRole('button', { name: 'Restart helper' }).click();
  await page.locator('.activity-text').filter({ hasText: 'live import still has a gap' }).waitFor();
  await headline('Following your account, with a gap').waitFor();
  assert.deepEqual(await page.evaluate(() => window.dashboard), gapped);
  assert.deepEqual(await boxes(), gapBoxes);
  await page.screenshot({ path: resolve(output, 'helper-missed-after-recovery.png'), fullPage: true });
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live',
      missedChanges: [missed('FutureRuneGift'), ...Array.from({ length: 40 }, (_, index) => missed(`FutureCommandWithALongName${index}`)), missed('FutureRuneGift')] },
    'Following your account, with a gap', 'FutureCommandWithALongName1 and 38 more). Everything else keeps arriving');
  assert.equal((await page.locator('.capture .detail').textContent()).split('FutureRuneGift').length, 2, 'each command is named once');
  await page.screenshot({ path: resolve(output, 'helper-missed-many.png'), fullPage: true });
  /* An encrypted miss is the game's own limit: the card says so, asks for no
     error report about it, and still reads as a gap. Beside an unread miss,
     each sentence names only its own kind, so the Raid sentence can never read
     as the reason the other command was missed. */
  const encrypted = (command) => missed(command, 'encrypted');
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live',
      missedChanges: [encrypted('BattleRiftOfWorldsRaidResult'), encrypted('BattleRiftOfWorldsRaidResult')] },
    'Following your account, with a gap', 'Rift Raid rewards are encrypted with a private game-session key — no JASWA or helper update can read them passively');
  const raidDetail = await page.locator('.capture .detail').textContent();
  assert.ok(!raidDetail.includes('BattleRiftOfWorldsRaidResult') && !raidDetail.includes('error report'), raidDetail);
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-missed-raid.png'), fullPage: true });
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live',
      missedChanges: [encrypted('BattleRiftOfWorldsRaidResult'), missed('sellSummonPieces')] },
    'Following your account, with a gap', 'Rift Raid rewards use a private key; no update can read them passively. Unread: sellSummonPieces; save an error report.');
  await page.screenshot({ path: resolve(output, 'helper-missed-raid-and-one.png'), fullPage: true });
  /* The cause, not the command, decides: a Raid result the helper merely failed
     to read is a reader to fix, and another command sealed with the session key
     is the game's limit under its own name. */
  await state(
    { hasProfile: true, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: 'live',
      missedChanges: [missed('BattleRiftOfWorldsRaidResult'), encrypted('FutureSealedAnswer')] },
    'Following your account, with a gap', 'FutureSealedAnswer answers use a private key; no update can read them passively. Unread: BattleRiftOfWorldsRaidResult;');
  await state(
    { hasProfile: false, profileReady: false, restartRequired: true, gameStartedBeforeHelper: true, gameLoginPending: false, lastError: null, source: null },
    'Summoners War was already open', 'found Summoners War running as it started');
  await page.screenshot({ path: resolve(output, 'helper-restart.png'), fullPage: true });
  await state(
    { hasProfile: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: true, lastError: null, source: null },
    'Summoners War is connected', 'has not received an account login');
  await page.screenshot({ path: resolve(output, 'helper-login-pending.png'), fullPage: true });
  await state(
    { hasProfile: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: null },
    'Summoners War is running', 'Waiting for the login that carries your account');
  await page.screenshot({ path: resolve(output, 'helper-game-starting.png'), fullPage: true });
  /* A closed game leaves nothing behind: the helper ends its snapshot, gaps
     and errors with it, so the card is back to plain waiting. */
  await state(
    { hasProfile: false, gameRunning: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: null, source: null },
    'Waiting for Summoners War', 'Open Summoners War on Steam');
  await page.screenshot({ path: resolve(output, 'helper-game-closed.png'), fullPage: true });

  /* JASWA announced a newer helper. The control that was already in the
     sixth cell lights up and names it; the title bar's mark lights; Activity
     carries both numbers. Nothing else moves, the title bar included. */
  const titleBar = () => page.locator('.titlebar > *').evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
  }));
  const frame = await titleBar();
  await page.screenshot({ path: resolve(output, 'helper-update-before.png'), fullPage: true });
  await page.evaluate(() => { window.dashboard.status = { ...window.dashboard.status, updateVersion: '9.9.9' }; });
  await page.getByRole('button', { name: 'Update to v9.9.9' }).waitFor();
  assert.equal(await update.isDisabled(), false);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.version-mark')).opacity === '1');
  assert.match(await page.locator('.titlebar .version').getAttribute('aria-label'), /version 9\.9\.9 available/);
  await page.locator('.activity-text').filter({ hasText: `Helper 9.9.9 is available — this is ${version}.` }).waitFor();
  assert.deepEqual(await boxes(), before);
  assert.deepEqual(await titleBar(), frame);
  await update.click();
  await page.locator('.activity-text').filter({ hasText: 'Downloading helper 9.9.9 — run the installer' }).waitFor();
  assert.ok(await page.evaluate(() => window.commands.includes('download_update')));
  assert.deepEqual(await boxes(), before);
  await page.screenshot({ path: resolve(output, 'helper-update-after.png'), fullPage: true });

  await page.evaluate((version) => {
    window.dashboard.status = { version, updateVersion: '1234.5678.9012', hasProfile: true, gameRunning: true, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, lastError: 'Capture failed. '.repeat(60), source: 'live', updatedAt: '2026-09-06T12:00:00Z', missedChanges: [] };
    window.dashboard.traffic = { enabled: true, entries: 999999999, recorded: true, full: false, lastError: 'Disk write failed. '.repeat(60) };
  }, version);
  await headline('Capture stopped').waitFor();
  /* A long version still fits its cell rather than widening the grid. */
  await page.getByRole('button', { name: 'Update to v1234.5678.9012' }).waitFor();
  assert.equal(await update.evaluate((node) => node.scrollWidth <= node.clientWidth), true, 'a long version must fit the update button');
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

  /* Both destinations persist without moving the surrounding controls. */
  const setting = page.getByRole('switch', { name: 'Minimise to' });
  assert.equal(await setting.getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('#minimize-destination').textContent(), 'System tray');
  const settingsBox = await setting.boundingBox();
  assert.equal(settingsBox.height, 16);
  assert.equal(settingsBox.width, 28);
  const look = () => setting.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, edge: getComputedStyle(node).boxShadow }));
  await page.mouse.move(0, 0);
  const resting = await look();
  await page.locator('#minimize-destination').hover();
  assert.deepEqual(await look(), resting, 'hovering the separate text must not light the track');
  await setting.hover();
  assert.equal((await look()).background, resting.background);
  assert.notEqual((await look()).edge, resting.edge, 'only the track edge lights on hover');
  await page.screenshot({ path: resolve(output, 'helper-tray-setting.png'), fullPage: true });
  await page.getByRole('button', { name: 'Minimise' }).click();
  assert.equal(await page.evaluate(() => window.commands.at(-1)), 'plugin:window|hide');
  await setting.click();
  assert.deepEqual(await setting.boundingBox(), settingsBox);
  assert.deepEqual(await boxes(), before);
  await page.getByRole('button', { name: 'Minimise' }).click();
  assert.equal(await page.evaluate(() => window.commands.at(-1)), 'plugin:window|minimize');
  await page.screenshot({ path: resolve(output, 'helper-taskbar-setting.png'), fullPage: true });
  await page.reload();
  await headline('Waiting for Summoners War').waitFor();
  assert.equal(await setting.getAttribute('aria-checked'), 'false');
  assert.equal(await page.locator('#minimize-destination').textContent(), 'Taskbar');
  await setting.focus();
  await page.keyboard.press('Space');
  await page.reload();
  await headline('Waiting for Summoners War').waitFor();
  assert.equal(await setting.getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('#minimize-destination').textContent(), 'System tray');
  await page.getByRole('button', { name: 'Close helper' }).click();
  assert.equal(await page.evaluate(() => window.commands.at(-1)), 'plugin:window|close');

  assert.deepEqual(errors, []);
  console.log('Helper dashboard: empty and populated states, restart command, report consent, traffic toggle, caption buttons, update offer and rejected IPC passed. All controls keep identical bounds. Screenshots: outputs/helper-hardening.');
} finally { await browser.close(); }
