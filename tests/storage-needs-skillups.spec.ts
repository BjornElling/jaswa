import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const selectionAccount = fileURLToPath(new URL('./fixtures/monster-selection.json', import.meta.url));

/**
 * "Needs skill-ups" asks about the row in front of the user rather than about
 * the account, which is what separates it from the two conditions above it: a
 * max-skilled copy is finished whatever other copies of the same monster still
 * need. A row whose maximum the catalogue does not know keeps its place, so the
 * filter only withdraws a monster it can positively confirm is done.
 */
test('"Needs skill-ups" hides only the max-skilled copies', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(selectionAccount);
  await page.getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();

  const summary = page.locator('.storage-filter-strip .filter-summary');
  const storage = page.locator('.storage-grid tbody');
  await expect(summary).toContainText('4 of 4 shown');

  /* The two Lv. 40 monsters in Inventory are max skilled; the two stored
     monsters are not, and stay. */
  await page.getByRole('checkbox', { name: 'Needs skill-ups' }).check();
  await expect(summary).toContainText('2 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).toContainText('Striker (Fire)');
  await expect(storage).not.toContainText('MAX');

  await page.getByRole('checkbox', { name: 'Needs skill-ups' }).uncheck();
  await expect(summary).toContainText('4 of 4 shown');
});
