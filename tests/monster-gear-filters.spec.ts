import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const source = load('rune-optimization-account');
const artifact = load('awakening-search-account').unit_list[1].artifacts[0];
const relic = load('relic-account').unit_list[0].relics[0];
const coverage = ['All', 'Partial', 'None'];
const account = {
  ...source,
  unit_list: [6, 5, 1, 0].flatMap((runes, runeIndex) => [2, 1, 0].map((artifacts, artifactIndex) => {
    const id = 100 + runeIndex * 3 + artifactIndex;
    return {
      ...source.unit_list[0], unit_id: id,
      skills: [[[1, 1]], [[1, 2]], [[1, 6]], undefined][runeIndex],
      runes: source.unit_list[0].runes.slice(0, runes).map((rune: object, index: number) => ({ ...rune, rune_id: id * 10 + index, occupied_id: id })),
      artifacts: Array.from({ length: artifacts }, (_, index) => ({
        ...artifact, rid: id * 10 + index, occupied_id: id, type: index + 1,
        ...(index === 0 ? { attribute: 1 } : { unit_style: 4 }),
      })),
      relics: id % 2 ? [] : [{ ...relic, rid: id * 10, occupied_id: id }],
    };
  })),
  runes: [], artifacts: [], relics: [],
  deck_list: [{ deck_type: 1, deck_seq: 1, leader_unit_id: 0, unit_id_list: [100, 101, 0, 0], equip: [
    { unit_id: 100, rune_id_list: [], artifact_id_list: [] },
    { unit_id: 101, rune_id_list: [], artifact_id_list: [] },
  ] }],
};

test('gear filters count slots, combine groups, preserve choices and stay in place', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('no-import.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'gear-filters.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  const rows = page.getByRole('table', { name: 'Monster stats', exact: true }).locator('tbody tr');
  const group = (name: string) => page.getByRole('group', { name: `Filter by ${name}`, exact: true });
  const reset = () => page.getByRole('button', { name: 'Reset monsters filters', exact: true }).click();
  const bounds = () => page.locator('.filter-group, .data-table-header-wrap').evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await expect(rows).toHaveCount(12);
  for (const name of ['runes', 'artifacts', 'relic', 'skill-ups']) {
    await expect(group(name).locator('[aria-pressed="true"]')).toHaveCount(0);
  }
  const before = await bounds();
  await page.screenshot({ path: testInfo.outputPath('none-selected.png') });
  for (const [name, counts] of [['runes', [3, 6, 3]], ['artifacts', [4, 4, 4]]] as const) {
    for (const [index, option] of coverage.entries()) {
      await group(name).getByRole('button', { name: option, exact: true }).click();
      await expect(rows).toHaveCount(counts[index]);
      expect(await bounds()).toEqual(before);
      await reset();
    }
  }
  for (const option of ['Yes', 'No']) {
    await group('relic').getByRole('button', { name: option, exact: true }).click();
    await expect(rows).toHaveCount(6);
    await reset();
  }
  for (const option of ['None', 'Partial', 'Full']) {
    await group('skill-ups').getByRole('button', { name: option, exact: true }).click();
    await expect(rows).toHaveCount(3);
    expect(await bounds()).toEqual(before);
    await reset();
  }
  await group('runes').getByRole('button', { name: 'Partial', exact: true }).click();
  await group('artifacts').getByRole('button', { name: 'Partial', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await group('relic').getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await group('skill-ups').getByRole('button', { name: 'Partial', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('combined.png') });
  await page.reload();
  await expect(rows).toHaveCount(1);
  await reset();
  for (const name of ['runes', 'artifacts', 'relic', 'skill-ups']) {
    for (const button of await group(name).getByRole('button').all()) await button.click();
  }
  await expect(rows).toHaveCount(12);
  expect(await bounds()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('all-selected.png') });
  await reset();
  await group('runes').getByRole('button', { name: 'None', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await page.getByLabel('Content', { exact: true }).selectOption('Arena');
  await expect(rows).toHaveCount(2);
  await group('artifacts').getByRole('button', { name: 'None', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await group('relic').getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await group('runes').getByRole('button', { name: 'All', exact: true }).click();
  await group('runes').getByRole('button', { name: 'None', exact: true }).click();
  await expect(page.getByText('No monsters match these filters. Clear a filter to see more.')).toBeVisible();
  expect(await bounds()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('no-matches.png') });
});

for (const selectedRunes of [undefined, ['Unknown']]) test(`stored filters survive an unreadable new choice: ${JSON.stringify(selectedRunes)}`, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'gear-filters.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.evaluate((runes) => sessionStorage.setItem('jaswa.filters.monsters', JSON.stringify({
    search: 'Elucia', selectedElements: ['Water'], selectedArchetypes: [],
    showStorage: false, showInventory: true, showBelowMaxLevel: true, showRainbowmons: true,
    selectedRunes: runes,
  })), selectedRunes);
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Filter monsters by name or set' })).toHaveValue('Elucia');
  await expect(page.getByRole('group', { name: 'Filter by element', exact: true }).getByRole('button', { name: 'WAT' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Lvl. < 40', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Filter by runes', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Storage', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
