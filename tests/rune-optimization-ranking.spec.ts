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

test('equal Speed ranks by requested E.HP after saturated percentage stats, including non-binding floors', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ties-empty.png'), fullPage: true });

  const data = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
  const monster = data.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11);
  monster.resist = 15;
  monster.runes[5].pri_eff = [11, 64];
  monster.accuracy = 85;
  monster.critical_rate = 100;
  monster.runes[0].sec_eff = [[1, 100, 0, 0], [11, 25, 0, 0], [8, 11, 0, 0], [4, 24, 0, 0]];
  // The stronger E.HP alternative has less surplus RES and needs a move.
  data.runes = [{ ...monster.runes[0], rune_id: 99001, occupied_type: 2, occupied_id: 0,
    sec_eff: [[1, 1000, 0, 0], [11, 15, 0, 0], [8, 11, 0, 0], [4, 24, 0, 0]] }];
  data.unit_list = [monster];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'speed-ties.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  for (const radio of await settings.getByRole('radio', { name: 'None', exact: true }).all()) await radio.check();
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('End');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  const box = await requirements.boundingBox();
  const table = page.getByRole('table', { name: 'Rune builds' });
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  const calculate = page.getByRole('button', { name: 'Calculate', exact: true });
  for (const field of await requirements.locator('.stat-ranges input[type="number"]').all()) await field.fill('');
  await calculate.click();
  await expect(rows).toHaveCount(2);
  const headings = await table.getByRole('columnheader').allTextContents();
  const column = (name: string) => headings.findIndex((text) => text.trim() === name);
  const changes = column('Changes');
  await expect(rows.first().getByRole('cell').nth(changes)).toHaveText('0');
  await page.screenshot({ path: testInfo.outputPath('ties-no-targets.png'), fullPage: true });

  await page.getByLabel('Res%: at least', { exact: true }).fill('100');
  await page.getByLabel('E.HP: at least', { exact: true }).fill('80000');
  await page.screenshot({ path: testInfo.outputPath('ties-requested-before.png'), fullPage: true });
  await calculate.click();
  await expect(rows.first().getByRole('cell').nth(changes)).toHaveText('1');
  expect(await requirements.boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('ties-requested-after.png'), fullPage: true });

  // Every field filled, including explicit zero floors and large ceilings.
  for (const range of await requirements.locator('.stat-range').all()) {
    await range.getByRole('spinbutton').nth(0).fill('0');
    await range.getByRole('spinbutton').nth(1).fill('9999999');
  }
  await page.getByLabel('Res%: at least', { exact: true }).fill('100');
  await page.getByLabel('Acc%: at least', { exact: true }).fill('85');
  await page.getByLabel('CtR%: at least', { exact: true }).fill('100');
  await page.getByLabel('E.HP: at least', { exact: true }).fill('1');
  expect(await requirements.boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('ties-filled-before.png'), fullPage: true });
  await calculate.click();
  await expect(rows.first().getByRole('cell').nth(changes)).toHaveText('1');
  await expect(rows).toHaveCount(2);
  const values = await rows.evaluateAll((elements, indexes) => elements.map((row) => indexes.map((at) =>
    Number(row.children[at].textContent?.replace(/[^\d.]/g, '')))), [column('Spd'), column('Res%'), column('E.HP')]);
  expect(values[0][0]).toBe(values[1][0]);
  expect(values[0][1]).toBeLessThan(values[1][1]);
  expect(values[0][2]).toBeGreaterThan(values[1][2]);
  expect(await requirements.boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('ties-filled-after.png'), fullPage: true });
});

for (const tertiary of ['no targets', 'only primary', 'one equal secondary', 'ordinary', 'identical', 'saturated ACC'] as const) {
  test(`equal uncapped Speed and HP continue to ${tertiary} tertiary values`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    const data = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
    const monster = data.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11);
    monster.accuracy = 85;
    monster.runes[0].sec_eff = [[4, 8, 0, 0], [12, 10, 0, 0], [9, 6, 0, 0], [10, 7, 0, 0]];
    data.runes = [20, 30].map((acc, at) => ({ ...monster.runes[0], rune_id: 99001 + at, occupied_type: 2, occupied_id: 0,
      sec_eff: [[4, tertiary === 'identical' ? 8 : 16, 0, 0], [12, acc, 0, 0], [9, 6, 0, 0], [10, 7, 0, 0]] }));
    data.unit_list = [monster];
    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
      name: 'tertiary-ties.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
    });
    await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
    await page.getByLabel('Monster', { exact: true }).selectOption('11');
    const settings = page.getByRole('complementary', { name: 'Settings' });
    for (const radio of await settings.getByRole('radio', { name: 'None', exact: true }).all()) await radio.check();
    await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
    await page.getByRole('slider', { name: 'Depth', exact: true }).press('End');
    const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
    for (const field of await requirements.locator('.stat-ranges input[type="number"]').all()) await field.fill('');
    if (tertiary === 'only primary') await page.getByLabel('Spd: at least', { exact: true }).fill('0');
    if (tertiary !== 'no targets' && tertiary !== 'only primary') {
      await page.getByLabel('HP: at least', { exact: true }).fill('0');
      if (tertiary !== 'one equal secondary') await page.getByLabel(tertiary === 'saturated ACC' ? 'Acc%: at least' : 'Atk: at least', { exact: true }).fill('0');
    }
    const box = await requirements.boundingBox();
    await page.screenshot({ path: testInfo.outputPath('tertiary-before.png'), fullPage: true });
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    const table = page.getByRole('table', { name: 'Rune builds' });
    const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
    await expect(rows).toHaveCount(3);
    const headings = await table.getByRole('columnheader').allTextContents();
    const indexes = ['Spd', 'HP', 'Atk', 'Acc%', 'Changes'].map((name) => headings.findIndex((text) => text.trim() === name));
    const values = await rows.evaluateAll((elements, columns) => elements.map((row) => columns.map((at) =>
      Number(row.children[at].textContent?.replace(/[^\d.]/g, '')))), indexes);
    expect(new Set(values.map((row) => row[0])).size).toBe(1);
    expect(new Set(values.map((row) => row[1])).size).toBe(1);
    if (tertiary === 'ordinary') {
      expect(values[0][2]).toBe(values[1][2]);
      expect(values[1][2]).toBeGreaterThan(values[2][2]);
      expect(values.map((row) => row[4])).toEqual([1, 1, 0]);
      // Equal ordinary tertiary values reach deterministic picks, not unrequested ACC.
      expect(values[0][3]).toBeLessThan(values[1][3]);
    } else {
      expect(values.map((row) => row[4])).toEqual([0, 1, 1]);
      if (tertiary === 'identical') expect(new Set(values.map((row) => row[2])).size).toBe(1);
      else expect(values.every((row) => row[3] >= 85)).toBe(true);
      expect(values[0][3]).toBeLessThan(values[2][3]);
    }
    expect(await requirements.boundingBox()).toEqual(box);
    await page.screenshot({ path: testInfo.outputPath('tertiary-after.png'), fullPage: true });
  });
}
