import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/fodder-mon-account.json', import.meta.url));

test('Fodder mon finds safe family fodder and keeps 2A fodder at 2A', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();

  const table = page.getByRole('table', { name: 'Monster numbers' });
  const filterGroup = page.getByRole('group', { name: 'Only show Numbers monsters if' });
  await expect(filterGroup.getByText('Fodder mon', { exact: true })).toBeVisible();

  await filterGroup.getByRole('checkbox', { name: 'Fodder mon' }).check();

  /* The Fire 2A pair is one level-one row with quantity two. The unawakened
     Fairy is valid fodder for the incomplete awakened Fairy, while the level-
     40 target, the two level-40 copies and the fully skilled lower-level copy
     are excluded. */
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody')).toContainText('Iselia (2A)');
  await expect(table.locator('tbody')).toContainText('×2');
  await expect(table.locator('tbody')).toContainText('Fairy');
  await expect(table.locator('tbody')).not.toContainText('Elucia (2A)');
  await expect(table.locator('tbody')).not.toContainText('Elucia');
  await expect(table.locator('tbody')).not.toContainText('Madeleine Cookie');
});
