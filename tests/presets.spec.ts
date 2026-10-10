import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The Presets page (`docs/DECK-PRESETS.md` §5) and the one place a preset's
 * priority list is read: Rune Optimization leaves the runes of a higher-ranked
 * monster *of the same preset* alone unless told otherwise, and treats a rune
 * engraved only in other presets as free.
 */

const base = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
/* Default: 11 carries 5001–5006 and 12 carries 5007–5012; 5013 onward is in inventory. */
const arenaEleven = [5013, 5021, 5029, 5037, 5045, 5053];
const account = {
  ...base,
  deck_list: [
    /* Arena Attack 4 saves its own gear: 12 leads and is listed first, with three runes; 11 has six from the inventory. */
    { deck_type: 1, deck_seq: 4, unit_id_list: [12, 11, 0, 0], leader_unit_id: 12, equip: [
      { unit_id: 12, rune_id_list: [5007, 5008, 5009], artifact_id_list: [] },
      { unit_id: 11, rune_id_list: arenaEleven, artifact_id_list: [] },
    ] },
    /* Giant's Keep 1 saves 11 alone, on its Default gear. */
    { deck_type: 24, deck_seq: 101, unit_id_list: [11, 0, 0, 0, 0], equip: null },
    /* A deck the game has not told JASWA the content of. */
    { deck_type: 99, deck_seq: 1, unit_id_list: [12], equip: null },
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

async function importAccount(page: Page) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'presets-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('presets-account.json').first()).toBeVisible();
}

async function openPresets(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Presets' }).click();
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeVisible();
}

async function openOptimization(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
}

async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  });
}

const contentChoice = (page: Page) => page.getByLabel('Content', { exact: true });
const areaChoice = (page: Page) => page.getByLabel('Area', { exact: true });
const presetChoice = (page: Page) => page.getByLabel('Preset', { exact: true });
/* The game's tabs, every one on every account, before the decks not yet named. */
const tabs = ['Default', 'Arena', 'Guild', 'Cairos', 'Trial of Ascension', 'Temple of Chaos', 'Rift of Worlds', 'Dimension Hole'];
const tabOf: Record<string, string> = { 'Arena Attack': 'Arena', 'Arena Defense': 'Arena', "Giant's Keep": 'Cairos' };

/* A content is its tab, then its area in the tab's menu. */
async function chooseContent(page: Page, content: string) {
  const tab = tabOf[content] ?? content;
  await contentChoice(page).selectOption(tab);
  if (tab !== content) await areaChoice(page).selectOption(content);
}
const chosenPreset = (page: Page) => presetChoice(page).locator('.preset-team-name');
const teamOption = (page: Page, name: string) => page.getByRole('listbox').getByRole('option')
  .filter({ has: page.locator('.preset-team-name').getByText(name, { exact: true }) });
const addMenu = (page: Page) => page.getByLabel('Add mon', { exact: true });

/* A content first, then one of its presets from the list with the faces. */
async function choosePreset(page: Page, content: string, name: string) {
  await chooseContent(page, content);
  await presetChoice(page).click();
  await teamOption(page, name).click();
  await expect(chosenPreset(page)).toHaveText(name);
}
const places = (page: Page) => page.locator('.monster-priority-place').allInnerTexts();
const order = (page: Page) => page.locator('.monster-priority-entry .monster-name').allInnerTexts();
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}'));

/* Each copy's name as the page writes it, read once from Default's menu. */
async function copyNames(page: Page): Promise<Record<'11' | '12', string>> {
  await contentChoice(page).selectOption('Default');
  const read = async (value: string) => (await addMenu(page).locator(`option[value="${value}"]`).innerText()).trim();
  return { 11: await read('11'), 12: await read('12') };
}

test('without an import the page says what it needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openPresets(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await expect(contentChoice(page)).toHaveCount(0);
  await expect(presetChoice(page)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('presets-no-import.png'), fullPage: true });
});

test('the page opens on Default, and a content\'s presets are chosen by their faces', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);

  await expect(contentChoice(page)).toHaveValue('Default');
  await expect(presetChoice(page)).toBeDisabled();
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await expect(addMenu(page)).toBeEnabled();
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeDisabled();
  /* Default has no content to add a preset to. */
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeDisabled();
  /* Only the contents, as the game groups them: Default alone, each content, then the decks not yet named. */
  await expect(contentChoice(page).locator('option')).toHaveText([...tabs, 'Not yet named']);
  await expect(areaChoice(page)).toBeDisabled();
  await expect(areaChoice(page)).toHaveValue('Default');
  const fields = () => page.locator('.monster-priority-add-panel > *').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10).join(',');
    }));
  const still = await fields();
  await page.screenshot({ path: testInfo.outputPath('presets-choose.png'), fullPage: true });

  /* A content opens on its first area, and the area on its first preset, in the
     fields below it; the fields were there all along, so nothing moves. */
  await contentChoice(page).selectOption('Arena');
  await expect(areaChoice(page)).toBeEnabled();
  await expect(areaChoice(page).locator('option')).toHaveText(['Arena Attack', 'Arena Defense', 'Arena Interserver Defense']);
  await expect(areaChoice(page)).toHaveValue('Arena Attack');
  await expect(presetChoice(page)).toBeEnabled();
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  await expect(page.locator('.monster-priority-entry')).toHaveCount(2);
  /* A game preset's monsters are the game's. */
  await expect(addMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeEnabled();
  expect(await fields()).toEqual(still);
  await presetChoice(page).click();
  await expect(presetChoice(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await expect(teamOption(page, 'Arena Attack 4').locator('.monster-portrait')).toHaveCount(2);
  expect(await fields()).toEqual(still);
  await page.screenshot({ path: testInfo.outputPath('presets-team-list.png'), fullPage: true });
  await teamOption(page, 'Arena Attack 4').click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  await expect(presetChoice(page).locator('.monster-portrait')).toHaveCount(2);
  await expect(presetChoice(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeEnabled();
  expect(await fields()).toEqual(still);
  await page.screenshot({ path: testInfo.outputPath('presets-team-chosen.png'), fullPage: true });

  /* Every content of a tab is in its menu, the empty ones too, and an empty one has no preset to pick. */
  await contentChoice(page).selectOption('Dimension Hole');
  await expect(areaChoice(page).locator('option')).toHaveText(['Forest of Roaring Beasts', 'Sanctuary of Dreaming Fairies',
    'Cliff of Tough Beast Men', 'Ruin of Silent Death', 'Castle of Forgotten Heroes', 'Hellground of Raging Fires',
    'Dimension Raid Phase 1', 'Dimension Raid Phase 2', 'Dimension Raid Phase 3']);
  await expect(presetChoice(page)).toBeDisabled();
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await expect(page.getByText('No presets here yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeEnabled();
  expect(await fields()).toEqual(still);
  await contentChoice(page).selectOption('Temple of Chaos');
  await expect(areaChoice(page)).toBeDisabled();
  await expect(areaChoice(page)).toHaveValue('Temple of Chaos');
  expect(await fields()).toEqual(still);

  /* Another area of the same tab opens on its own first preset too. */
  await contentChoice(page).selectOption('Arena');
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  await areaChoice(page).selectOption('Arena Defense');
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await areaChoice(page).selectOption('Arena Attack');
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');

  /* The keys: arrows open and walk, Enter takes, Escape leaves the choice alone. */
  await chooseContent(page, "Giant's Keep");
  await expect(chosenPreset(page)).toHaveText("Giant's Keep 1");
  await presetChoice(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(chosenPreset(page)).toHaveText("Giant's Keep 1");
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(chosenPreset(page)).toHaveText("Giant's Keep 1");
  await expect(page.locator('.monster-priority-entry')).toHaveCount(1);

  /* Default is chosen from the content field outright. */
  await contentChoice(page).selectOption('Default');
  await expect(presetChoice(page)).toBeDisabled();
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await expect(addMenu(page)).toBeEnabled();
  expect(await fields()).toEqual(still);
});

test('Default\'s list is built from the menu, ordered three ways, and kept', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  await contentChoice(page).selectOption('Default');

  /* Empty by default, and saying what to do. */
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  const menu = addMenu(page);
  await expect(menu).toBeEnabled();
  const addPanel = page.locator('.monster-priority-add-panel');
  const panelBox = await box(addPanel);
  const menuBox = await box(menu);
  await page.screenshot({ path: testInfo.outputPath('priority-empty.png'), fullPage: true });

  const names = await menu.locator('option:not([value=""])').allInnerTexts();
  expect(names).toHaveLength(2);
  /* Opening the menu fetches the portraits, so an added monster arrives with its face. */
  const warming = page.waitForRequest(/\/monster-images\//, { timeout: 2000 });
  await menu.focus();
  await warming;
  await menu.selectOption('12');
  await menu.selectOption('11');

  /* Added in the order chosen, numbered from #1, and gone from the menu. */
  expect(await places(page)).toEqual(['#1', '#2']);
  expect((await order(page)).length).toBe(2);
  await expect(menu).toHaveValue('');
  await expect(menu).toBeDisabled();
  /* Picking from the menu moves nothing above the list. */
  expect(await box(addPanel)).toEqual(panelBox);
  expect(await box(menu)).toEqual(menuBox);
  /* A rule between entries, none under the last. */
  const rules = await page.locator('.monster-priority-entry').evaluateAll((entries) => entries.map((entry) => getComputedStyle(entry).borderBottomWidth));
  expect(rules).toEqual(['1px', '0px']);
  /* What each copy has engraved in Default: six runes, no artifacts, no relic. */
  const firstEntry = page.locator('.monster-priority-entry').first();
  await expect(firstEntry.getByRole('img', { name: '6 of 6 runes engraved' })).toHaveText('6/6');
  await expect(firstEntry.getByRole('img', { name: '0 of 2 artifacts engraved' })).toHaveText('0/2');
  await expect(firstEntry.getByRole('img', { name: 'No relic' })).toBeVisible();
  expect(await firstEntry.locator('.speed-summary-mark').evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-state'))))
    .toEqual(['good', 'bad', 'bad']);
  /* The column names stand over their cells. */
  const head = await box(page.locator('.monster-priority-head > span').nth(4));
  const runesCell = await box(firstEntry.locator('.monster-priority-gear').first());
  expect(Math.abs(head.x - runesCell.x)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('priority-full.png'), fullPage: true });

  const initial = await order(page);
  expect(new Set(initial)).toEqual(new Set(names));

  /* The arrows. */
  const top = initial[0];
  await page.getByRole('button', { name: `Move ${top} down` }).click();
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  await expect(page.getByRole('button', { name: `Move ${initial[1]} up` })).toBeDisabled();
  await page.getByRole('button', { name: `Move ${top} up` }).click();
  expect(await order(page)).toEqual(initial);

  /* Dragging. */
  const entries = page.locator('.monster-priority-entry');
  await entries.nth(0).dragTo(entries.nth(1), { targetPosition: { x: 40, y: 40 } });
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  expect(await places(page)).toEqual(['#1', '#2']);

  /* Kept across a reload with the preset still open, and stored as unit ids. */
  await page.reload();
  await openPresets(page);
  await expect(contentChoice(page)).toHaveValue('Default');
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  expect((await stored(page)).monsterPriority).toHaveLength(2);

  /* Removing takes the entry out and gives it back to the menu. */
  await page.getByRole('button', { name: `Remove ${initial[0]} from this preset` }).click();
  expect(await order(page)).toEqual([initial[1]]);
  await expect(addMenu(page)).toBeEnabled();
  await page.getByRole('button', { name: `Remove ${initial[1]} from this preset` }).click();
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
});

type SavedDeck = { deck_type: number; deck_seq: number; leader_unit_id?: number };
/* The game's presets as the import now holds them in IndexedDB. */
const savedDecks = (page: Page) => page.evaluate(async () => new Promise<SavedDeck[]>((resolve) => {
  const request = indexedDB.open('jaswa-local', 1);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
    read.onsuccess = () => { resolve(read.result.data.deck_list); db.close(); };
  };
}));

test('a game preset shows the game\'s monsters and gear; its order, leader and place are the user\'s', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  /* The game's own order; every monster of the account already stands in it, so nobody to add. */
  expect(await order(page)).toEqual([names[12], names[11]]);
  await expect(addMenu(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: `Remove ${names[12]} from this preset` })).toBeEnabled();
  await expect(page.getByRole('button', { name: `Remove ${names[11]} from this preset` })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeEnabled();
  /* The game's leader is marked on its crown, and every crown is a control. */
  const entries = page.locator('.monster-priority-entry');
  const crown11 = page.getByRole('button', { name: `${names[11]} leads this preset` });
  const crown12 = page.getByRole('button', { name: `${names[12]} leads this preset` });
  await expect(crown12).toHaveAttribute('aria-pressed', 'true');
  await expect(crown11).toHaveAttribute('aria-pressed', 'false');
  /* Gear read from the preset, not from Default: 12 carries six runes in Default and three here. */
  await expect(entries.nth(0).getByRole('img', { name: '3 of 6 runes engraved' })).toHaveText('3/6');
  await expect(entries.nth(1).getByRole('img', { name: '6 of 6 runes engraved' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('preset-game.png'), fullPage: true });

  /* Reordered, the order is stored for this preset alone, and survives a reload. */
  await page.getByRole('button', { name: `Move ${names[11]} up` }).click();
  expect(await order(page)).toEqual([names[11], names[12]]);
  expect((await stored(page)).presetPriority).toEqual({ 'deck-1-4': ['11', '12'] });
  expect((await stored(page)).monsterPriority).toEqual([]);
  await page.reload();
  await openPresets(page);
  await expect(contentChoice(page)).toHaveValue('Arena');
  await expect(areaChoice(page)).toHaveValue('Arena Attack');
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  expect(await order(page)).toEqual([names[11], names[12]]);

  /* The crown passes the lead and takes it away, written into the import and moving nothing. */
  const layout = () => page.locator('.monster-priority-entry, .monster-priority-entry > *, .monster-priority-add-panel').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10).join(',');
    }));
  const still = await layout();
  const arenaFour = async () => (await savedDecks(page)).find((deck) => deck.deck_type === 1 && deck.deck_seq === 4)?.leader_unit_id;
  await crown11.click();
  await expect(crown11).toHaveAttribute('aria-pressed', 'true');
  await expect(crown12).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(arenaFour).toBe(11);
  expect(await layout()).toEqual(still);
  await crown11.click();
  await expect(crown11).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(arenaFour).toBe(0);
  await crown12.click();
  await expect.poll(arenaFour).toBe(12);
  await page.reload();
  await openPresets(page);
  await expect(crown12).toHaveAttribute('aria-pressed', 'true');

  /* A preset that saved its monsters only runs them on their Default gear. */
  await choosePreset(page, "Giant's Keep", "Giant's Keep 1");
  expect(await order(page)).toEqual([names[11]]);
  await expect(entries.first().getByRole('img', { name: '6 of 6 runes engraved' })).toBeVisible();
  /* A deck whose content is not yet named is still read in full. */
  await choosePreset(page, 'Not yet named', 'Deck 99 · 1');
  expect(await order(page)).toEqual([names[12]]);

  /* Deleted, it is gone from the import; the last deck not yet named takes that entry with it, and the page is back on Default. */
  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(contentChoice(page)).toHaveValue('Default');
  await expect(contentChoice(page).locator('option')).toHaveText(tabs);
  await expect.poll(async () => (await savedDecks(page)).map((deck) => `${deck.deck_type}-${deck.deck_seq}`)).toEqual(['1-4', '24-101']);
  await page.reload();
  await openPresets(page);
  await expect(contentChoice(page).locator('option')).toHaveText(tabs);
});

type SavedTeam = { deck_type: number; deck_seq: number; unit_id_list: number[]; leader_unit_id?: number;
  equip: Array<{ unit_id: number; rune_id_list: number[] }> | null };

test('a game preset takes monsters in and out while live sync is off, written into the import', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);
  const deck = async (type: number, sequence: number) => (await savedDecks(page) as unknown as SavedTeam[])
    .find((entry) => entry.deck_type === type && entry.deck_seq === sequence);

  /* A preset that saved monsters only: the newcomer fills the first empty position. */
  await choosePreset(page, "Giant's Keep", "Giant's Keep 1");
  await page.screenshot({ path: testInfo.outputPath('game-preset-before-add.png') });
  await addMenu(page).selectOption('12');
  await expect.poll(async () => order(page)).toEqual([names[11], names[12]]);
  await expect.poll(async () => (await deck(24, 101))?.unit_id_list).toEqual([11, 12, 0, 0, 0]);
  expect((await deck(24, 101))?.equip).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('game-preset-after-add.png') });

  /* Taken out, its position is emptied as the game writes one; taking every monster out leaves a preset that says what to do. */
  await page.getByRole('button', { name: `Remove ${names[11]} from this preset` }).click();
  await page.getByRole('button', { name: `Remove ${names[12]} from this preset` }).click();
  await expect.poll(async () => (await deck(24, 101))?.unit_id_list).toEqual([0, 0, 0, 0, 0]);
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('game-preset-empty.png') });

  /* A preset that saves its gear: the leader taken out takes its runes and the crown; back in, it brings its Default runes. */
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await page.getByRole('button', { name: `Remove ${names[12]} from this preset` }).click();
  await expect.poll(async () => deck(1, 4)).toMatchObject({ unit_id_list: [0, 11, 0, 0], leader_unit_id: 0,
    equip: [{ unit_id: 11, rune_id_list: arenaEleven }] });
  await addMenu(page).selectOption('12');
  await expect.poll(async () => (await deck(1, 4))?.unit_id_list).toEqual([12, 11, 0, 0]);
  expect((await deck(1, 4))?.equip?.find((entry) => entry.unit_id === 12)?.rune_id_list).toEqual([5007, 5008, 5009, 5010, 5011, 5012]);
  await expect(page.locator('.monster-priority-entry').filter({ hasText: names[12] }).getByRole('img', { name: '6 of 6 runes engraved' })).toBeVisible();

  /* Kept across a reload. */
  await page.reload();
  await openPresets(page);
  await choosePreset(page, "Giant's Keep", "Giant's Keep 1");
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
});

test('a preset built here is created, filled, led and deleted without moving the page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  /* A preset is added to the chosen content, offered the name the game would give its next one.
     The dialog opens on that name, Escape closes it and gives focus back. */
  await chooseContent(page, 'Arena Attack');
  const create = page.getByRole('button', { name: 'Add preset' });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Add preset' });
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await expect(dialog.getByLabel('Name')).toHaveValue('Arena Attack 5');
  await expect(dialog.getByRole('button', { name: 'Add preset' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();

  await create.click();
  await dialog.getByLabel('Name').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Add preset' })).toBeDisabled();
  await dialog.getByLabel('Name').fill('Arena draft');
  /* It starts in the content chosen on the page. */
  await expect(dialog.getByLabel('Content')).toHaveValue('arena-attack');
  /* The content menu keeps focus however long it is open: the helper poll re-renders the page every two seconds. */
  await dialog.getByLabel('Content').focus();
  await page.waitForTimeout(3000);
  await expect(dialog.getByLabel('Content')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('preset-create-dialog.png') });
  await dialog.getByRole('button', { name: 'Add preset' }).click();
  await expect(dialog).toHaveCount(0);

  /* Created, it is the chosen preset, in its content after the game's, empty and saying what to do. */
  await expect(contentChoice(page)).toHaveValue('Arena');
  await expect(areaChoice(page)).toHaveValue('Arena Attack');
  await expect(contentChoice(page).locator('option')).toHaveText([...tabs, 'Not yet named']);
  await expect(chosenPreset(page)).toHaveText('Arena draft');
  await presetChoice(page).click();
  await expect(page.getByRole('listbox').locator('.preset-team-name')).toHaveText(['Arena Attack 4', 'Arena draft']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeEnabled();
  await addMenu(page).selectOption('11');
  await addMenu(page).selectOption('12');
  expect(await order(page)).toEqual([names[11], names[12]]);

  /* The crown is a toggle in its own fixed box: choosing or moving the leader moves nothing (AGENTS.md §2). */
  const crown11 = page.getByRole('button', { name: `${names[11]} leads this preset` });
  const crown12 = page.getByRole('button', { name: `${names[12]} leads this preset` });
  await expect(crown11).toHaveAttribute('aria-pressed', 'false');
  await expect(crown12).toHaveAttribute('aria-pressed', 'false');
  const layout = () => page.locator('.monster-priority-entry, .monster-priority-entry > *, .monster-priority-add-panel').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10).join(',');
    }));
  const still = await layout();
  await page.screenshot({ path: testInfo.outputPath('preset-own-no-leader.png') });
  await crown12.click();
  await expect(crown12).toHaveAttribute('aria-pressed', 'true');
  expect(await layout()).toEqual(still);
  await crown11.click();
  await expect(crown11).toHaveAttribute('aria-pressed', 'true');
  await expect(crown12).toHaveAttribute('aria-pressed', 'false');
  expect(await layout()).toEqual(still);
  /* The state is shown by colour alone: the leader's crown in full, the others dimmed. */
  await page.mouse.move(0, 0);
  await expect(crown11).toHaveCSS('color', 'rgb(217, 173, 82)');
  await expect(crown11).toHaveCSS('opacity', '1');
  await expect(crown12).not.toHaveCSS('color', 'rgb(217, 173, 82)');
  await expect(crown12).not.toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('preset-own-leader.png') });
  await crown11.click();
  await expect(crown11).toHaveAttribute('aria-pressed', 'false');
  await crown12.click();

  /* Its order is its members' order. */
  await page.getByRole('button', { name: `Move ${names[12]} up` }).click();
  expect(await order(page)).toEqual([names[12], names[11]]);
  const own = (await stored(page)).presets;
  expect(own).toHaveLength(1);
  expect(own[0]).toMatchObject({ name: 'Arena draft', content: 'arena-attack', members: ['12', '11'], leaderUnitId: '12', gear: null });

  /* Removing the leader takes the crown with it. */
  await page.getByRole('button', { name: `Remove ${names[12]} from this preset` }).click();
  expect(await order(page)).toEqual([names[11]]);
  expect((await stored(page)).presets[0]).toMatchObject({ members: ['11'], leaderUnitId: null });

  /* Kept across a reload; deleted, it is gone, and the page stays in its content, on the game's preset it still has. */
  await page.reload();
  await openPresets(page);
  await expect(chosenPreset(page)).toHaveText('Arena draft');
  expect(await order(page)).toEqual([names[11]]);
  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(contentChoice(page)).toHaveValue('Arena');
  await expect(areaChoice(page)).toHaveValue('Arena Attack');
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  expect((await stored(page)).presets).toEqual([]);
});

test('a preset cannot be added, deleted or led here while live sync owns the presets', async ({ page }) => {
  await page.route('http://127.0.0.1:37654/**', (route) => route.fulfill({ status: 503, body: '' }));
  await freshWorkspace(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...preferences, importRoute: 'direct', directImportMode: 'live',
      updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  await importAccount(page);
  await openPresets(page);
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  const create = page.getByRole('button', { name: 'Add preset' });
  await expect(create).toBeDisabled();
  await expect(create).toHaveAttribute('title', 'Automatic synchronization is on: presets come from the game.');
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /from this preset$/ }).first()).toBeDisabled();
  /* The game's leader is shown, not offered. */
  await expect(page.locator('.monster-priority-entry').first().getByRole('img', { name: 'Leader' })).toBeVisible();
  await expect(page.getByRole('button', { name: /leads this preset$/ })).toHaveCount(0);
});

test('on Read on game start a game preset is the user\'s: led, added to, taken from and deleted', async ({ page }, testInfo) => {
  await page.route('http://127.0.0.1:37654/**', (route) => route.fulfill({ status: 503, body: '' }));
  await freshWorkspace(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...preferences, importRoute: 'direct', directImportMode: 'on-load',
      updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await page.screenshot({ path: testInfo.outputPath('on-load-game-preset.png') });
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeEnabled();
  const crown11 = page.getByRole('button', { name: `${names[11]} leads this preset` });
  await crown11.click();
  await expect(crown11).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `Remove ${names[12]} from this preset` }).click();
  await expect.poll(async () => order(page)).toEqual([names[11]]);
  /* Back in, it takes the first empty position, which is the one it left. */
  await addMenu(page).selectOption('12');
  await expect.poll(async () => order(page)).toEqual([names[12], names[11]]);
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeEnabled();
});

test('Optimize opens Rune Optimization on that monster in that preset', async ({ page }) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  await choosePreset(page, "Giant's Keep", "Giant's Keep 1");
  await page.getByRole('button', { name: /^Optimize runes for / }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('deck-24-101');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  /* Every preset remains reachable; only the chosen preset's members are offered. */
  const preset = page.getByLabel('Preset', { exact: true });
  const monster = page.getByLabel('Monster', { exact: true });
  await expect(preset.locator('optgroup')).toHaveCount(0);
  await expect(preset.locator('option')).toHaveText(['Default', 'Arena Attack 4', "Giant's Keep 1", 'Deck 99 · 1']);
  expect(await monster.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['', '11']);
  await preset.selectOption('deck-99-1');
  await expect(preset).toHaveValue('deck-99-1');
  await expect(monster).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeDisabled();
  await monster.selectOption('12');
  await preset.selectOption('deck-1-4');
  await expect(monster).toHaveValue('12');
  await preset.selectOption('default');
  await expect(monster).toHaveValue('12');
});

test('preset comes first, and empty presets keep the search controls in place', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    preferences.updatedAt = new Date().toISOString();
    preferences.presets = [{ id: 'own-empty', name: 'Empty team', content: null, members: [], leaderUnitId: null, gear: null }];
    localStorage.setItem('jaswa-preferences', JSON.stringify(preferences));
  });
  await page.reload();
  await openOptimization(page);
  const preset = page.getByLabel('Preset', { exact: true });
  const monster = page.getByLabel('Monster', { exact: true });
  const rank = page.getByLabel('Rank by', { exact: true });
  const find = page.getByRole('button', { name: 'Find builds' });
  const controls = [preset, monster, rank, find];
  const before = await Promise.all(controls.map(box));
  await page.screenshot({ path: testInfo.outputPath('preset-first-unselected.png'), fullPage: true });
  await preset.selectOption('deck-24-101');
  await expect(monster).toHaveValue('');
  expect(await monster.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['', '11']);
  await monster.selectOption('11');
  await expect(find).toBeEnabled();
  await expect(rank).toBeEnabled();
  expect(await Promise.all(controls.map(box))).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('preset-first-selected.png'), fullPage: true });
  await preset.selectOption('own-empty');
  await expect(preset).toHaveValue('own-empty');
  await expect(monster).toBeDisabled();
  await expect(monster.locator('option')).toHaveText(['No monsters in this preset']);
  await expect(find).toBeDisabled();
  await expect(rank).toBeDisabled();
  expect(await Promise.all(controls.map(box))).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('preset-first-empty-team.png'), fullPage: true });
  await page.reload();
  await openOptimization(page);
  await expect(preset).toHaveValue('own-empty');
  await expect(monster).toHaveValue('');
  await preset.selectOption('deck-1-4');
  await monster.selectOption('12');
  await expect(find).toBeEnabled();
});

test('Speed tuning opens the preset\'s team in Speed Tuning, from any of its rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);
  const speed = (name: string, preset: string) => page.getByRole('button', { name: `Speed tuning for ${preset}, from ${name}` });

  /* Default has no team; every preset with monsters is one, its content named or not. */
  await addMenu(page).selectOption('12');
  await expect(speed(names[12], 'Default')).toBeDisabled();
  await choosePreset(page, 'Not yet named', 'Deck 99 · 1');
  await expect(speed(names[12], 'Deck 99 · 1')).toBeEnabled();

  /* Left of Optimize, in the same dress. */
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  const button = speed(names[11], 'Arena Attack 4');
  const optimize = page.getByRole('button', { name: `Optimize runes for ${names[11]}` });
  await expect(button).toBeEnabled();
  const [at, next] = [await box(button), await box(optimize)];
  expect(at.x + at.width).toBeLessThan(next.x);
  expect(at.height).toBe(next.height);
  expect(await button.evaluate((element) => element.className)).toBe(await optimize.evaluate((element) => element.className));
  await page.screenshot({ path: testInfo.outputPath('preset-speed-button.png') });

  await button.click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await expect(team).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('preset-speed-overlay.png') });
  /* Closed, it stays closed on Speed Tuning; Back goes to Presets. */
  await page.keyboard.press('Escape');
  await expect(team).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeVisible();
  /* The rail asks for the page alone. */
  await page.getByRole('navigation').getByRole('button', { name: 'Speed tuning' }).click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the monster overlay names the preset its build is for, and Optimize opens it there', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  /* From Arena Attack 4 the overlay reads 12 there: its three runes, not Default's six. */
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await page.locator('.monster-priority-entry').first().locator('.monster-link').click();
  const dialog = page.getByRole('dialog');
  const box = dialog.getByRole('group', { name: 'Build for preset' });
  await expect(box.getByLabel('Build for', { exact: true })).toHaveValue('deck-1-4');
  await expect(box).toHaveCSS('border-top-color', 'rgb(217, 173, 82)');
  const filled = (scope: Locator) => scope.getByRole('list', { name: 'Engraved runes' }).locator('.engraved-rune:not([data-empty])');
  await expect(filled(dialog)).toHaveCount(3);
  const optimize = dialog.getByRole('button', { name: `Optimize runes for ${names[12]}` });
  const [boxAt, optimizeAt] = [await box.boundingBox(), await optimize.boundingBox()];
  expect(optimizeAt!.x + optimizeAt!.width).toBeLessThanOrEqual(boxAt!.x);
  await page.screenshot({ path: testInfo.outputPath('overlay-preset-box.png') });
  await optimize.click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('deck-1-4');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('12');

  /* In Default, it says so. */
  await page.getByLabel('Preset', { exact: true }).selectOption('default');
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByRole('dialog').getByLabel('Build for', { exact: true })).toHaveValue('default');
  await expect(filled(page.getByRole('dialog'))).toHaveCount(6);
});

test('a monster opened from a preset\'s Speed Tuning team is read and optimized in that preset, not Default', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  /* The program stands on Default; the team names its own preset. */
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await page.getByRole('region', { name: 'Arena', exact: true }).getByRole('button', { name: /^Arena Attack 4: / }).click();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await page.screenshot({ path: testInfo.outputPath('speed-team-before.png') });
  await team.getByRole('button', { name: names[12], exact: true }).click();
  const overlay = page.getByRole('dialog').filter({ has: page.getByRole('group', { name: 'Build for preset' }) });
  await expect(overlay.getByLabel('Build for', { exact: true })).toHaveValue('deck-1-4');
  await expect(overlay.getByRole('list', { name: 'Engraved runes' }).locator('.engraved-rune:not([data-empty])')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('speed-team-monster.png') });

  await overlay.getByRole('button', { name: `Optimize runes for ${names[12]}` }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('deck-1-4');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('12');

  /* Opened from a place about no preset, the overlay still reads the program's choice. */
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByRole('dialog').getByLabel('Build for', { exact: true })).toHaveValue('deck-1-4');
});

test('the monster overlay Optimize button shares the preset row\'s hover', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  await contentChoice(page).selectOption('Default');
  await addMenu(page).selectOption('12');
  const row = page.locator('.monster-priority-entry');
  const priorityAction = row.getByRole('button', { name: /^Optimize runes for / });
  await priorityAction.hover();
  await expect(priorityAction).toHaveCSS('color', 'rgb(217, 173, 82)');
  const hover = async (button: Locator) => button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, borderColor: style.borderColor, backgroundColor: style.backgroundColor };
  });
  const priorityColors = await hover(priorityAction);
  await row.locator('.monster-link').click();
  const dialog = page.getByRole('dialog');
  const action = dialog.getByRole('button', { name: /^Optimize runes for / });
  const before = await box(action);
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-rest.png') });
  await action.hover();
  await expect.poll(() => hover(action)).toEqual(priorityColors);
  expect(await box(action)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-hover.png') });
});

/* The status line's count of runes a search could use. */
async function considered(page: Page) {
  const status = page.getByRole('status').filter({ hasText: 'runes considered' });
  await expect(status).toBeVisible();
  return Number((await status.innerText()).match(/([\d,.]+) runes considered/)?.[1].replace(/[,.]/g, ''));
}

async function find(page: Page) {
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  return considered(page);
}

test('Rune Optimization leaves a higher-priority monster\'s runes in the same preset alone until told otherwise', async ({ page }, testInfo) => {
  /* Several complete searches and the priority edits share this test's time budget. */
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  const freeOnly = page.getByLabel('Only runes not engraved in preset');
  const include = page.getByLabel('Include runes from higher-priority monsters');
  /* Both off, and neither ever disables the other. */
  await expect(freeOnly).not.toBeChecked();
  await expect(include).not.toBeChecked();

  /* The game lists 12 first in Arena Attack 4, so 12's runes there are spared for 11. */
  const spared = await find(page);
  const includeBox = await box(include);
  const freeBox = await box(freeOnly);
  await include.check();
  const withEveryone = await find(page);
  expect(spared).toBeLessThan(withEveryone);
  await include.uncheck();

  /* 11 above 12 in this preset: nothing is spared for 11. */
  await openPresets(page);
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  await page.getByRole('button', { name: `Move ${names[11]} up` }).click();
  await openOptimization(page);
  expect(await find(page)).toBe(withEveryone);

  /* 12 back on top: spared again. Default's empty list has no say in a preset. */
  await openPresets(page);
  await page.getByRole('button', { name: `Move ${names[12]} up` }).click();
  await openOptimization(page);
  expect(await find(page)).toBe(spared);

  /* Taking only what is free in the preset leaves the other switch as it is, enabled and in place;
     with two monsters, sparing the other one and taking from nobody refuse the same runes. */
  await freeOnly.check();
  await expect(include).toBeEnabled();
  await expect(include).not.toBeChecked();
  expect(await box(include)).toEqual(includeBox);
  expect(await box(freeOnly)).toEqual(freeBox);
  expect(await find(page)).toBe(spared);
  await page.screenshot({ path: testInfo.outputPath('preset-optimization-switches.png'), fullPage: true });
});

test('a rune engraved on a monster in another preset is free here, and an engrave stays in its preset', async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openOptimization(page);

  /* Default: 12 carries six runes, and with only free runes allowed they are refused. */
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('default');
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Only runes not engraved in preset').check();
  const inDefault = await find(page);

  /* Giant's Keep 1 holds 11 alone: 12's Default runes are engraved in another context and cost this preset nothing. */
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-24-101');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  const inKeep = await find(page);
  expect(inKeep).toBeGreaterThan(inDefault);
  await page.screenshot({ path: testInfo.outputPath('preset-free-candidates.png'), fullPage: true });

  /* Engraved here, the build is written into this preset and nowhere else. */
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  const circleBefore = await box(detail.locator('.rune-build-circle'));
  await detail.screenshot({ path: testInfo.outputPath('preset-build-inventory.png') });
  await detail.getByRole('button', { name: 'Engrave on monster' }).click();
  await expect(detail.getByRole('button', { name: 'Engraved', exact: true })).toBeDisabled();
  expect(await box(detail.locator('.rune-build-circle'))).toEqual(circleBefore);
  await detail.screenshot({ path: testInfo.outputPath('preset-build-engraved.png') });
  type Data = { runes: Array<{ rune_id: number; occupied_type: number; occupied_id: number }>; deck_list: Array<{ deck_type: number; deck_seq: number; equip: Array<{ unit_id: number; rune_id_list: number[] }> | null }> };
  const saved = await page.evaluate(async () => new Promise<Data>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
      read.onsuccess = () => { resolve(read.result.data); db.close(); };
    };
  }));
  const keep = saved.deck_list.find((entry) => entry.deck_type === 24 && entry.deck_seq === 101);
  expect(keep?.equip).toHaveLength(1);
  expect(keep?.equip?.[0].unit_id).toBe(11);
  expect(keep?.equip?.[0].rune_id_list).toHaveLength(6);
  /* Default and the other presets are as imported. */
  const placed = (data: { runes: Data['runes'] }) => data.runes.map((rune) => `${rune.rune_id}:${rune.occupied_type}:${rune.occupied_id}`).sort();
  const imported = [...base.runes, ...base.unit_list.flatMap((unit: { runes: Data['runes'] }) => unit.runes)];
  expect(placed(saved)).toEqual(placed({ runes: imported }));
  expect(saved.deck_list.filter((entry) => entry !== keep)).toEqual(account.deck_list.filter((entry) => !(entry.deck_type === 24)));
});

test('a rune on the optimized monster in Default is inventory in another preset', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  /* The only six runes are on 11 in Default. Arena Attack 1 saves 11 with
     empty slots, so each must be engraved in this preset despite its Default owner. */
  const locationRunes = base.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11).runes
    .map((rune: { slot_no: number; pri_eff: number[] }) => ({ ...rune,
      pri_eff: rune.slot_no === 2 ? [8, 42] : rune.slot_no === 4 || rune.slot_no === 6 ? [4, 63] : rune.pri_eff }));
  const locationAccount = {
    ...base,
    runes: [],
    unit_list: base.unit_list.map((unit: { unit_id: number; runes: unknown[] }) =>
      ({ ...unit, runes: unit.unit_id === 11 ? locationRunes : [] })),
    deck_list: [{ deck_type: 1, deck_seq: 1, unit_id_list: [11, 0, 0, 0], leader_unit_id: 11,
      equip: [{ unit_id: 11, rune_id_list: [], artifact_id_list: [] }] }],
  };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'preset-location.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(locationAccount)),
  });
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-1');
  await find(page);
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  const cards = detail.locator('.rune-build-card');
  await expect(cards).toHaveCount(6);
  await expect(detail.locator('.overlay-facts')).toContainText('Changes6');
  for (const card of await cards.all()) {
    await expect(card.locator('.rune-build-card-where').first()).toHaveText('LocationInventory');
  }
  const circleBefore = await box(detail.locator('.rune-build-circle'));
  await detail.screenshot({ path: testInfo.outputPath('default-engraved-preset-inventory.png') });
  await detail.getByRole('button', { name: 'Engrave on monster' }).click();
  await expect(detail.getByRole('button', { name: 'Engraved', exact: true })).toBeDisabled();
  expect(await box(detail.locator('.rune-build-circle'))).toEqual(circleBefore);
  await detail.screenshot({ path: testInfo.outputPath('default-engraved-preset-engraved.png') });
});

test('a rune on another monster in Default names that monster in a preset build', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  const locationRunes = base.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11).runes
    .map((rune: { slot_no: number; pri_eff: number[] }) => ({ ...rune, occupied_id: 12,
      pri_eff: rune.slot_no === 2 ? [8, 42] : rune.slot_no === 4 || rune.slot_no === 6 ? [4, 63] : rune.pri_eff }));
  const locationAccount = {
    ...base,
    runes: [],
    unit_list: base.unit_list.map((unit: { unit_id: number; runes: unknown[] }) =>
      ({ ...unit, runes: unit.unit_id === 12 ? locationRunes : [] })),
    deck_list: [{ deck_type: 1, deck_seq: 1, unit_id_list: [11, 0, 0, 0], leader_unit_id: 11,
      equip: [{ unit_id: 11, rune_id_list: [], artifact_id_list: [] }] }],
  };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'other-monster-location.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(locationAccount)),
  });
  /* As after the other monster was rebuilt in this preset by JASWA: it carried these runes here
     at import and has given them up, while Default still has them on it — the game shows them
     on that monster before and after, so a Previously would only repeat Location. */
  await page.evaluate(async (runeIds) => new Promise<void>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const store = request.result.transaction('workspace', 'readwrite').objectStore('workspace');
      const read = store.get('imported-game');
      read.onsuccess = () => {
        const game = read.result;
        game.loadedPlacements = { 'deck-1-1': Object.fromEntries(runeIds.map((id: number) => [String(id), '12'])) };
        store.put(game, 'imported-game').onsuccess = () => { request.result.close(); resolve(); };
      };
    };
  }), locationRunes.map((rune: { rune_id: number }) => rune.rune_id));
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await openOptimization(page);
  const otherName = (await page.getByLabel('Monster', { exact: true }).locator('option[value="12"]').innerText()).trim();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-1');
  await find(page);
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.locator('.rune-build-card')).toHaveCount(6);
  /* Free in the preset, each names the monster carrying it in Default, by name alone as the game does. */
  for (const card of await detail.locator('.rune-build-card').all()) {
    await expect(card.locator('.rune-build-card-where').first()).toHaveText(`Location${otherName}`);
    await expect(card.locator('.rune-build-card-where').nth(1)).toHaveAttribute('data-visible', 'false');
  }
  await detail.screenshot({ path: testInfo.outputPath('other-monster-engraved.png') });

  /* Engraved in the preset, each card says where its rune was as Location said it then: on the other monster, not in the inventory. */
  await detail.getByRole('button', { name: 'Engrave on monster' }).click();
  await expect(detail.getByRole('button', { name: 'Engraved' })).toBeVisible();
  for (const card of await detail.locator('.rune-build-card').all()) {
    await expect(card.locator('.rune-build-card-where').first()).toContainText('This monster');
    await expect(card.locator('.rune-build-card-where').nth(1)).toHaveText(`Previously${otherName}`);
  }
  await detail.screenshot({ path: testInfo.outputPath('other-monster-previously.png') });
});

/* Rune Optimization's preset and monster, then the profile they read. */
async function openProfileIn(page: Page, unitId: string, presetId: string) {
  await openOptimization(page);
  await page.getByLabel('Preset', { exact: true }).selectOption(presetId);
  await page.getByLabel('Monster', { exact: true }).selectOption(unitId);
  await page.getByRole('button', { name: 'Open profile' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Build for', { exact: true })).toHaveValue(presetId);
  return dialog;
}
const spdAtMost = (scope: Page | Locator) => scope.getByLabel('Spd: at most', { exact: true });
const ceilings = async (page: Page) => {
  const profiles = (await stored(page)).monsterPreferences as Record<string, Record<string, { statCeilings?: unknown }>>;
  return Object.fromEntries(Object.entries(profiles).flatMap(([contextId, copies]) =>
    copies['12'] ? [[contextId, copies['12'].statCeilings]] : []));
};

test('a profile is the copy\'s in one preset: an edit in Default reaches no preset, and one in a preset reaches no other', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);

  /* Nothing filled in: 12 states nothing anywhere, in Default or a preset. */
  let dialog = await openProfileIn(page, '12', 'deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('');
  await expect(dialog.getByLabel('Copy the profile from another preset')).toBeDisabled();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  /* The reported case: a max Spd stated in Default. */
  dialog = await openProfileIn(page, '12', 'default');
  await spdAtMost(dialog).fill('150');
  /* An unsaved edit holds the panel to its preset, so it cannot be carried across. */
  await expect(dialog.getByLabel('Build for', { exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);

  /* Arena Attack 4 does not see it. */
  dialog = await openProfileIn(page, '12', 'deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('profile-preset-untouched.png') });
  await spdAtMost(dialog).fill('180');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  expect(await ceilings(page)).toEqual({ default: { spd: 150 }, 'deck-1-4': { spd: 180 } });

  /* The requirements Rune Optimization starts from are the chosen preset's own. */
  await expect(spdAtMost(page)).toHaveValue('180');
  await page.getByLabel('Preset', { exact: true }).selectOption('default');
  await expect(spdAtMost(page)).toHaveValue('150');
  /* A change made on the page for one preset is not carried into another. */
  await spdAtMost(page).fill('170');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  await expect(spdAtMost(page)).toHaveValue('180');
  await page.getByLabel('Preset', { exact: true }).selectOption('default');
  await expect(spdAtMost(page)).toHaveValue('150');

  /* In the overlay, the box switches the profile read, and moves nothing beside it. */
  await page.getByRole('button', { name: 'Open profile' }).click();
  dialog = page.getByRole('dialog');
  const group = dialog.getByRole('group', { name: 'Build for preset' });
  const before = await box(group);
  await page.screenshot({ path: testInfo.outputPath('profile-switch-before.png') });
  await dialog.getByLabel('Build for', { exact: true }).selectOption('deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('180');
  await dialog.getByLabel('Build for', { exact: true }).selectOption('deck-99-1');
  await expect(spdAtMost(dialog)).toHaveValue('');
  expect(await box(group)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('profile-switch-after.png') });

  /* Everything filled in: a profile copied from Default is a copy, not a link. */
  await expect(dialog.getByLabel('Copy the profile from another preset')).toBeEnabled();
  await dialog.getByLabel('Copy the profile from another preset').selectOption('default');
  await expect(spdAtMost(dialog)).toHaveValue('150');
  await expect(dialog.getByLabel('Copy the profile from another preset')).toHaveValue('');
  expect(await box(group)).toEqual(before);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  dialog = await openProfileIn(page, '12', 'default');
  await spdAtMost(dialog).fill('140');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  expect(await ceilings(page)).toEqual({ default: { spd: 140 }, 'deck-1-4': { spd: 180 }, 'deck-99-1': { spd: 150 } });
});

test('a copy is named by the preset it is read in', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  const dialog = await openProfileIn(page, '12', 'deck-1-4');
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill('Arena opener');
  await dialog.getByRole('textbox', { name: 'Nickname' }).press('Enter');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await openPresets(page);
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await expect(page.locator('.monster-priority-entry .monster-name').first()).toHaveText(`${names[12]} (Arena opener)`);
  await page.screenshot({ path: testInfo.outputPath('nickname-in-preset.png') });
  /* Default, and the other preset 12 stands in, keep the game's name. */
  expect(await copyNames(page)).toEqual(names);
  await choosePreset(page, 'Not yet named', 'Deck 99 · 1');
  await expect(page.locator('.monster-priority-entry .monster-name').first()).toHaveText(names[12]);
});
