import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/**
 * The calculation judges every rune the import holds, and nothing narrows it.
 *
 * Settings used to carry two "Runes to include" boxes, and they are gone: preset
 * quotas are global, so a rune withheld from the engine hands its place in a
 * preset's share to the runes that remain and changes their verdicts. Where a rune
 * sits and how far it is powered up decide what the table *shows*, and a filter
 * moves no figure. The fixture account is built for the distinction — three runes
 * in the inventory, two of them at +12, and one +15 rune equipped on a monster.
 */
test('every rune is judged, and the filters only decide what is shown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const recommendations = page.locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Recommendations' }) });
  const calculate = recommendations.getByRole('button', { name: /^(Calculate|Recalculate)$/ });
  const status = page.locator('.calculation-status');
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');

  await expect(recommendations.getByText('4 runes ready to judge')).toBeVisible();
  await calculate.click();
  await expect(status).toContainText('4 runes judged against');
  await expect(rows).toHaveCount(4);
  /* The equipped +15 is one of the four, and it is there under its wearer's name
     rather than under Inventory. */
  await expect(rows.filter({ hasText: 'Inventory' })).toHaveCount(3);

  /* Settings states what a rune is worth, never which runes are looked at. */
  const settings = page.locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Settings' }) });
  await settings.locator('summary').click();
  await expect(settings.getByText('Runes to include')).toHaveCount(0);
  await expect(settings.getByRole('checkbox', { name: /^Include runes/ })).toHaveCount(0);

  /* Hiding the equipped rune takes a row off the screen and leaves the
     calculation exactly where it was — four runes judged, all four still held. */
  const where = page.getByRole('group', { name: 'Filter by where the rune is' });
  await where.getByRole('button', { name: 'Equipped' }).click();
  await expect(rows).toHaveCount(3);
  await expect(status).toContainText('4 runes judged against');
  await expect(recommendations.getByText('3 of 4 runes')).toBeVisible();

  await where.getByRole('button', { name: 'Equipped' }).click();
  await expect(rows).toHaveCount(4);
});
