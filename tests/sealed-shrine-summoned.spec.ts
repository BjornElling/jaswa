import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const summonedShrineAccount = fileURLToPath(new URL('./fixtures/sealed-shrine-summoned.json', import.meta.url));

test('shows summoned sealed-shrine stacks and filters them by grade and quantity', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(summonedShrineAccount);
  await expect(page.getByText('20 monsters · 0 runes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();

  const storage = page.getByRole('table', { name: 'Monster numbers' });
  await page.getByRole('checkbox', { name: 'Storage', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Sealed Shrine · Normal', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Sealed Shrine · Summoned', exact: true })).toBeChecked();
  await expect(storage).toContainText('Sealed Shrine · Summoned');
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('2 of 2 shown');
  await expect(page.getByRole('checkbox', { name: '6★' })).toBeVisible();

  await page.getByRole('checkbox', { name: '6★' }).check();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 2 shown');
  await page.getByRole('checkbox', { name: '6★' }).uncheck();

  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('End');
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 2 shown');
  await expect(storage).toContainText('×12');
});

/**
 * The game sends a summoned stack as `unit_master_id`, `quantity` and `class`
 * alone. Reading the two absent fields as unknown printed a tab of "—" that
 * told the user less than the game does: sealing makes a fresh copy, so the
 * level is 1 and the skills are unskilled. Both are shown, and the level the
 * row now has is a real one the Level filter can honestly narrow to.
 */
test('a summoned stack shows the Lv. 1 and unskilled state sealing gives it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(summonedShrineAccount);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();

  const firstRow = page.getByRole('table', { name: 'Monster numbers' }).locator('tbody tr').first();
  await expect(firstRow).toContainText('Sealed Shrine · Summoned');
  await expect(firstRow.locator('td').nth(6)).toHaveText('1');
  await expect(firstRow.locator('td').nth(7)).not.toHaveText('—');
  await expect(firstRow.locator('td').nth(7)).toContainText('0 /');

  /* A stack sits at Lv. 1, so raising the minimum past it hides the whole tab
     rather than leaving it visible for every interval. */
  await page.getByRole('slider', { name: 'Minimum monster level' }).press('ArrowRight');
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('0 of 2 shown');
});
