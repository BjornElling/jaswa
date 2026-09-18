import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/empty-craft-stack-account.json', import.meta.url));

test('emptied account stacks are removed instead of rejecting the account', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);

  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('1 monsters · 0 runes · 0 artifacts');
  await expect(page.locator('.import-badge')).toContainText('0 gems & grinds');
  await expect(page.getByText('This file contains an invalid craft-item collection.')).toHaveCount(0);
});
