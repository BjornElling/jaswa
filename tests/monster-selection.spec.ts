import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const selectionAccount = fileURLToPath(new URL('./fixtures/monster-selection.json', import.meta.url));

test('filters Storage through awakened identities while keeping collaboration lineages separate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(selectionAccount);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();
  await expect(page.getByText('Only show if', { exact: true })).toBeVisible();

  const storage = page.locator('.storage-grid tbody');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');
  await page.getByRole('checkbox', { name: 'Already have lvl 40 of this mon' }).check();
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).toContainText('RYU (Fire)');

  await page.getByRole('checkbox', { name: 'All lvl 40 of this family max skilled' }).check();
  /* The collaboration Striker is a separate lineage, so only three rows pass:
     the awakened Neostone Fighter, its Lv. 40 evidence, and the separate RYU
     lineage that has its own Lv. 40 copy. */
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('3 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).toContainText('RYU (Fire)');

  /* The evidence for the hidden rows sits in Inventory. Hiding that location
     removes those rows from the table, but it must not withdraw their evidence
     from the account-level index. The one remaining storage row still passes. */
  await page.getByRole('checkbox', { name: 'Inventory' }).uncheck();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).not.toContainText('RYU (Fire)');
});
