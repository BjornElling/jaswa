import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const normalShrineAccount = fileURLToPath(new URL('./fixtures/normal-sealed-shrine.json', import.meta.url));

test('shows normal sealed-shrine monsters when the source is selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Storage' }).click();
  await expect(page.getByText('Import your game data first. Monster Storage will appear here when JASWA has an account to inspect.')).toBeVisible();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(normalShrineAccount);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();

  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('2 of 2 shown');
  await expect(page.locator('.storage-grid tbody tr')).toHaveCount(2);
  await expect(page.locator('.storage-grid tbody')).toContainText('Sealed Shrine · Normal');
  await expect(page.getByRole('checkbox', { name: 'Sealed Shrine · Normal' })).toBeChecked();
});
