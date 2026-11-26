import { expect, test } from './test-fixtures';
import { readFile } from 'node:fs/promises';

const selectionAccount = new URL('./fixtures/monster-selection.json', import.meta.url);

test('"Needs skill-ups" shows only unfinished Lv. 40 copies', async ({ page }, testInfo) => {
  await page.goto('/');
  const rail = page.getByRole('navigation');
  const usage = rail.getByRole('button', { name: 'Monster Usage', exact: true });
  await usage.click();
  await expect(page.getByText('Import your game data first.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty.png') });

  const account = JSON.parse(await readFile(selectionAccount, 'utf8'));
  account.unit_list[2].unit_level = 40;
  account.unit_list[3].unit_level = 39;
  await rail.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'monster-selection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(account)),
  });
  await usage.click();

  const summary = page.locator('.storage-filter-strip .filter-summary');
  const storage = page.locator('.storage-grid tbody');
  const filter = page.getByRole('checkbox', { name: 'Needs skill-ups' });
  await expect(summary).toContainText('4 of 4 shown');
  await expect(storage).toContainText('Striker (Fire)');
  await expect(storage).toContainText('MAX');
  await page.screenshot({ path: testInfo.outputPath('unfiltered.png') });

  await filter.check();
  await expect(summary).toContainText('1 of 4 shown');
  await expect(storage).toContainText('Neostone Fighter (Fire)');
  await expect(storage).not.toContainText('Striker (Fire)');
  await expect(storage).not.toContainText('MAX');
  await page.screenshot({ path: testInfo.outputPath('filtered.png') });

  await filter.uncheck();
  await expect(summary).toContainText('4 of 4 shown');
});
