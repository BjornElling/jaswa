import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('keeps the statistics box honest without an account reference', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Set-up', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  await expect(statistics.locator('.statistics-lead')).toContainText('Import an account with a level 40 monster');
  await expect(statistics.locator('dd')).toHaveText(['—', '—']);
  await expect(statistics.locator('.statistics-meta')).toHaveText('Waiting for an account');
});

test('shows the synthetic statistics and recalculates them after a setting changes', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Set-up', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  await expect(status).toContainText(/synthetic runes/);
  const before = await values.allTextContents();
  expect(before.every((value) => /\d/.test(value))).toBe(true);

  const quality = page.locator('#rune-quality');
  const nextQuality = (Number(await quality.inputValue()) === 5 ? 1 : 5).toString();
  await quality.fill(nextQuality);
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText(/synthetic runes/);
  const after = await values.allTextContents();
  expect(after.every((value) => /\d/.test(value))).toBe(true);
  expect(after).not.toEqual(before);
});
