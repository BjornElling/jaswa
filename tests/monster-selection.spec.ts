import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const selectionAccount = fileURLToPath(new URL('./fixtures/monster-selection.json', import.meta.url));

test('filters Storage through awakened identities while keeping collaboration lineages separate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(selectionAccount);
  await page.getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();
  await expect(page.getByText('Only show if', { exact: true })).toBeVisible();

  const storage = page.locator('.storage-grid tbody');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');
  await page.getByRole('checkbox', { name: 'Already have lvl 40 of this mon' }).check();
  /* The Lv. 40 Trevor and RYU are the evidence, not the answer, so they leave
     the table; the collaboration Striker is a separate lineage with no Lv. 40
     of its own, so only the unawakened Neostone Fighter passes. */
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).not.toContainText('RYU (Fire)');

  await page.getByRole('checkbox', { name: 'All lvl 40 of this family max skilled' }).check();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');

  /* The evidence sits in Inventory. Hiding that location must not withdraw it
     from the account-level index, so the Storage row still passes. */
  await page.getByRole('checkbox', { name: 'Inventory' }).uncheck();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).not.toContainText('RYU (Fire)');
});
