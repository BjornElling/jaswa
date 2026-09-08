import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const summonedShrineAccount = fileURLToPath(new URL('./fixtures/sealed-shrine-summoned.json', import.meta.url));

test('shows summoned sealed-shrine stacks and filters them by grade and quantity', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(summonedShrineAccount);
  await expect(page.getByText('20 monsters · 0 runes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Storage' }).click();

  const storage = page.getByRole('table', { name: 'Monsters in Storage' });
  await page.getByRole('checkbox', { name: 'Storage', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Sealed Shrine · Normal', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Sealed Shrine · Summoned', exact: true })).toBeChecked();
  await expect(storage).toContainText('Sealed Shrine · Summoned');
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('2 of 2 shown');
  await expect(page.getByRole('checkbox', { name: '6★' })).toBeVisible();

  await page.getByRole('checkbox', { name: '6★' }).check();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 2 shown');
  await page.getByRole('checkbox', { name: '6★' }).uncheck();

  await page.getByRole('checkbox', { name: 'Have >= than' }).check();
  await page.getByRole('slider', { name: 'Minimum monster quantity' }).press('End');
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('1 of 2 shown');
  await expect(storage).toContainText('×12');
});
