import { expect, openSettingsBar, test } from './test-fixtures';
import { readFileSync } from 'node:fs';

for (const populated of [false, true]) {
  test(`preference changes survive reload in an ${populated ? 'imported' : 'empty'} workspace`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    if (populated) {
      await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
        name: 'account.json', mimeType: 'application/json',
        buffer: readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url)),
      });
      await expect(page.getByText('account.json').first()).toBeVisible();
    }
    await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await openSettingsBar(page, 'General');
    await page.screenshot({ path: testInfo.outputPath('settings-before.png') });
    await page.locator('input[name="number-format"][value="european"]').check();
    await page.locator('input[name="number-format"][value="american"]').check();
    await page.screenshot({ path: testInfo.outputPath('settings-after.png') });
    await page.reload();
    await expect(page.locator('input[name="number-format"][value="american"]')).toBeChecked();
    if (populated) {
      await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
      await expect(page.getByText('account.json').first()).toBeVisible();
    }
  });
}

test('reports an unreadable preference store when no mirror can recover it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => localStorage.removeItem('jaswa-preferences'));
  await page.screenshot({ path: testInfo.outputPath('before-failure.png') });
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (key === 'preferences') throw new Error('Preference read unavailable');
      return get.call(this, key);
    };
  });
  await page.reload();
  await expect(page.getByText('JASWA could not read part of the saved workspace. Reload to try again.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('after-failure.png') });
});

test('shows recovered choices without overwriting an unread database', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await openSettingsBar(page, 'General');
  await page.locator('input[name="number-format"][value="american"]').check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}').general?.numberFormat)).toBe('american');
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (key === 'preferences') throw new Error('Preference read unavailable');
      return get.call(this, key);
    };
  });
  await page.reload();
  await expect(page.locator('input[name="number-format"][value="american"]')).toBeChecked();
  await expect(page.getByRole('status', { name: 'Preferences storage' })).toContainText('Reload to read your saved preferences');
  await page.locator('input[name="number-format"][value="european"]').check();
  await expect(page.getByRole('status', { name: 'Preferences storage' })).toContainText('Reload to read your saved preferences');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}').general?.numberFormat)).toBe('american');
});

test('reports a failed recovery copy on the page where the choice was made', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await openSettingsBar(page, 'General');
  const panel = page.locator('details.bar').filter({ has: page.locator('summary', { hasText: 'General' }) }).locator('.panel').first();
  const before = await panel.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('before-mirror-failure.png') });
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jaswa-preferences') throw new Error('Mirror unavailable');
      return setItem.call(this, key, value);
    };
  });
  await page.locator('input[name="number-format"][value="american"]').check();
  await expect(page.getByRole('status', { name: 'Preferences storage' })).toContainText('quick recovery copy could not be saved');
  expect(await panel.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('after-mirror-failure.png') });
  await page.reload();
  await expect(page.locator('input[name="number-format"][value="american"]')).toBeChecked();
});
