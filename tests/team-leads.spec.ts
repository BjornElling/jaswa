import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A preset's leads are read off its leaders (`team-leads.ts`); only Scenario
 * states them by hand. The account's leaders, from the speed fixture:
 * 1 Wind, ATK 30 % on Wind monsters; 2 ATK 21 % in arena; 3 Fire, SPD 28 % in
 * dungeons; 5 ATK 33 % in dungeons; 6 HP 33 % everywhere.
 */
const fixture = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));
const deck = (type: number, seq: number, members: number[], leader: number) =>
  ({ deck_type: type, deck_seq: seq, unit_id_list: members, leader_unit_id: leader, equip: null });

async function open(page: Page) {
  const source = JSON.parse(readFileSync(fixture, 'utf8'));
  source.deck_list = [
    deck(3, 1, [1, 3, 0, 0, 0, 0], 1),
    deck(3, 2, [2, 6, 0, 0, 0, 0], 2),
    deck(3, 3, [6, 4, 0, 0, 0, 0], 6),
    deck(3, 4, [5, 1, 0, 0, 0, 0], 5),
    deck(1, 1, [2, 1, 0, 0], 2),
    deck(1, 2, [1, 0, 0, 0], 0),
  ];
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'team-leads.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
}

async function profile(page: Page, presetId: string, unitId: string) {
  await page.getByLabel('Preset', { exact: true }).selectOption(presetId);
  await page.getByLabel('Monster', { exact: true }).selectOption(unitId);
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  return page.getByRole('dialog');
}

const leadLines = (page: Page) => page.getByRole('dialog').getByRole('list', { name: 'Leads and bonuses' }).getByRole('listitem');

test('a Rift Raid deck fights under the leaders of Rift Raid 1, 2 and 3, each lead read off its leader', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const dialog = await profile(page, 'deck-3-1', '1');
  /* Its own leader first, then the battle's other decks; Rift Raid 4 is not one of them. */
  await expect(leadLines(page)).toHaveText(['ATK30%', 'ATK21%', 'HP33%']);
  const [own, arena, hp] = [0, 1, 2].map((at) => leadLines(page).nth(at));
  await expect(own).toHaveAttribute('data-state', 'counts');
  await expect(hp).toHaveAttribute('data-state', 'counts');
  /* An arena lead counts in no raid: kept on its line, struck through, with a red mark saying where it would. */
  await expect(arena).toHaveAttribute('data-state', 'unreached');
  await expect(arena.locator('.overlay-team-lead-value')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(arena.getByRole('img', { name: 'Only counts in arena.' })).toBeVisible();
  await expect(own.getByRole('img')).toHaveCount(0);
  await expect(dialog.getByRole('spinbutton', { name: /, in percent$/ })).toHaveCount(0);
  /* The counted leads reach the composites, and only them. */
  await expect(dialog.locator('.stat-range[data-figure="dmg"]').getByRole('img', { name: /ATK lead \(\+30% base ATK\)/ })).toBeVisible();
  await expect(dialog.locator('.stat-range[data-figure="ehp"]').getByRole('img', { name: /HP lead \(\+33% base HP\)/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rift-raid-wind.png') });

  /* The same battle for a Fire member: the Wind lead names its element. */
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await profile(page, 'deck-3-1', '3');
  await expect(leadLines(page).nth(0)).toHaveAttribute('data-state', 'unreached');
  await expect(leadLines(page).nth(0).getByRole('img', { name: 'Only counts on Wind monsters.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rift-raid-fire.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  /* Rift Raid 4 fights alone, under its own dungeon lead, which no raid counts. */
  await profile(page, 'deck-3-4', '1');
  await expect(leadLines(page)).toHaveText(['ATK33%']);
  await expect(leadLines(page).first()).toHaveAttribute('data-state', 'unreached');
});

test('the leads block keeps its box from Scenario to a preset, empty or led', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const boxes = () => page.getByRole('dialog').locator('.overlay-settings > .overlay-block, .overlay-gear').evaluateAll((elements) =>
    elements.map((element) => { const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));

  /* Scenario: the four typed leads, as before. */
  let dialog = await profile(page, 'scenario', '1');
  await expect(dialog.getByRole('group', { name: 'Leads and bonuses' }).getByRole('spinbutton')).toHaveCount(4);
  const scenario = await boxes();
  await page.screenshot({ path: testInfo.outputPath('scenario-leads.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* A preset with no leader says so, in the same box. */
  dialog = await profile(page, 'deck-1-2', '1');
  await expect(leadLines(page)).toHaveText(['No leader in this preset']);
  expect(await boxes()).toEqual(scenario);
  await page.screenshot({ path: testInfo.outputPath('no-leader.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* Three leaders, the most any battle has, in the same box. */
  dialog = await profile(page, 'deck-3-1', '1');
  await expect(leadLines(page)).toHaveCount(3);
  expect(await boxes()).toEqual(scenario);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* An arena lead counts in Arena Attack. */
  await profile(page, 'deck-1-1', '1');
  await expect(leadLines(page)).toHaveText(['ATK21%']);
  await expect(leadLines(page).first()).toHaveAttribute('data-state', 'counts');
  expect(await boxes()).toEqual(scenario);
  await page.screenshot({ path: testInfo.outputPath('arena-lead.png') });
});

test('a lead typed in Scenario stays Scenario\'s, and a preset of the same copy reads its leader instead', async ({ page }) => {
  await open(page);
  let dialog = await profile(page, 'scenario', '1');
  await dialog.getByRole('spinbutton', { name: 'ATK, in percent' }).fill('50');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  dialog = await profile(page, 'deck-1-1', '1');
  await expect(dialog.locator('.stat-range[data-figure="dmg"]').getByRole('img', { name: /ATK lead \(\+21% base ATK\)/ })).toBeVisible();
  /* Copying the Scenario profile into the area brings everything but its lead. */
  await dialog.getByRole('combobox', { name: 'Copy the profile from another area' }).selectOption({ label: 'Scenario' });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}').monsterPreferences);
  expect(stored.scenario['1'].atkLead).toBe(50);
  expect(stored['content:arena-attack']?.['1']?.atkLead).toBeUndefined();
});
