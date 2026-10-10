import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const duplicateCopies = fileURLToPath(new URL('./fixtures/duplicate-storage-copies.json', import.meta.url));

/* Separate entries of one monster are separate copies, even when one is on the
   active roster and one is in a shrine. The filter used to compare against a
   single entry's quantity, which hid exactly the duplicates it was asked to find.

   The tally is read across every location, so a copy on the active roster
   counts towards it too — see `storage-filter-scope.spec.ts` for the rule and
   for what a hidden location must not change. */
test('counts separate entries of one monster as copies of it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(duplicateCopies);
  await page.getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();

  const summary = page.locator('.storage-filter-strip .filter-summary');
  const storage = page.getByRole('table', { name: 'Monster numbers' });
  /* Four table rows: the level-one Fire entries are one row with quantity two
     even though one is in Inventory and one is in the Sealed Shrine, while the
     level-40 copies merge when their grade and skills match, while the
     level-one Light copy stays separate because its level differs. */
  await expect(summary).toContainText('4 of 4 shown');
  await expect(storage.locator('tbody tr')).toHaveCount(4);
  await expect(storage.locator('tbody tr').filter({ hasText: 'Poison Master (Fire)' })).toHaveCount(1);
  await expect(storage.locator('tbody tr').filter({ hasText: 'Poison Master (Fire)' }).locator('td').nth(8)).toHaveText('×2');
  await expect(storage.locator('tbody tr').filter({ hasText: 'Poison Master (Fire)' }).locator('td').nth(2))
    .toHaveText('Inventory / Sealed Shrine · Normal');
  const lightLevel40 = storage.locator('tbody tr').filter({ hasText: 'Poison Master (Light)' }).filter({ hasText: '40' });
  await expect(lightLevel40).toHaveCount(1);
  await expect(lightLevel40.locator('td').nth(8)).toHaveText('×2');

  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await expect(summary).toContainText('4 of 4 shown');

  /* The tally spans every location, so the Fire pair and all three Light copies
     qualify. The Light group is the point: its copies include both a matching
     level-40 pair and a separate level-one copy. */
  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('3 of 4 shown');
  await expect(storage.locator('tbody tr')).toHaveCount(3);
  await expect(storage.locator('tbody')).toContainText('Poison Master (Fire)');
  await expect(storage.locator('tbody')).toContainText('Poison Master (Light)');
  /* Held once, so it stays out — a sibling element is a different monster. */
  await expect(storage.locator('tbody')).not.toContainText('Poison Master (Wind)');

  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('2 of 4 shown');
  await expect(storage.locator('tbody tr')).toHaveCount(2);
  await expect(storage.locator('tbody')).toContainText('Poison Master (Light)');
  await expect(storage.locator('tbody')).not.toContainText('Poison Master (Fire)');

  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('ArrowRight');
  await expect(summary).toContainText('0 of 4 shown');
  await expect(page.getByText('No monsters match these filters. Clear a filter to see more.')).toBeVisible();
});
