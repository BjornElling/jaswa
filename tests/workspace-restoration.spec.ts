import { expect, test } from '@playwright/test';
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
