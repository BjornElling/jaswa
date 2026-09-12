import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

test('confirms a JSON import above the Home status without moving it', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('2 monsters · 0 runes · 4 artifacts');
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-visible.png') });

  const loadedData = page.locator('.loaded-data');
  const whileConfirmed = await loadedData.boundingBox();
  expect(whileConfirmed).not.toBeNull();

  await expect(confirmation).toBeHidden({ timeout: 5_000 });
  const afterConfirmation = await loadedData.boundingBox();
  expect(afterConfirmation).toEqual(whileConfirmed);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-dismissed.png') });
});
