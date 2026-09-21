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
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Simulator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rune Simulator', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing generated yet.', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Rune lineage', exact: true })).toHaveCount(0);
  await expect(page.getByText('Best · Hero', { exact: true })).toBeVisible();
  await expect(page.getByText('¾ · Hero', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Rune set')).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Enchanted Gem' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Grindstone' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rune-simulator-empty.png') });

  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();
  await expect(page.getByText('No rune type', { exact: true }).first()).toBeVisible();

  const filters = page.locator('.rune-simulator-filters');
  const before = await filters.boundingBox();
  await page.getByLabel('Quantity').fill('200');
  await page.getByLabel('Rune set').selectOption('Fatal');
  await page.getByLabel('Slot').selectOption('2');
  await page.getByLabel('Stars').selectOption('6');
  await page.getByLabel('Main stat').selectOption('8');
  await expect(page.getByLabel('Target substat')).toHaveCount(0);
  await expect(page.getByLabel('After +0').locator('option')).toHaveText(['Keep all', 'Sell according to recommendation']);
  await page.getByLabel('After +0').selectOption('keep-all');
  await page.getByLabel('After +9').selectOption('keep-all');
  await page.getByLabel('After +12').selectOption('keep-all');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '200 runes, three checkpoints', exact: true })).toBeVisible();
  await expect(page.locator('.rune-simulator-table tbody tr')).toHaveCount(200);
  await expect(page.locator('.rune-simulator-table [title="Ancient"]')).toHaveCount(0);
  await expect(page.getByText('ATK +35 %', { exact: true }).first()).toBeVisible();
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

test('uses Rune Clean-up recommendation as the checkpoint sell policy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Simulator', exact: true }).click();

  await page.getByLabel('Quantity').fill('20');
  await page.getByLabel('Rune set').selectOption('Fatal');
  await page.getByLabel('Slot').selectOption('2');
  await page.getByLabel('Stars').selectOption('6');
  await page.getByLabel('Main stat').selectOption('8');
  await page.getByLabel('After +0').selectOption('recommendation');
  await page.getByLabel('After +9').selectOption('recommendation');
  await page.getByLabel('After +12').selectOption('recommendation');
  await page.getByRole('button', { name: 'Generate runes', exact: true }).click();

  await expect(page.getByRole('heading', { name: '20 runes, three checkpoints', exact: true })).toBeVisible();
  await expect(page.locator('.rune-simulator-table tbody tr')).toHaveCount(20);
  await expect(page.locator('.rune-simulator-table [data-verdict="sell"]').first()).toBeVisible();
});
