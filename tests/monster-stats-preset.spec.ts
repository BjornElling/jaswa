import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Monster Stats reads one context at a time (`docs/DECK-PRESETS.md` §4): it
 * opens on Default, and a chosen preset lists its own team with the runes each
 * member carries there, never Default's.
 */

const account = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
const defaultRunesOf11 = account.unit_list[0].runes.map((rune: { rune_id: number }) => rune.rune_id);
/* Arena Attack 1 hands monster 11's Default runes to monster 12 and leaves 11
   bare; Giant's Keep 1 saves its monster only, which then runs on Default. */
const withDeck = {
  ...account,
  deck_list: [
    { deck_type: 1, deck_seq: 1, leader_unit_id: 0, unit_id_list: [12, 11, 0, 0], equip: [
      { unit_id: 12, rune_id_list: defaultRunesOf11, artifact_id_list: [] },
      { unit_id: 11, rune_id_list: [], artifact_id_list: [] },
    ] },
    { deck_type: 24, deck_seq: 101, leader_unit_id: 0, unit_id_list: [11, 0, 0, 0, 0], equip: null },
  ],
};

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

test('opens on Default and reads a chosen preset from its own runes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'preset-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withDeck)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monster Stats', exact: true })).toBeVisible();

  const content = page.getByLabel('Content', { exact: true });
  const area = page.getByLabel('Area', { exact: true });
  const preset = page.getByLabel('Preset', { exact: true });
  const table = page.getByRole('table', { name: 'Monster stats' });
  const runeCells = () => table.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.children[2]?.textContent ?? ''));
  await expect(content).toHaveValue('Default');
  await expect(area).toBeDisabled();
  await expect(preset).toBeDisabled();
  /* Only the tabs that hold a preset are offered: this page reads presets and makes none. */
  await expect(content.locator('option')).toHaveText(['Default', 'Arena', 'Cairos']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const defaultSets = await runeCells();
  expect(defaultSets[0]).not.toBe('—');
  const filters = page.getByRole('group', { name: 'Filter by element' });
  const before = await filters.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('default.png') });

  await content.selectOption('Arena');
  await expect(area.locator('option')).toHaveText(['Arena Attack']);
  await expect(preset.locator('.preset-team-name')).toHaveText('Arena Attack 1');
  /* The team in its own order: 12 first, now on 11's Default runes, and 11 bare. */
  await expect(table.locator('tbody tr')).toHaveCount(2);
  expect(await runeCells()).toEqual([defaultSets[0], '—']);
  expect(await filters.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('arena-attack-1.png') });

  /* A preset that saves its monsters only reads them on their Default runes. */
  await content.selectOption('Cairos');
  await expect(area).toHaveValue("Giant's Keep");
  await expect(preset.locator('.preset-team-name')).toHaveText("Giant's Keep 1");
  expect(await runeCells()).toEqual([defaultSets[0]]);
  expect(await filters.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('giants-keep-1.png') });

  /* The choice is a context, not a filter: resetting the filters keeps it. */
  await page.getByRole('button', { name: 'Lvl. < 40' }).click();
  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await expect(content).toHaveValue('Cairos');
});
