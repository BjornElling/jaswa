import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('opens the shared rune overlay from a cleanup row and returns focus', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const firstRune = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody .rune-link').first();
  await expect(firstRune).toBeVisible();
  await firstRune.click();

  const overlay = page.getByRole('dialog');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('Rune facts', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Substats', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Substat potential at +15', { exact: true })).toBeVisible();
  await expect(overlay.getByText('What can still improve', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-overlay-open.png'), fullPage: true });

  await overlay.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(overlay).toBeHidden();
  await expect(firstRune).toBeFocused();
});
