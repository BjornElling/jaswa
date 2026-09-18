import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('calculates and shows a verdict for every imported rune', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const recommendations = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Recommendations' }) });
  await expect(recommendations.getByText('Nothing calculated yet.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-empty.png') });

  await recommendations.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.calculation-status')).toContainText('4 runes judged against');
  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-calculated.png') });
});
