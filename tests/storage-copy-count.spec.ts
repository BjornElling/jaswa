import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const duplicateCopies = fileURLToPath(new URL('./fixtures/duplicate-storage-copies.json', import.meta.url));

/* Two shrine entries of one copy each are two copies of that monster. The
   filter used to compare against a single entry's quantity, which hid exactly
   the duplicates it was asked to find.

   The tally is read across every location, so a copy on the active roster
   counts towards it too — see `storage-filter-scope.spec.ts` for the rule and
   for what a hidden location must not change. */
test('counts separate entries of one monster as copies of it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(duplicateCopies);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();

  const summary = page.locator('.storage-filter-strip .filter-summary');
  const storage = page.getByRole('table', { name: 'Monster numbers' });
  /* Four shrine entries, plus the copy on the active roster the Inventory
     location now lists. */
  await expect(summary).toContainText('5 of 5 shown');

  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await expect(summary).toContainText('5 of 5 shown');

  /* Two monsters are held twice: Poison Master (Fire) as two shrine entries,
     and Poison Master (Light) as one shrine entry plus the copy on the active
     roster. The tally spans every location, so both qualify, and each brings
     both of its rows — four in all. The Light pair is the point: its second
     copy is the Inventory one, which a Storage-only tally would have missed. */
  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('4 of 5 shown');
  await expect(storage.locator('tbody tr')).toHaveCount(4);
  await expect(storage.locator('tbody')).toContainText('Poison Master (Fire)');
  await expect(storage.locator('tbody')).toContainText('Poison Master (Light)');
  /* Held once, so it stays out — a sibling element is a different monster. */
  await expect(storage.locator('tbody')).not.toContainText('Poison Master (Wind)');

  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('0 of 5 shown');
  await expect(page.getByText('No monsters match these filters. Clear a filter to see more.')).toBeVisible();
});
