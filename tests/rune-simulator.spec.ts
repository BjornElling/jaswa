import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('simulates random runes through +0, +9 and +12 with craft marks', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.locator('details').filter({ hasText: 'Settings' }).locator('summary').click();
  await page.locator('#enchanted-gems').fill('4');
  await page.locator('#grindstones').fill('3');

  /* The simulator is a Runes tool, judged by the Clean-up engine beside it. */
  const runes = page.locator('.rail-group').filter({ has: page.locator('.rail-heading', { hasText: 'Runes' }) });
  await runes.getByRole('button', { name: 'Rune Simulator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rune Simulator', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing generated yet.', exact: true })).toBeVisible();
  await expect(page.getByText('Best · Hero', { exact: true })).toBeVisible();
  await expect(page.getByText('¾ · Hero', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Rune set')).toHaveValue('');
  await expect(page.getByLabel('Main stat')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Enchanted Gem' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Grindstone' })).toHaveCount(0);
  await expect(page.getByLabel('Runes kept at +12')).toHaveText('—');
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-empty.png') });

  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  const firstSet = page.locator('.rune-simulator-table tbody tr').first().locator('td').first();
  await expect(firstSet).toHaveText('No rune type');
  /* Without an import there is nothing to judge with: the table says so rather
     than printing a verdict nobody computed. */
  await expect(page.locator('.rune-simulator-table [data-verdict]')).toHaveCount(0);
  await expect(page.getByText(/need an imported account/).first()).toBeVisible();

  const filters = page.locator('.rune-simulator-filters');
  const before = await filters.boundingBox();
  await page.getByLabel('Quantity').fill('200');
  await page.getByLabel('Rune set').selectOption('Fatal');
  await page.getByLabel('Slot', { exact: true }).selectOption('2');
  await page.getByLabel('Stars', { exact: true }).selectOption('6');
  await expect(page.getByLabel('After +0').locator('option')).toHaveText(['Keep all', 'Sell according to recommendation']);
  await page.getByLabel('After +0').selectOption('keep-all');
  await page.getByLabel('After +9').selectOption('keep-all');
  await page.getByLabel('After +12').selectOption('keep-all');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '200 runes, three checkpoints', exact: true })).toBeVisible();
  const rows = page.locator('.rune-simulator-table tbody tr');
  await expect(rows).toHaveCount(200);
  /* A named set is its name alone, and every row carries its quality rule. */
  await expect(rows.first().locator('td').first()).toHaveText('Fatal');
  await expect(page.getByText('ATK +35 %', { exact: true })).toHaveCount(0);
  await expect(page.locator('.rune-simulator-table [role="img"][aria-label$=" quality"]')).toHaveCount(200);
  await expect(page.locator('.rune-simulator-table [title="Ancient"]')).toHaveCount(0);
  await expect(page.locator('.rune-simulator-rolls')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-results-plus-zero.png') });
  await page.getByRole('button', { name: '+12', exact: true }).click();
  await expect(page.getByRole('button', { name: '+12', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rune-simulator-enchanted-mark').first()).toBeVisible();
  await expect(page.locator('.rune-simulator-grind').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-results.png') });

  const after = await filters.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after).toEqual(before);
});

test('reads every checkpoint with Rune Clean-up and counts the keepers by preset and slot', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Simulator', exact: true }).click();

  /* Keep all at every gate: the verdicts are still the engine's, and the batch
     reaches +12 whole, so the keeper count is a count of the engine's Keeps. */
  await page.getByLabel('Quantity').fill('120');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '120 runes, three checkpoints', exact: true })).toBeVisible();
  const verdicts = page.locator('.rune-simulator-table tbody [data-verdict]');
  await expect(verdicts).toHaveCount(120);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="keep"]')).toHaveCount(0);

  await page.getByRole('button', { name: '+12', exact: true }).click();
  await expect(verdicts).toHaveCount(120);
  await expect(page.locator('.rune-simulator-table tbody [data-verdict="power-up"]')).toHaveCount(0);
  const keeps = await page.locator('.rune-simulator-table tbody [data-verdict="keep"]').count();
  await expect(page.getByLabel('Runes kept at +12')).toHaveText(String(keeps));

  const stats = page.locator('.rune-simulator-stats-table');
  await expect(stats.locator('thead th')).toHaveText(['Preset', 'Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5', 'Slot 6']);
  const totals = (await stats.locator('tfoot td').allTextContents()).map(Number);
  expect(totals.reduce((sum, value) => sum + value, 0)).toBe(keeps);
  const cells = (await stats.locator('tbody td').allTextContents()).map(Number);
  expect(cells.reduce((sum, value) => sum + value, 0)).toBe(keeps);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-keepers.png'), fullPage: true });

  await page.getByLabel('Quantity').fill('20');
  await page.getByLabel('Rune set').selectOption('Fatal');
  await page.getByLabel('Slot', { exact: true }).selectOption('2');
  await page.getByLabel('Stars', { exact: true }).selectOption('6');
  await page.getByLabel('After +0').selectOption('recommendation');
  await page.getByLabel('After +9').selectOption('recommendation');
  await page.getByLabel('After +12').selectOption('recommendation');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '20 runes, three checkpoints', exact: true })).toBeVisible();
  await expect(page.locator('.rune-simulator-table tbody tr')).toHaveCount(20);
  await expect(page.locator('.rune-simulator-table [data-verdict="sell"]').first()).toBeVisible();
});
