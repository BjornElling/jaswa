import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
const version = /recommendedHelperVersion = '(\d+\.\d+\.\d+)'/.exec(readFileSync(new URL('../app/lib/helper-version.ts', import.meta.url), 'utf8'))![1];

test.use({ viewport: { width: 1440, height: 1100 } });

test('on-demand reload keeps the corner cards aligned and preserves the selected mode', async ({ page }, testInfo) => {
  let ready = false;
  let revision = 1;
  let reads = 0;
  const pending = { delay: Promise.resolve(), release: () => {} };
  const identity = () => ({ instanceId: 'reload-helper', sessionId: 1, revision });
  await page.route('http://127.0.0.1:37654/**', async (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (new URL(route.request().url()).pathname === '/health') {
      await route.fulfill({ headers, json: { ...identity(), running: true, version, profileReady: ready,
        missedChanges: [], lastError: ready ? null : 'Gateway exchange failed: GetDailyQuests_v2 via private-host:443, 30841 ms: TimedOut '.repeat(20),
        restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true } });
    } else {
      reads += 1;
      await pending.delay;
      const data = structuredClone(account);
      if (revision > 1) data.artifacts.pop();
      await route.fulfill({ headers, json: { ...identity(), updatedAt: new Date().toISOString(), source: 'live', data } });
    }
  });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...saved, importRoute: 'direct', directImportMode: 'on-load', updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  const status = page.getByRole('status', { name: 'Helper program connection' });
  const reload = page.getByRole('button', { name: 'Reload game data', exact: true });
  await expect(status).toContainText('Connection to the game was interrupted. Try Restart helper. Check its status for any missing game data.');
  await expect(status).not.toContainText('GetDailyQuests');
  await expect(status).not.toContainText('private-host');
  await expect(reload).toBeEnabled();
  const emptyPanels = await page.locator('.workspace-page .panel').allTextContents();
  const emptyBox = await reload.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('empty-helper-error.png') });
  await reload.click();
  await expect(reload).toBeEnabled();
  await expect(page.getByRole('status', { name: 'Game data reload failed' })).toBeVisible();
  expect(await page.locator('.workspace-page .panel').allTextContents()).toEqual(emptyPanels);
  expect(await reload.boundingBox()).toEqual(emptyBox);
  expect(reads).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('empty-after-retry.png') });

  ready = true;
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toContainText('4 artifacts');
  await expect(page.getByRole('status', { name: 'Game data loaded correctly' })).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = (await reload.boundingBox())!;
  const badgeBefore = (await badge.boundingBox())!;
  expect(before.width).toBeCloseTo(badgeBefore.width, 0);
  expect(before.height).toBeCloseTo(badgeBefore.height, 0);
  expect(before.x).toBeCloseTo(badgeBefore.x, 0);
  expect(before.y).toBeGreaterThan(badgeBefore.y + badgeBefore.height);
  await page.screenshot({ path: testInfo.outputPath('full-before-reload.png') });

  revision = 2;
  pending.delay = new Promise<void>((resolve) => { pending.release = resolve; });
  await reload.click();
  const busy = page.getByRole('button', { name: 'Reloading game data…' });
  await expect(busy).toBeDisabled();
  expect(await busy.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('full-reloading.png') });
  pending.release();
  await expect(reload).toBeEnabled();
  await expect(badge).toContainText('3 artifacts');
  expect(reads).toBe(2);
  expect(await reload.boundingBox()).toEqual(before);
  expect(await badge.boundingBox()).toEqual(badgeBefore);
  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(confirmation).toBeVisible();
  const toast = (await confirmation.boundingBox())!;
  expect(toast.y).toBeGreaterThan(before.y + before.height);
  expect(toast.width).toBeCloseTo(before.width, 0);
  await expect(page.locator('input[name="direct-import-mode"][value="on-load"]')).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('full-reloaded-confirmation.png') });

  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await expect(reload).toBeVisible();
  await reload.click();
  await expect(confirmation).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: testInfo.outputPath('reload-on-monsters.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[name="import-route"][value="file"]').check();
  await expect(reload).toHaveCount(0);
});
