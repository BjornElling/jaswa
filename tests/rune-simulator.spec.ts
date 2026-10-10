import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('simulates random runes through +0, +9, +12 and +15, spending no craft without a role',async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('details').filter({ hasText: 'Settings' }).locator('summary').click();
  await page.locator('#enchanted-gems').fill('6');
  await page.locator('#grindstones').fill('5');

  /* The simulator is a Rune Clean-up tool, judged by the Clean-up engine beside it. */
  const runes = page.locator('.rail-group').filter({ has: page.locator('.rail-heading', { hasText: 'Rune Clean-up' }) });
  await runes.getByRole('button', { name: 'Rune Simulator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rune Simulator', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing generated yet.', exact: true })).toBeVisible();
  await expect(page.getByText('Best · Hero', { exact: true })).toBeVisible();
  await expect(page.getByText('¾ · Hero', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Rune set', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Main stat')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Enchanted Gem' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Grindstone' })).toHaveCount(0);
  await expect(page.getByLabel('Runes kept at +15')).toContainText('Generate runes to count the keepers');
  for (const gate of ['After +0', 'After +9', 'After +12']) {
    await expect(page.getByLabel(gate)).toHaveValue('recommendation');
  }
  await expect(page.getByLabel('After +15')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-empty.png') });

  /* The default sells by recommendation, which needs an account to judge with. */
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Level a monster to');
  await expect(page.getByRole('heading', { name: 'Nothing generated yet.', exact: true })).toBeVisible();

  await page.getByLabel('After +0').selectOption('keep-all');
  await page.getByLabel('After +9').selectOption('keep-all');
  await page.getByLabel('After +12').selectOption('keep-all');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  const firstSet = page.locator('.rune-simulator-table tbody tr').first().locator('td').first();
  await expect(firstSet).toHaveText('No rune type');
  /* Without an import there is nothing to judge with: the table says so rather
     than printing a verdict nobody computed. */
  await expect(page.locator('.rune-simulator-table [data-verdict]')).toHaveCount(0);
  await expect(page.getByText(/need an imported account/).first()).toBeVisible();

  const filters = page.locator('.rune-simulator-filters');
  const before = await filters.boundingBox();
  /* The quantity is typed, never nudged: no spinner, no arrow-key steps, digits only. */
  const quantity = page.getByLabel('Quantity');
  await expect(quantity).toHaveAttribute('type', 'text');
  await quantity.fill('');
  await quantity.pressSequentially('2a0-0');
  await expect(quantity).toHaveValue('200');
  await quantity.press('ArrowUp');
  await expect(quantity).toHaveValue('200');
  await quantity.fill('200');
  await page.getByLabel('Rune set', { exact: true }).selectOption('Fatal');
  await page.getByLabel('Slot', { exact: true }).selectOption('2');
  await page.getByLabel('Stars', { exact: true }).selectOption('6');
  await expect(page.getByLabel('After +0').locator('option')).toHaveText(['Keep all', 'Sell according to recommendation']);
  await page.getByLabel('After +0').selectOption('keep-all');
  await page.getByLabel('After +9').selectOption('keep-all');
  await page.getByLabel('After +12').selectOption('keep-all');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '200 runes', exact: true })).toBeVisible();
  const rows = page.locator('.rune-simulator-table tbody tr');
  await expect(rows).toHaveCount(200);
  /* A named set is its name alone, and every row carries its quality rule. */
  await expect(rows.first().locator('td').first()).toHaveText('Fatal');
  await expect(page.getByText('ATK +35 %', { exact: true })).toHaveCount(0);
  await expect(page.locator('.rune-simulator-table [role="img"][aria-label$=" quality"]')).toHaveCount(200);
  await expect(page.locator('.rune-simulator-table [title="Ancient"]')).toHaveCount(0);
  await expect(page.locator('.rune-simulator-rolls')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-results-plus-zero.png') });
  /* Every row is four substats tall at every checkpoint, so none grows when a
     rare or hero rune gains its fourth line at +12. */
  /* Collapsed borders land rows on half pixels, so heights agree within one. */
  const rowHeights = () => rows.evaluateAll((all) => all.map((row) => row.getBoundingClientRect().height));
  const plusZeroHeights = await rowHeights();
  expect(Math.max(...plusZeroHeights) - Math.min(...plusZeroHeights)).toBeLessThan(1);
  await page.getByRole('button', { name: '+15', exact: true }).click();
  await expect(page.getByRole('button', { name: '+15', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const plusFifteenHeights = await rowHeights();
  expect(Math.max(...plusFifteenHeights, ...plusZeroHeights) - Math.min(...plusFifteenHeights, ...plusZeroHeights)).toBeLessThan(1);
  /* With no role to judge by, nothing says which Gem helps, so nothing is spent. */
  await expect(page.locator('.rune-simulator-table .rune-sub-gem')).toHaveCount(0);
  await expect(page.locator('.rune-simulator-table [data-ground="true"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-results.png') });

  const after = await filters.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after).toEqual(before);
});

test('reads every checkpoint with Rune Clean-up and counts the keepers by role and slot', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Simulator', exact: true }).click();

  /* Keep all at every gate: the verdicts are still the engine's, and the batch
     reaches +15 whole, so the keeper count is a count of the engine's Keeps. */
  await page.getByLabel('Quantity').fill('120');
  await page.getByLabel('After +0').selectOption('keep-all');
  await page.getByLabel('After +9').selectOption('keep-all');
  await page.getByLabel('After +12').selectOption('keep-all');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '120 runes', exact: true })).toBeVisible();
  const verdicts = page.locator('.rune-simulator-table tbody [data-verdict]');
  await expect(verdicts).toHaveCount(120);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="keep"]')).toHaveCount(0);

  await page.getByRole('button', { name: '+12', exact: true }).click();
  await expect(verdicts).toHaveCount(120);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="power-up"]')).toHaveCount(0);
  const sellsAtTwelve = await page.locator('.rune-simulator-table tbody [data-verdict="sell"]').count();

  await page.getByRole('button', { name: '+15', exact: true }).click();
  await expect(verdicts).toHaveCount(120);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="power-up"]')).toHaveCount(0);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="sell"]')).toHaveCount(sellsAtTwelve);
  /* The craft the verdict counted is the craft on screen: one Gem at most per rune,
     and a stone on every line that can take one. */
  await expect(page.locator('.rune-simulator-table .rune-sub-gem').first()).toBeVisible();
  await expect(page.locator('.rune-simulator-table [data-ground="true"]').first()).toBeVisible();
  const keeps = await page.locator('.rune-simulator-table tbody [data-verdict="keep"]').count();

  const stats = page.locator('.rune-simulator-stats-table');
  await expect(stats.locator('thead th')).toHaveText(['Role', 'Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5', 'Slot 6']);
  const totals = (await stats.locator('tfoot td').allTextContents()).map(Number);
  expect(totals.reduce((sum, value) => sum + value, 0)).toBe(keeps);
  const cells = (await stats.locator('tbody td').allTextContents()).map(Number);
  expect(cells.reduce((sum, value) => sum + value, 0)).toBe(keeps);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-keepers.png'), fullPage: true });

  await page.getByLabel('Quantity').fill('20');
  await page.getByLabel('Rune set', { exact: true }).selectOption('Fatal');
  await page.getByLabel('Slot', { exact: true }).selectOption('2');
  await page.getByLabel('Stars', { exact: true }).selectOption('6');
  await page.getByLabel('After +0').selectOption('recommendation');
  await page.getByLabel('After +9').selectOption('recommendation');
  await page.getByLabel('After +12').selectOption('recommendation');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '20 runes', exact: true })).toBeVisible();
  await expect(page.locator('.rune-simulator-table tbody tr')).toHaveCount(20);
  await expect(page.locator('.rune-simulator-table [data-verdict="sell"]').first()).toBeVisible();
});
