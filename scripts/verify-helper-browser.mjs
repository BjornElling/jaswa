import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

/* Read the recommended version rather than restating it. A literal here is one
   more copy to bump, and the copy nobody remembers — it would fail the next
   release for no reason other than its own staleness. */
const recommended = (await readFile('app/lib/helper-version.ts', 'utf8')).match(/recommendedHelperVersion = '(\d+\.\d+\.\d+)'/)[1];
const installerName = `JASWA-Helper-Setup-${recommended}.exe`;
/* A helper older than any release, so the update box must appear for it
   whatever the current version is, and then disappear once the helper reports
   the recommended one. */
const outdated = '0.0.1';

const origin = 'http://localhost:3000';
assert.equal((await fetch(origin)).status, 200);
let account;
for await (const line of createInterface({ input: createReadStream(path.join(process.env.LOCALAPPDATA, 'JASWA Helper/traffic.log')), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const entry = JSON.parse(line);
  if (['HubUserLogin', 'GuestLogin'].includes(entry.command)) account = entry.response;
}
assert.ok(account, 'A real captured account is required for the full state');
await mkdir('outputs/helper-hardening', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let mode = 'broken-profile';
  let instance = 'first-helper';
  let revision = 1;
  let version = outdated;
  await page.route('http://127.0.0.1:37654/**', async (route) => {
    const health = route.request().url().endsWith('/health');
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-private-network': 'true' };
    const data = structuredClone(account);
    if (mode === 'unreadable') data.artifacts[0].type = 999;
    const body = health ? { running: true, version, profileReady: mode !== 'capture-error', restartRequired: false, revision, sessionId: 1, instanceId: instance, lastError: mode === 'capture-error' ? 'Capture failed. Save an error report, then restart Summoners War.' : null }
      : mode === 'broken-profile' ? { invalid: true }
      : { updatedAt: '2026-09-06T12:00:00Z', revision, sessionId: 1, instanceId: instance, source: 'game-start', data };
    await route.fulfill({ status: 200, headers, json: body });
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('input[name="import-route"][value="direct"]').check();
  const downloadLink = page.getByRole('link', { name: 'Download helper' });
  assert.equal(await downloadLink.getAttribute('href'), `/${installerName}`);
  assert.equal(await downloadLink.getAttribute('download'), installerName);
  await page.getByText('Helper is tired, boss').first().waitFor();
  await page.getByText(`Version ${recommended} is now available.`).first().waitFor();
  await page.getByText(/invalid snapshot envelope/).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: 'outputs/helper-hardening/app-empty-profile-error.png', fullPage: true });
  const readGame = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('jaswa-local');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('workspace').objectStore('workspace').get('imported-game');
      request.onsuccess = () => { open.result.close(); resolve(request.result?.helperSession ?? null); };
    };
  }));
  mode = 'valid';
  version = recommended;
  await page.waitForFunction(() => !document.body.textContent.includes('invalid snapshot envelope'), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.body.textContent.includes('Helper is tired, boss'), null, { timeout: 20000 });
  assert.equal(await page.getByText('Helper is tired, boss').count(), 0, 'a current helper leaves no update box behind');
  for (let attempt = 0; attempt < 30 && !(await readGame()); attempt += 1) await page.waitForTimeout(500);
  assert.equal((await readGame()).instanceId, instance);
  await page.screenshot({ path: 'outputs/helper-hardening/app-full-import.png', fullPage: true });
  await page.locator('input[name="direct-import-mode"][value="live"]').click();
  await page.getByRole('button', { name: 'Switch mode' }).click();
  instance = 'restarted-helper';
  for (let attempt = 0; attempt < 30 && (await readGame()).instanceId !== instance; attempt += 1) await page.waitForTimeout(500);
  assert.equal((await readGame()).instanceId, instance, 'a restarted helper with the same revision must import');
  const controls = () => page.locator('input[name="direct-import-mode"], .route-download button').evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
  }));
  const beforeError = await controls();
  mode = 'capture-error';
  await page.getByText(/Capture failed. Save an error report/).first().waitFor({ timeout: 20000 });
  assert.equal((await readGame()).instanceId, instance, 'the last good import remains saved');
  assert.equal((await controls()).length, beforeError.length, 'capture failure keeps the route controls available');
  await page.screenshot({ path: 'outputs/helper-hardening/app-full-capture-error.png', fullPage: true });
  mode = 'unreadable';
  instance = 'unreadable-helper';
  revision += 1;
  await page.getByText(/Use Report Issue to send the details/).first().waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole('button', { name: 'Save import report' }).count(), 0, 'the old split import-report action is gone');
  await page.getByRole('button', { name: 'Report Issue' }).click();
  await page.getByRole('heading', { name: 'Report an issue' }).waitFor();
  await page.getByText(/account statistics included/).waitFor();
  await page.screenshot({ path: 'outputs/helper-hardening/app-report-issue.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await readGame()).instanceId, 'restarted-helper');
  assert.equal((await controls()).length, beforeError.length, 'unreadable import keeps the route controls available');
  await page.screenshot({ path: 'outputs/helper-hardening/app-unreadable-report.png', fullPage: true });
  console.log('Real app: empty malformed-profile error, full captured-account import, same-revision helper restart, and visible capture failure with the last good import preserved passed.');
} finally { await browser.close(); }
