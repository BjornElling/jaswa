import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const mergeRows = fileURLToPath(new URL('./fixtures/monster-row-merge.json', import.meta.url));

test('merges copies only when monster, grade, level and skills all match', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(mergeRows);
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Usage', exact: true }).click();

  const rows = page.getByRole('table', { name: 'Monster numbers' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);

  const lightRows = rows.filter({ hasText: 'Poison Master (Light)' });
  await expect(lightRows).toHaveCount(4);
  const matchingCopies = lightRows.filter({ hasText: '×3' });
  await expect(matchingCopies).toHaveCount(1);
  await expect(matchingCopies.locator('td').nth(2)).toHaveText('Inventory / Sealed Shrine · Normal');

  /* The other three rows have the same monster name but differ by skill state,
     grade or level, so none of them may be absorbed into the ×3 row. */
  await expect(lightRows.filter({ hasText: '×1' })).toHaveCount(3);
});
