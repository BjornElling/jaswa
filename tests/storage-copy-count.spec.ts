import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const duplicateCopies = fileURLToPath(new URL('./fixtures/duplicate-storage-copies.json', import.meta.url));

/* Two shrine entries of one copy each are two copies of that monster. The
   filter used to compare against a single entry's quantity, which hid exactly
   the duplicates it was asked to find. */
test('counts separate entries of one monster as copies of it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(duplicateCopies);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Storage' }).click();

  const summary = page.locator('.storage-filter-strip .filter-summary');
  const storage = page.getByRole('table', { name: 'Monsters in Storage' });
  await expect(summary).toContainText('4 of 4 shown');

  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await expect(summary).toContainText('4 of 4 shown');

  /* The account also holds a Poison Master (Light) on the active roster. Storage
     lists one of that monster, so it stays out of a "have two" list. */
  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('2 of 4 shown');
  await expect(storage.locator('tbody tr')).toHaveCount(2);
  await expect(storage.locator('tbody')).toContainText('Poison Master (Fire)');
  await expect(storage.locator('tbody')).not.toContainText('Poison Master (Light)');

  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('0 of 4 shown');
  await expect(page.getByText('No Storage monsters match these filters. Clear a filter to see more.')).toBeVisible();
});
