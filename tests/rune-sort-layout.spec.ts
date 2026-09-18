import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/**
 * Adding the Sort by row must not move the filters above it, and choosing an
 * ordering must not move anything at all (`AGENTS.md` rule 2): the control
 * changes, the panel around it does not.
 */
test('choosing an ordering leaves the filter panel where it was', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const recommendations = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Recommendations' }) });
  await recommendations.getByRole('button', { name: 'Calculate', exact: true }).click();

  const panel = page.locator('.rune-filter-strip');
  const sortBy = page.getByRole('combobox', { name: 'Sort by' });
  /* The groups that must not move, measured by their own boxes rather than by
     the panel's, so a change of panel height cannot hide a sideways shift. */
  const groups = ['.rune-filter-search', '.rune-filter-advice', '.rune-filter-level',
    '.rune-filter-usage', '.rune-filter-sort-by'];

  const boxes = async () => Promise.all(groups.map(async (selector) => {
    const box = await panel.locator(selector).boundingBox();
    return { selector, x: box?.x, y: box?.y, width: box?.width, height: box?.height };
  }));

  const before = await boxes();
  await sortBy.selectOption({ label: 'Grade' });
  await expect(sortBy).toHaveValue('gameGrade');
  expect(await boxes()).toEqual(before);

  /* And at a narrow viewport, where the panel stacks: the row still has to hold
     its own place rather than overflowing the strip sideways. */
  await page.setViewportSize({ width: 900, height: 900 });
  const stacked = await panel.boundingBox();
  const control = await panel.locator('.rune-filter-sort-by').boundingBox();
  expect(control && stacked && control.x + control.width).toBeLessThanOrEqual(
    (stacked?.x ?? 0) + (stacked?.width ?? 0) + 1);
});
