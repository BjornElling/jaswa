import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/* One statistics calculation — 900 synthetic runes against every shipped preset —
   measured about 10 s in a browser on its own, and twice that with the whole suite's
   browsers sharing the processor. The config's 15 s wait is for a page to arrive, not
   for this, so each wait on a finished calculation says how long it may take. */
const calculation = { timeout: 45_000 };

function percentage(value: string): number {
  return Number(value.replace('%', '').replace(',', '.'));
}

test('keeps the statistics box honest without an account reference', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Set-up', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  await expect(statistics.locator('.statistics-lead')).toContainText('Import an account with a level 40 monster');
  await expect(statistics.locator('dd')).toHaveText(['—', '—']);
  await expect(statistics.locator('.statistics-meta')).toHaveText('Waiting for an account');
  await page.screenshot({ path: testInfo.outputPath('rune-setup-empty.png'), fullPage: true });
});

test('shows the synthetic statistics and recalculates them after a setting changes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Set-up', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const before = await values.allTextContents();
  expect(before.every((value) => /\d/.test(value))).toBe(true);
  expect(percentage(before[1] ?? '')).toBeLessThanOrEqual(percentage(before[0] ?? ''));

  const accepted = page.locator('#accepted-runes');
  await expect(accepted).toHaveValue('3');
  await accepted.fill('5');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const after = await values.allTextContents();
  expect(after.every((value) => /\d/.test(value))).toBe(true);
  expect(percentage(after[1] ?? '')).toBeLessThanOrEqual(percentage(after[0] ?? ''));
  expect(after).not.toEqual(before);
});

test('gets stricter when broken runes are excluded', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Set-up', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  const broken = page.locator('#broken-runes');
  await expect(status).toContainText(/synthetic runes/, calculation);
  await expect(broken).toHaveValue('3');
  const permissive = await values.allTextContents();
  await page.screenshot({ path: testInfo.outputPath('rune-setup-broken-permissive.png'), fullPage: true });

  await broken.fill('5');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const strict = await values.allTextContents();
  await page.screenshot({ path: testInfo.outputPath('rune-setup-broken-strict.png'), fullPage: true });

  expect(percentage(strict[0] ?? '')).toBeLessThanOrEqual(percentage(permissive[0] ?? ''));
  expect(percentage(strict[1] ?? '')).toBeLessThanOrEqual(percentage(permissive[1] ?? ''));
});
