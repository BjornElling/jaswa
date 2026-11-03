import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const helperAccount = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const fileAccount = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));

/* One helper snapshot that never changes, served on the helper's own port.
   Unchanged is the point: the stale import survived precisely because the
   helper had nothing new to say when the user came back to it. */
async function serveHelper(page: Page) {
  const identity = { instanceId: 'test-helper', sessionId: 1, revision: 1 };
  const headers = { 'Access-Control-Allow-Origin': '*' };
  await page.route((url) => url.origin === 'http://127.0.0.1:37654' && url.pathname === '/health', (route) => route.fulfill({ headers, json: {
    ...identity, running: true, profileReady: true, missedChanges: [], lastError: null,
    restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...identity, updatedAt: new Date().toISOString(), source: 'game-start', data: helperAccount,
  } }));
}

const badge = (page: Page) => page.getByRole('complementary', { name: 'Imported game data' });
const route = (page: Page, value: 'direct' | 'file') => page.locator(`input[name="import-route"][value="${value}"]`);

for (const mode of ['live', 'on-load'] as const) {
  test(`returning to direct import (${mode}) replaces the data a JSON file loaded`, async ({ page }) => {
    await serveHelper(page);
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

    await route(page, 'direct').check();
    await expect(badge(page)).toContainText('2 monsters');
    if (mode === 'on-load') {
      await page.locator('input[name="direct-import-mode"][value="on-load"]').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Switch mode' }).click();
    }

    await route(page, 'file').click();
    if (mode === 'live') await page.getByRole('dialog').getByRole('button', { name: 'Switch mode' }).click();
    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(fileAccount);
    await page.getByRole('dialog').getByRole('button', { name: 'Replace data' }).click();
    await expect(badge(page)).toContainText('6 monsters');

    await route(page, 'direct').click();
    if (mode === 'live') await page.getByRole('dialog').getByRole('button', { name: 'Switch mode' }).click();
    await expect(badge(page)).toContainText('2 monsters');
  });
}
