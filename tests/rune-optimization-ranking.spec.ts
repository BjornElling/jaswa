import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('saturated Accuracy keeps move ties in the visible table and preserves raw figures', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });

  const data = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
  const monster = data.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11);
  monster.accuracy = 85;
  // One alternative improves only an already saturated stat, at the cost of a move.
  data.runes = [{ ...monster.runes[0], rune_id: 99001, occupied_type: 2, occupied_id: 0,
    sec_eff: monster.runes[0].sec_eff.map((line: number[]) => line[0] === 12 ? [12, 40, 0, 0] : line) }];
  data.unit_list = [monster];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'saturated-accuracy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  for (const radio of await settings.getByRole('radio', { name: 'None', exact: true }).all()) await radio.check();
  await page.getByLabel('Rank by', { exact: true }).selectOption('acc');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  const box = await requirements.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('before-search.png'), fullPage: true });
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  await expect(rows).toHaveCount(2);
  const headings = await table.getByRole('columnheader').allTextContents();
  const changes = headings.findIndex((text) => text.trim() === 'Changes');
  const accuracy = headings.findIndex((text) => /acc/i.test(text));
  await expect(rows.first().getByRole('cell').nth(changes)).toHaveText('0');
  await expect(rows.last().getByRole('cell').nth(changes)).toHaveText('1');
  const values = await rows.evaluateAll((elements, at) => elements.map((row) =>
    Number(row.children[at].textContent?.replace(/[^\d.]/g, ''))), accuracy);
  expect(values[0]).toBeGreaterThan(85);
  expect(values[1]).toBeGreaterThan(values[0]);
  expect(await requirements.boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('after-search.png'), fullPage: true });
});
