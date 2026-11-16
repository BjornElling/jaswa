import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/**
 * The calculation judges every rune the import holds, and nothing narrows it.
 *
 * Settings do not decide which runes enter the engine. Where a rune sits and how
 * far it is powered up decide what the table *shows*, and a filter moves no figure.
 * The fixture account is built for the distinction — three runes
 * in the inventory, two of them at +12, and one +15 rune engraved on a monster.
 */
test('every rune is judged, and the filters only decide what is shown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  const calculate = cleanup.getByRole('button', { name: 'Calculate', exact: true });
  const status = page.locator('.calculation-status');
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');

  await expect(cleanup.getByText('Nothing calculated yet.')).toBeVisible();
  await calculate.click();
  await expect(status).toContainText('4 runes judged against');
  await expect(rows).toHaveCount(4);
  /* The engraved +15 is one of the four, and it is there under the name of the monster it is engraved on
     rather than under Inventory. */
  await expect(rows.filter({ hasText: 'Inventory' })).toHaveCount(3);

  /* Settings states what a rune is worth, never which runes are looked at, and
     now has its own workspace rather than living below the verdicts. */
  await expect(cleanup.locator('summary').filter({ hasText: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true })).toBeVisible();

  /* Location is chosen like every other value: none chosen shows every rune, one
     chosen narrows to it, and both chosen is every rune again. Narrowing takes
     rows off the screen and leaves the calculation exactly where it was. */
  const location = page.getByRole('group', { name: 'Filter by location' });
  const engraved = location.getByRole('button', { name: 'Engraved' });
  const inventory = location.getByRole('button', { name: 'Inventory' });
  await expect(engraved).toHaveAttribute('aria-pressed', 'false');
  await expect(inventory).toHaveAttribute('aria-pressed', 'false');

  await inventory.click();
  await expect(rows).toHaveCount(3);
  await expect(status).toContainText('4 runes judged against');
  await expect(cleanup.getByRole('status', { name: '3 of 4 runes shown' })).toBeVisible();

  await engraved.click();
  await expect(rows).toHaveCount(4);

  await inventory.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Inventory' })).toHaveCount(0);

  await engraved.click();
  await expect(rows).toHaveCount(4);
});
