import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const selectionAccount = fileURLToPath(new URL('./fixtures/monster-selection.json', import.meta.url));

test('filters Storage through awakened and collaboration monster identities', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(selectionAccount);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Storage' }).click();
  await expect(page.getByText('Only show if', { exact: true })).toBeVisible();

  const storage = page.locator('.storage-grid tbody');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');
  await page.getByRole('checkbox', { name: 'Already have lvl 40 of this mon' }).check();
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');

  await page.getByRole('checkbox', { name: 'All lvl 40 of this family max skilled' }).check();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('2 of 2 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');
});
