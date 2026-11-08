import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The Presets page (`docs/DECK-PRESETS.md` §5) and the one place a preset's
 * priority list is read: Rune Optimization can borrow a teammate's rune by
 * priority, and takes a rune another deck of its pool holds only when included.
 */

const base = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
/* Scenario: 11 carries 5001–5006 and 12 carries 5007–5012; 5013 onward is in inventory. */
const arenaEleven = [5013, 5021, 5029, 5037, 5045, 5053];
const account = {
  ...base,
  deck_list: [
    /* Arena Attack 4 saves its own gear: 12 leads and is listed first, with three runes; 11 has six from the inventory. */
    { deck_type: 1, deck_seq: 4, unit_id_list: [12, 11, 0, 0], leader_unit_id: 12, equip: [
      { unit_id: 12, rune_id_list: [5007, 5008, 5009], artifact_id_list: [] },
      { unit_id: 11, rune_id_list: arenaEleven, artifact_id_list: [] },
    ] },
    /* Giant's Keep 1 saves 11 alone, on its Scenario gear. */
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
const tabs = ['Scenario', 'Arena', 'Guild', 'Cairos', 'Trial of Ascension', 'Temple of Chaos', 'Rift of Worlds', 'Dimension Hole'];
const tabOf: Record<string, string> = { 'Arena Attack': 'Arena', 'Arena Defense': 'Arena', "Giant's Keep": 'Cairos' };

/* A content is its tab, then its area in the tab's menu. */
async function chooseContent(page: Page, content: string) {
  const tab = tabOf[content] ?? content;
  await contentChoice(page).selectOption(tab);
  if (tab !== content && await areaChoice(page).inputValue() !== content) await areaChoice(page).selectOption(content);
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

/* Each copy's name as the page writes it, read once from Scenario's menu. */
async function copyNames(page: Page): Promise<Record<'11' | '12', string>> {
  await contentChoice(page).selectOption('Scenario');
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

test('the page opens on Scenario, and a content\'s presets are chosen by their faces', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);

  await expect(contentChoice(page)).toHaveValue('Scenario');
  await expect(presetChoice(page)).toBeDisabled();
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await expect(addMenu(page)).toBeEnabled();
  await expect(page.getByText('Nobody here yet.', { exact: false })).toBeVisible();
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeDisabled();
  /* Scenario has no content to add a preset to. */
  await expect(page.getByRole('button', { name: 'Add preset' })).toBeDisabled();
  /* Only the contents, as the game groups them: Scenario alone, each content, then the decks not yet named. */
  await expect(contentChoice(page).locator('option')).toHaveText([...tabs, 'Not yet named']);
  await expect(areaChoice(page)).toBeDisabled();
  await expect(areaChoice(page)).toHaveValue('Scenario');
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

  /* Scenario is chosen from the content field outright. */
  await contentChoice(page).selectOption('Scenario');
  await expect(presetChoice(page)).toBeDisabled();
  await expect(chosenPreset(page)).toHaveText('Choose preset');
  await expect(addMenu(page)).toBeEnabled();
  expect(await fields()).toEqual(still);
});

test('Scenario\'s list is built from the menu, ordered three ways, and kept', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  await contentChoice(page).selectOption('Scenario');

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
  /* What each copy has engraved in Scenario: six runes, no artifacts, no relic. */
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
  await expect(contentChoice(page)).toHaveValue('Scenario');
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
  /* Gear read from the preset, not from Scenario: 12 carries six runes in Scenario and three here. */
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

  /* A preset that saved its monsters only runs them on their Scenario gear. */
  await choosePreset(page, "Giant's Keep", "Giant's Keep 1");
  expect(await order(page)).toEqual([names[11]]);
  await expect(entries.first().getByRole('img', { name: '6 of 6 runes engraved' })).toBeVisible();
  /* A deck whose content is not yet named is still read in full. */
  await choosePreset(page, 'Not yet named', 'Preset 99 · 1');
  expect(await order(page)).toEqual([names[12]]);

  /* Deleted, it is gone from the import; the last deck not yet named takes that entry with it, and the page is back on Scenario. */
  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(contentChoice(page)).toHaveValue('Scenario');
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

  /* A preset that saves its gear: the leader taken out takes its runes and the crown; back in, it brings its Scenario runes. */
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

test('a game preset cannot be deleted, led or changed while live sync owns it, and one of JASWA\'s can still be added', async ({ page }) => {
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
  /* Every control live sync turns off gives the one same reason. */
  const reason = 'Always synchronized is on, so this comes from the game.';
  /* A preset built here lives in the preferences, which no sync overwrites. */
  const create = page.getByRole('button', { name: 'Add preset' });
  await expect(create).toBeEnabled();
  await expect(create).not.toHaveAttribute('title', reason);
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete preset' })).toHaveAttribute('title', reason);
  await expect(addMenu(page)).toBeDisabled();
  await expect(addMenu(page)).toHaveAttribute('title', reason);
  await expect(page.getByRole('button', { name: /from this preset$/ }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /from this preset$/ }).first()).toHaveAttribute('title', reason);
  await expect(page.locator('.monster-priority-note')).toHaveText(/^With Always synchronized on, the game decides the monsters and the leader of its own presets\. /);
  /* The game's leader is shown, not offered. */
  await expect(page.locator('.monster-priority-entry').first().getByRole('img', { name: 'Leader' })).toBeVisible();
  await expect(page.locator('.monster-priority-entry').first().locator('.preset-leader')).toHaveAttribute('title', reason);
  await expect(page.getByRole('button', { name: /leads this preset$/ })).toHaveCount(0);
  /* And Speed Tuning reports the game's leader with the same reason. */
  await page.getByRole('button', { name: 'Speed tuning for Arena Attack 4', exact: true }).click();
  const leads = page.getByRole('dialog', { name: 'Arena Attack 4' }).getByRole('checkbox', { name: /leads Arena Attack 4$/ });
  await expect(leads.first()).toBeDisabled();
  await expect(leads.first()).toHaveAttribute('title', reason);
  await page.keyboard.press('Escape');

  /* A preset built here is the user's whole under live sync too: added, filled, led and deleted. */
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Add preset' });
  await dialog.getByLabel('Name').fill('Live draft');
  await dialog.getByRole('button', { name: 'Add preset' }).click();
  await expect(chosenPreset(page)).toHaveText('Live draft');
  await expect(addMenu(page)).toBeEnabled();
  await expect(addMenu(page)).not.toHaveAttribute('title', reason);
  await addMenu(page).selectOption('11');
  await expect(page.locator('.monster-priority-entry')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /leads this preset$/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete preset' })).toBeEnabled();
  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(chosenPreset(page)).not.toHaveText('Live draft');
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
  /* Nothing is off, so nothing gives live sync as a reason. */
  await expect(page.locator('[title^="Always synchronized"]')).toHaveCount(0);
  await expect(page.locator('.monster-priority-note')).toHaveText(/^The order decides/);
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
  await expect(preset.locator('option')).toHaveText(['Scenario', 'Arena Attack 4', "Giant's Keep 1", 'Preset 99 · 1']);
  expect(await monster.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['', '11']);
  await preset.selectOption('deck-99-1');
  await expect(preset).toHaveValue('deck-99-1');
  await expect(monster).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeDisabled();
  await monster.selectOption('12');
  await preset.selectOption('deck-1-4');
  await expect(monster).toHaveValue('12');
  await preset.selectOption('scenario');
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
  await expect(rank).toBeEnabled();
  /* No figure named yet, so nothing to find until one is. */
  await expect(find).toBeDisabled();
  await rank.selectOption('spd');
  await expect(find).toBeEnabled();
  expect(await Promise.all(controls.map(box))).toEqual(before);
  /* A preset with monsters is a team, so the way to its Speed Tuning opens. */
  const speed = page.getByRole('button', { name: /^Speed tuning for / });
  await expect(speed).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('preset-first-selected.png'), fullPage: true });
  await preset.selectOption('own-empty');
  await expect(speed).toBeDisabled();
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
  await rank.selectOption('dmg');
  await expect(find).toBeEnabled();
  /* And it opens that team over this page, which keeps its choices behind it. */
  const opener = page.getByRole('button', { name: /^Speed tuning for / });
  await opener.click();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await expect(team).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('preset-speed-tuning-opened.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(team).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(preset).toHaveValue('deck-1-4');
  await expect(monster).toHaveValue('12');
  await expect(rank).toHaveValue('dmg');
});

test('Speed tuning opens the preset\'s team over Presets, from the one button beneath the preset\'s own', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const speed = (preset: string) => page.getByRole('button', { name: `Speed tuning for ${preset}`, exact: true });

  /* Scenario has no team; every preset with monsters is one, its content named or not. */
  await addMenu(page).selectOption('12');
  await expect(speed('Scenario')).toBeDisabled();
  await choosePreset(page, 'Not yet named', 'Preset 99 · 1');
  await expect(speed('Preset 99 · 1')).toBeEnabled();

  /* One for the whole team, at the foot of the preset's buttons, and none on the rows. */
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  const button = speed('Arena Attack 4');
  await expect(button).toBeEnabled();
  await expect(page.locator('.monster-priority-list').getByRole('button', { name: /^Speed tuning/ })).toHaveCount(0);
  const [create, remove, at] = [await box(page.getByRole('button', { name: 'Add preset' })),
    await box(page.getByRole('button', { name: 'Delete preset' })), await box(button)];
  expect(create.y).toBeLessThan(remove.y);
  expect(remove.y + remove.height).toBeLessThan(at.y);
  expect(at.x).toBe(remove.x);
  expect(at.width).toBe(remove.width);
  await page.screenshot({ path: testInfo.outputPath('preset-speed-button.png') });

  await button.click();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await expect(team).toBeVisible();
  /* Over Presets, where the user is; Speed Tuning is never visited. */
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('preset-speed-overlay.png') });
  /* Closed, Presets stands as it was left, and focus is back on the button. */
  await page.keyboard.press('Escape');
  await expect(team).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.getByLabel('Preset', { exact: true }).locator('.preset-team-name')).toHaveText('Arena Attack 4');

  /* A choice saved there is the same choice Speed Tuning shows. */
  await button.click();
  await team.getByRole('checkbox', { name: 'No speed tuning' }).check();
  await team.getByRole('button', { name: 'Save changes' }).click();
  await expect(team).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Arena Attack 4: / }).locator('.speed-summary-state'))
    .toHaveText(/^(Turn order holds|Tied · position decides|\d+ of \d+ out of place) · No speed tuning$/);
});

test('the monster overlay names the preset its build is for, and Optimize opens it there', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  /* From Arena Attack 4 the overlay reads 12 there: its three runes, not Scenario's six. */
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await page.locator('.monster-priority-entry').first().locator('.monster-link').click();
  const dialog = page.getByRole('dialog');
  const box = dialog.getByRole('group', { name: 'Build for area' });
  await expect(box.getByLabel('Build for', { exact: true })).toHaveValue('content:arena-attack');
  await expect(box.getByLabel('Build for', { exact: true })).toHaveCSS('color', 'rgb(217, 173, 82)');
  const filled = (scope: Locator) => scope.getByRole('list', { name: 'Engraved runes' }).locator('.engraved-rune:not([data-empty])');
  await expect(filled(dialog)).toHaveCount(3);
  const optimize = dialog.getByRole('button', { name: `Save and optimize runes for ${names[12]}` });
  const [boxAt, optimizeAt] = [await box.boundingBox(), await optimize.boundingBox()];
  expect(optimizeAt!.y).toBeGreaterThanOrEqual(boxAt!.y + boxAt!.height);
  await page.screenshot({ path: testInfo.outputPath('overlay-preset-box.png') });
  await optimize.click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('deck-1-4');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('12');

  /* In Scenario, it says so. */
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByRole('dialog').getByLabel('Build for', { exact: true })).toHaveValue('scenario');
  await expect(filled(page.getByRole('dialog'))).toHaveCount(6);
});

test('a monster opened from a preset\'s Speed Tuning team is read and optimized in that preset, not Scenario', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  const names = await copyNames(page);

  /* The program stands on Scenario; the team names its own preset. */
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await page.getByRole('region', { name: 'Arena', exact: true }).getByRole('button', { name: /^Arena Attack 4: / }).click();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await page.screenshot({ path: testInfo.outputPath('speed-team-before.png') });
  await team.getByRole('button', { name: names[12], exact: true }).click();
  const overlay = page.getByRole('dialog').filter({ has: page.getByRole('group', { name: 'Build for area' }) });
  await expect(overlay.getByLabel('Build for', { exact: true })).toHaveValue('content:arena-attack');
  await expect(overlay.getByRole('list', { name: 'Engraved runes' }).locator('.engraved-rune:not([data-empty])')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('speed-team-monster.png') });

  await overlay.getByRole('button', { name: `Save and optimize runes for ${names[12]}` }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('deck-1-4');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('12');

  /* Opened from a place about no preset, the overlay still reads the program's choice. */
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByRole('dialog').getByLabel('Build for', { exact: true })).toHaveValue('content:arena-attack');
});

test('the monster overlay Optimize button shares the preset row\'s hover', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPresets(page);
  await contentChoice(page).selectOption('Scenario');
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
  const action = dialog.getByRole('button', { name: /^Save and optimize runes for / });
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
  /* The fixture's profiles name no figure to rank by, and the page never picks one. */
  const rank = page.getByLabel('Rank by', { exact: true });
  if (await rank.inputValue() === '') await rank.selectOption('spd');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  return considered(page);
}

test('Rune Optimization borrows teammate runes by priority, and the switch only includes higher-priority monsters', async ({ page }, testInfo) => {
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
  /* Both off; Include is disabled only while free runes alone are taken. */
  await expect(freeOnly).not.toBeChecked();
  await expect(include).not.toBeChecked();

  /* The game lists 12 first in Arena Attack 4, so 11 cannot take its runes by default. */
  const spared = await find(page);
  const includeBox = await box(include);
  const freeBox = await box(freeOnly);
  await page.screenshot({ path: testInfo.outputPath('priority-include-before.png'), fullPage: true });
  await include.check();
  const withEveryone = await find(page);
  expect(withEveryone).toBeGreaterThan(spared);
  expect(await box(include)).toEqual(includeBox);
  await page.screenshot({ path: testInfo.outputPath('priority-include-after.png'), fullPage: true });
  await include.uncheck();

  /* A build found with higher-priority runes must not stay engravable after the switch is turned off. */
  const protectedRow = page.locator('tr[data-stale="true"]').filter({
    has: page.locator('[role="img"][aria-label*="other monsters’ runes are protected"]'),
  }).first();
  await expect(protectedRow).toBeVisible();
  const protectedBuild = protectedRow.getByRole('button', { name: /^Show build \d+$/ });
  await protectedBuild.click();
  const protectedDialog = page.getByRole('dialog');
  const engraveProtectedBuild = protectedDialog.getByRole('button', { name: 'Engrave on monster' });
  await expect(engraveProtectedBuild).toBeDisabled();
  await expect(engraveProtectedBuild).toHaveAttribute('title', 'A rune or set in this build no longer fits the current settings.');
  await page.screenshot({ path: testInfo.outputPath('priority-protected-build.png'), fullPage: true });
  await page.keyboard.press('Escape');

  /* Moving 11 above 12 makes 12's runes available without changing the switch. */
  await openPresets(page);
  await expect(chosenPreset(page)).toHaveText('Arena Attack 4');
  await page.getByRole('button', { name: `Move ${names[11]} up` }).click();
  await openOptimization(page);
  expect(await find(page)).toBe(withEveryone);

  /* Moving 12 back above 11 spares its runes again. */
  await openPresets(page);
  await page.getByRole('button', { name: `Move ${names[12]} up` }).click();
  await openOptimization(page);
  expect(await find(page)).toBe(spared);

  /* Taking only runes that are not engraved in the team leaves the priority switch nothing to
     decide: it is disabled, in place. */
  await freeOnly.check();
  await expect(include).toBeDisabled();
  await expect(include).not.toBeChecked();
  expect(await box(include)).toEqual(includeBox);
  expect(await box(freeOnly)).toEqual(freeBox);
  expect(await find(page)).toBe(spared);
  await page.screenshot({ path: testInfo.outputPath('preset-optimization-switches.png'), fullPage: true });
});

test('Rune Optimization lists monsters by priority, then alphabetically', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openOptimization(page);

  const monster = page.getByLabel('Monster', { exact: true });
  const options = async () => monster.locator('option').evaluateAll((elements) => elements
    .map((element) => element as HTMLOptionElement)
    .filter((option) => option.value !== '')
    .map((option) => ({ value: option.value, label: option.textContent?.trim() ?? '' })));

  /* With no Scenario priority set, the complete list stays alphabetical. */
  const alphabetical = await options();
  expect(alphabetical.length).toBeGreaterThan(1);
  await page.screenshot({ path: testInfo.outputPath('optimization-priority-empty.png'), fullPage: true });

  /* A single Scenario priority entry leads; the rest keep their alphabetical order. */
  await openPresets(page);
  await contentChoice(page).selectOption('Scenario');
  const prioritized = alphabetical.at(-1)!;
  await addMenu(page).selectOption(prioritized.value);
  await expect(page.locator('.monster-priority-entry')).toHaveCount(1);
  await openOptimization(page);
  const scenarioOptions = await options();
  expect(scenarioOptions).toEqual([prioritized, ...alphabetical.slice(0, -1)]);

  /* The game's preset carries its own list, which the same dropdown follows. */
  await openPresets(page);
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  let presetOrder = await order(page);
  if (JSON.stringify(presetOrder) === JSON.stringify(alphabetical.map(({ label }) => label))) {
    await page.getByRole('button', { name: `Move ${presetOrder[1]} up` }).click();
    presetOrder = await order(page);
  }
  await openOptimization(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  const presetMonster = page.getByLabel('Monster', { exact: true });
  await expect.poll(async () => (await options()).map(({ label }) => label)).toEqual(presetOrder);
  const before = await box(presetMonster);
  await page.screenshot({ path: testInfo.outputPath('optimization-priority-preset-empty.png'), fullPage: true });
  await presetMonster.selectOption('11');
  expect(await box(presetMonster)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('optimization-priority-preset-selected.png'), fullPage: true });
});

test('a Scenario monster off the priority list takes no engraved rune, and the switches name Scenario', async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openOptimization(page);
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const freeOnly = settings.getByRole('checkbox', { name: 'Only runes not already engraved in Scenario', exact: true });
  const includeAll = settings.getByRole('checkbox', { name: 'Include runes already engraved in Scenario', exact: true });
  await expect(freeOnly).not.toBeChecked();
  await expect(includeAll).not.toBeChecked();
  const freeBox = await box(freeOnly);
  const includeBox = await box(includeAll);

  /* 11 and 12 are both off Scenario's empty list: neither outranks the other, so
     12's six runes stay where they are, exactly as with only free runes. */
  const unlisted = await find(page);
  await page.screenshot({ path: testInfo.outputPath('scenario-unlisted.png'), fullPage: true });
  await freeOnly.check();
  expect(await find(page)).toBe(unlisted);
  await freeOnly.uncheck();
  await includeAll.check();
  expect(await find(page)).toBeGreaterThan(unlisted);
  await includeAll.uncheck();

  /* On the list, 11 outranks 12, which is off it: the switch is about priority again,
     in the same box. */
  await openPresets(page);
  await contentChoice(page).selectOption('Scenario');
  await addMenu(page).selectOption('11');
  await expect(page.locator('.monster-priority-entry')).toHaveCount(1);
  await openOptimization(page);
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  const include = settings.getByRole('checkbox', { name: 'Include runes from higher-priority monsters', exact: true });
  await expect(include).not.toBeChecked();
  expect(await box(include)).toEqual(includeBox);
  expect(await find(page)).toBeGreaterThan(unlisted);
  await page.screenshot({ path: testInfo.outputPath('scenario-listed.png'), fullPage: true });

  /* A game preset is a preset, and its switch says so, in the same box. */
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  const presetFreeOnly = settings.getByRole('checkbox', { name: 'Only runes not engraved in preset', exact: true });
  await expect(presetFreeOnly).toBeVisible();
  expect(await box(presetFreeOnly)).toEqual(freeBox);
  expect(await box(settings.getByRole('checkbox', { name: 'Include runes from higher-priority monsters', exact: true }))).toEqual(includeBox);
});

test('a rule in the Monster menu parts the priority list from the rest, only when both are there', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  const monster = page.getByLabel('Monster', { exact: true });
  /* What the menu lists, in order, with the rule written as `—`. */
  const menu = () => monster.evaluate((select) => [...select.children].map((child) =>
    child.tagName === 'HR' ? '—' : (child as HTMLOptionElement).value));
  /* The native popup is drawn outside the page, so the picture is of the same
     menu laid open in the page. */
  const picture = async (name: string) => {
    await monster.evaluate((select) => { (select as HTMLSelectElement).size = 6; select.style.height = 'auto'; });
    await monster.screenshot({ path: testInfo.outputPath(name) });
    await monster.evaluate((select) => { (select as HTMLSelectElement).size = 0; select.style.height = ''; });
  };

  await openOptimization(page);
  expect(await menu()).toEqual(['', '11', '12']);

  await openPresets(page);
  await contentChoice(page).selectOption('Scenario');
  await addMenu(page).selectOption('11');
  await openOptimization(page);
  expect(await menu()).toEqual(['', '11', '—', '12']);
  await picture('rule-between.png');
  /* The rule can be neither chosen nor stepped onto. */
  await monster.selectOption('12');
  await monster.press('ArrowUp');
  await expect(monster).toHaveValue('11');

  await openPresets(page);
  await addMenu(page).selectOption('12');
  await openOptimization(page);
  expect(await menu()).toEqual(['', '11', '12']);
});

test('a rune engraved on a monster in another preset is free here, and an engrave stays in its preset', async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openOptimization(page);

  /* Scenario: 12 carries six runes, and with only free runes allowed they are refused. */
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Only runes not already engraved in Scenario').check();
  const inScenario = await find(page);

  /* Giant's Keep 1 holds 11 alone: 12's Scenario runes are engraved in another context and cost this preset nothing. */
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-24-101');
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  const inKeep = await find(page);
  expect(inKeep).toBeGreaterThan(inScenario);
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
  /* Scenario and the other presets are as imported. */
  const placed = (data: { runes: Data['runes'] }) => data.runes.map((rune) => `${rune.rune_id}:${rune.occupied_type}:${rune.occupied_id}`).sort();
  const imported = [...base.runes, ...base.unit_list.flatMap((unit: { runes: Data['runes'] }) => unit.runes)];
  expect(placed(saved)).toEqual(placed({ runes: imported }));
  expect(saved.deck_list.filter((entry) => entry !== keep)).toEqual(account.deck_list.filter((entry: { deck_type: number }) => !(entry.deck_type === 24)));
});

test('a rune on the optimized monster in Scenario is inventory in another preset', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  /* The only six runes are on 11 in Scenario. Arena Attack 1 saves 11 with
     empty slots, so each must be engraved in this preset despite its Scenario owner. */
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
  await detail.screenshot({ path: testInfo.outputPath('scenario-engraved-preset-inventory.png') });
  await detail.getByRole('button', { name: 'Engrave on monster' }).click();
  await expect(detail.getByRole('button', { name: 'Engraved', exact: true })).toBeDisabled();
  expect(await box(detail.locator('.rune-build-circle'))).toEqual(circleBefore);
  await detail.screenshot({ path: testInfo.outputPath('scenario-engraved-preset-engraved.png') });
});

test('a rune another team of a team pool holds is withheld until included, names its team, and leaves it on engrave', async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  /* Temple of Chaos 1 holds 11 on the account's only six runes; Temple of Chaos 2 holds 12 on none.
     The two teams fight in one battle, so a rune stands in one of them only. */
  const elevenRunes = base.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11).runes;
  const runeIds = elevenRunes.map((rune: { rune_id: number }) => rune.rune_id);
  const poolAccount = {
    ...base,
    runes: [],
    unit_list: base.unit_list.map((unit: { unit_id: number; runes: unknown[] }) => ({ ...unit, runes: unit.unit_id === 11 ? elevenRunes : [] })),
    deck_list: [
      { deck_type: 23, deck_seq: 1, unit_id_list: [11, 0, 0, 0, 0], equip: [{ unit_id: 11, rune_id_list: runeIds, artifact_id_list: [] }] },
      { deck_type: 23, deck_seq: 2, unit_id_list: [12, 0, 0, 0, 0], equip: [{ unit_id: 12, rune_id_list: [], artifact_id_list: [] }] },
    ],
  };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'team-pool.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(poolAccount)),
  });
  await openOptimization(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-23-2');
  await page.getByLabel('Monster', { exact: true }).selectOption('12');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const freeOnly = settings.getByLabel('Only runes not engraved in preset');
  const include = settings.getByLabel('Include runes from higher-priority monsters');
  const rank = page.getByLabel('Rank by', { exact: true });
  if (await rank.inputValue() === '') await rank.selectOption('spd');

  /* Off, the other team's runes are not this team's to take: nothing fills a slot. */
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByText(/No rune can fill slot 1, 2, 3, 4, 5, 6/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('team-pool-withheld.png'), fullPage: true });

  /* Only free runes leaves Include nothing to decide, and the switch keeps its box. */
  const includeBox = await box(include);
  await freeOnly.check();
  await expect(include).toBeDisabled();
  expect(await box(include)).toEqual(includeBox);
  await freeOnly.uncheck();
  await expect(include).toBeEnabled();

  /* Included, the six runes are offered, and each card names the team holding it. */
  await include.check();
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.locator('.rune-build-card')).toHaveCount(6);
  for (const card of await detail.locator('.rune-build-card').all()) {
    await expect(card.locator('.rune-build-card-where').first()).toContainText('· Temple of Chaos 1');
    await expect(card.locator('.rune-build-card-where-value [title$="· Temple of Chaos 1"]')).toHaveCount(1);
  }
  const circleBefore = await box(detail.locator('.rune-build-circle'));
  await detail.screenshot({ path: testInfo.outputPath('team-pool-included.png') });

  /* Engraved, the runes leave Temple of Chaos 1, so the pool never holds one twice. */
  await detail.getByRole('button', { name: 'Engrave on monster' }).click();
  await expect(detail.getByRole('button', { name: 'Engraved', exact: true })).toBeDisabled();
  expect(await box(detail.locator('.rune-build-circle'))).toEqual(circleBefore);
  await detail.screenshot({ path: testInfo.outputPath('team-pool-engraved.png') });
  const decks = await page.evaluate(async () => new Promise<Array<{ deck_seq: number; equip: Array<{ unit_id: number; rune_id_list: number[] }> }>>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const read = request.result.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
      read.onsuccess = () => { resolve(read.result.data.deck_list); request.result.close(); };
    };
  }));
  const gearIn = (seq: number, unitId: number) => decks.find((entry) => entry.deck_seq === seq)?.equip.find((entry) => entry.unit_id === unitId)?.rune_id_list;
  expect(gearIn(1, 11)).toEqual([]);
  expect([...gearIn(2, 12) ?? []].sort()).toEqual([...runeIds].sort());
});

test('a rune two teams of a pool both carry is kept by neither until included, and engraving settles it', async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  /* The game let Temple of Chaos 1's 11 and Temple of Chaos 2's 12 be saved on the
     account's only six runes, and fields neither team with them. */
  const elevenRunes = base.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11).runes;
  const runeIds = elevenRunes.map((rune: { rune_id: number }) => rune.rune_id);
  const overlapAccount = {
    ...base,
    runes: [],
    unit_list: base.unit_list.map((unit: { unit_id: number; runes: unknown[] }) => ({ ...unit, runes: unit.unit_id === 11 ? elevenRunes : [] })),
    deck_list: [
      { deck_type: 23, deck_seq: 1, unit_id_list: [11, 0, 0, 0, 0], equip: [{ unit_id: 11, rune_id_list: runeIds, artifact_id_list: [] }] },
      { deck_type: 23, deck_seq: 2, unit_id_list: [12, 0, 0, 0, 0], equip: [{ unit_id: 12, rune_id_list: runeIds, artifact_id_list: [] }] },
    ],
  };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'team-overlap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(overlapAccount)),
  });
  await openOptimization(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-23-2');
  await page.getByLabel('Monster', { exact: true }).selectOption('12');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const include = settings.getByLabel('Include runes from higher-priority monsters');
  const rank = page.getByLabel('Rank by', { exact: true });
  if (await rank.inputValue() === '') await rank.selectOption('spd');

  /* Carrying them here is no claim: the other team holds them just as much. */
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByText(/No rune can fill slot 1, 2, 3, 4, 5, 6/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('team-overlap-withheld.png'), fullPage: true });

  /* Included, the build keeps them, names the other team, and is not yet engraved. */
  await include.check();
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.locator('.rune-build-card')).toHaveCount(6);
  for (const card of await detail.locator('.rune-build-card').all()) {
    await expect(card.locator('.rune-build-card-where').first()).toContainText('· Temple of Chaos 1');
  }
  const engrave = detail.getByRole('button', { name: 'Engrave on monster' });
  await expect(engrave).toBeEnabled();
  const circleBefore = await box(detail.locator('.rune-build-circle'));
  await detail.screenshot({ path: testInfo.outputPath('team-overlap-included.png') });

  /* Engraved, the runes leave Temple of Chaos 1: the overlap is settled in this team's favour. */
  await engrave.click();
  await expect(detail.getByRole('button', { name: 'Engraved', exact: true })).toBeDisabled();
  expect(await box(detail.locator('.rune-build-circle'))).toEqual(circleBefore);
  await detail.screenshot({ path: testInfo.outputPath('team-overlap-engraved.png') });
  const decks = await page.evaluate(async () => new Promise<Array<{ deck_seq: number; equip: Array<{ unit_id: number; rune_id_list: number[] }> }>>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const read = request.result.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
      read.onsuccess = () => { resolve(read.result.data.deck_list); request.result.close(); };
    };
  }));
  const gearIn = (seq: number, unitId: number) => decks.find((entry) => entry.deck_seq === seq)?.equip.find((entry) => entry.unit_id === unitId)?.rune_id_list;
  expect(gearIn(1, 11)).toEqual([]);
  expect([...gearIn(2, 12) ?? []].sort()).toEqual([...runeIds].sort());
});

test('a rune on another monster in Scenario names that monster in a preset build', async ({ page }, testInfo) => {
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
  /* As after the other monster was rebuilt in this preset by JASWA: it carried slots 1–3 here
     at import and has given them up, while Scenario still has them on it. The game's preset
     shows those three unengraved; slots 4–6, which the preset never held, still name it. */
  const freedRunes = locationRunes.filter((rune: { slot_no: number }) => rune.slot_no <= 3);
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
  }), freedRunes.map((rune: { rune_id: number }) => rune.rune_id));
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
  /* Free in the preset, each names the monster carrying it in Scenario, by name alone as the game
     does — unless it was taken off that very monster here, which leaves it unengraved here. */
  for (const card of await detail.locator('.rune-build-card').all()) {
    const slot = Number(await card.getAttribute('data-slot'));
    if (slot <= 3) {
      await expect(card.locator('.rune-build-card-where').first()).toHaveText('LocationInventory');
      await expect(card.locator('.rune-build-card-where').nth(1)).toHaveText(`Previously${otherName}`);
    } else {
      await expect(card.locator('.rune-build-card-where').first()).toHaveText(`Location${otherName}`);
      await expect(card.locator('.rune-build-card-where').nth(1)).toHaveAttribute('data-visible', 'false');
    }
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

test('a rune its Scenario monster no longer carries in the preset reads Inventory after a fresh import', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  const locationRunes = base.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11).runes
    .map((rune: { slot_no: number; pri_eff: number[] }) => ({ ...rune, occupied_id: 12,
      pri_eff: rune.slot_no === 2 ? [8, 42] : rune.slot_no === 4 || rune.slot_no === 6 ? [4, 63] : rune.pri_eff }));
  /* As the game exports it after the other monster was given new runes in this preset there:
     it is a member carrying none of them here, while Scenario still has all six on it. No
     memory of the move exists in JASWA, so the preset alone has to say where they are. */
  const locationAccount = {
    ...base,
    runes: [],
    unit_list: base.unit_list.map((unit: { unit_id: number; runes: unknown[] }) =>
      ({ ...unit, runes: unit.unit_id === 12 ? locationRunes : [] })),
    deck_list: [{ deck_type: 1, deck_seq: 1, unit_id_list: [11, 12, 0, 0], leader_unit_id: 11,
      equip: [{ unit_id: 11, rune_id_list: [], artifact_id_list: [] }, { unit_id: 12, rune_id_list: [], artifact_id_list: [] }] }],
  };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'member-taken-off.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(locationAccount)),
  });
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-1');
  await find(page);
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.locator('.rune-build-card')).toHaveCount(6);
  for (const card of await detail.locator('.rune-build-card').all()) {
    await expect(card.locator('.rune-build-card-where').first()).toHaveText('LocationInventory');
    await expect(card.locator('.rune-build-card-where').nth(1)).toHaveAttribute('data-visible', 'false');
  }
  await detail.screenshot({ path: testInfo.outputPath('member-taken-off-inventory.png') });
});

/* Rune Optimization's preset and monster, then the profile they read. */
async function openProfileIn(page: Page, unitId: string, presetId: string) {
  await openOptimization(page);
  await page.getByLabel('Preset', { exact: true }).selectOption(presetId);
  await page.getByLabel('Monster', { exact: true }).selectOption(unitId);
  await page.getByRole('button', { name: 'Open profile' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Build for', { exact: true })).toHaveValue(presetId === 'scenario' ? 'scenario' : presetId === 'deck-99-1' ? 'unassigned' : 'content:arena-attack');
  return dialog;
}
const spdAtMost = (scope: Page | Locator) => scope.getByLabel('Spd: at most', { exact: true });

test('a fully stated area profile copies every choice and keeps large fields in place', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  const full = {
    unitId: '12', label: 'A deliberately long arena nickname with every choice stated',
    runeSets: ['Violent/Blade', 'Swift/Will'], allowBrokenSets: true, allowIntangibleRunes: false,
    /* No leads: an area's are its presets' leaders', and only Scenario states them. */
    alwaysCrits: true, alwaysElementAdvantage: true,
    runeSlots: { slot2: ['Spd', 'HP%', 'Atk%', 'Def%'], slot4: ['CtD%', 'CtR%', 'HP%', 'Atk%', 'Def%'], slot6: ['HP%', 'Atk%', 'Def%', 'Res%', 'Acc%'] },
    mainStat: { preferred: ['HP'], acceptable: ['DEF', 'ATK'] },
    artifacts: { sub: { attribute: { preferred: [206], acceptable: [] }, type: { preferred: [400], acceptable: [] } } },
    relics: { unique: { preferred: [1], acceptable: [] } },
    statTargets: { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0, dmg: 0, ehp: 0, ehpD: 0 },
    statCeilings: { hp: 100000, atk: 100000, def: 100000, spd: 100000, criRate: 100, criDmg: 100000, res: 100, acc: 100, dmg: 1000000, ehp: 1000000, ehpD: 1000000 },
    runeSuggestionStat: 'spd',
  };
  await page.evaluate((profile) => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    preferences.monsterPreferences = { 'content:arena-attack': { 12: profile } };
    preferences.updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem('jaswa-preferences', JSON.stringify(preferences));
  }, full);
  await page.reload();
  expect((await stored(page)).monsterPreferences['content:arena-attack']['12']).toEqual(full);
  let dialog = await openProfileIn(page, '12', 'deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('100000');
  expect(await dialog.locator('.stat-range-input').evaluateAll((inputs) => inputs.every((element) => {
    const input = element as HTMLInputElement;
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = style.font;
    return context.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }))).toBe(true);
  const positions = () => dialog.locator('.monster-overlay-controls, .stat-ranges, .monster-overlay-engraved').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    }));
  const before = await positions();
  await dialog.screenshot({ path: testInfo.outputPath('area-profile-full-before.png') });
  await spdAtMost(dialog).fill('');
  expect(await positions()).toEqual(before);
  await spdAtMost(dialog).fill('100000');
  expect(await positions()).toEqual(before);
  await dialog.screenshot({ path: testInfo.outputPath('area-profile-full-after.png') });
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  dialog = await openProfileIn(page, '12', 'deck-99-1');
  await dialog.getByLabel('Copy the profile from another area').selectOption('content:arena-attack');
  await expect(spdAtMost(dialog)).toHaveValue('100000');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const saved = (await stored(page)).monsterPreferences;
  expect(saved.unassigned['12']).toEqual(full);
  expect(saved['content:arena-attack']['12']).toEqual(full);
});

test('two teams share one area profile while retaining their gear and surviving team removal', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  const sharedAccount = { ...account, deck_list: [...account.deck_list,
    { deck_type: 1, deck_seq: 5, unit_id_list: [12, 0, 0, 0], leader_unit_id: 12,
      equip: [{ unit_id: 12, rune_id_list: [], artifact_id_list: [] }] },
  ] };
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'shared-profiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sharedAccount)),
  });
  let dialog = await openProfileIn(page, '12', 'deck-1-4');
  const areas = dialog.getByLabel('Build for', { exact: true });
  await expect(areas.locator('option')).toHaveText(['Scenario', 'Arena Attack', 'Not yet named']);
  await expect(dialog.getByRole('heading', { name: 'Engraved runes', exact: true })).toHaveAttribute('title', 'Engraved in Arena Attack 4');
  const gearCards = () => dialog.locator('.engraved-rune:not([data-empty])');
  // The teams have different saved gear; neither is merged into the profile.
  await expect(gearCards()).toHaveCount(3);
  const positions = () => dialog.locator('.monster-overlay-controls, .stat-ranges, .monster-overlay-engraved').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    }));
  const before = await positions();
  await dialog.screenshot({ path: testInfo.outputPath('shared-area-empty.png') });
  await spdAtMost(dialog).fill('180');
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill('One arena profile');
  await dialog.getByRole('textbox', { name: 'Nickname' }).press('Enter');
  expect(await positions()).toEqual(before);
  await dialog.screenshot({ path: testInfo.outputPath('shared-area-stated.png') });
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  dialog = await openProfileIn(page, '12', 'deck-1-5');
  await expect(spdAtMost(dialog)).toHaveValue('180');
  await expect(dialog.getByRole('heading', { name: 'Engraved runes', exact: true })).toHaveAttribute('title', 'Engraved in Arena Attack 5');
  await expect(gearCards()).toHaveCount(0);
  await expect(dialog.getByLabel('Copy the profile from another area').locator('option')).toHaveText(['Copy from…', 'Scenario', 'Not yet named']);
  await spdAtMost(dialog).fill('0');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(spdAtMost(page)).toHaveValue('0');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  await expect(spdAtMost(page)).toHaveValue('0');

  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await choosePreset(page, 'Arena Attack', 'Arena Attack 5');
  await expect(page.getByRole('table', { name: 'Monster stats' }).locator('tbody tr')).toContainText('One arena profile');
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning', exact: true }).click();
  const arena = page.getByRole('region', { name: 'Arena Attack', exact: true });
  await expect(arena.locator('.speed-summary')).toHaveCount(2);
  for (const team of await arena.locator('.speed-summary').all()) {
    await expect(team).toContainText('One arena profile');
  }

  await openPresets(page);
  await choosePreset(page, 'Arena Attack', 'Arena Attack 4');
  await expect(page.locator('.monster-priority-entry .monster-name').first()).toContainText('One arena profile');
  await page.getByRole('button', { name: /^Remove .*One arena profile/ }).click();
  await choosePreset(page, 'Arena Attack', 'Arena Attack 5');
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  const saved = await stored(page);
  expect(saved.monsterPreferences['content:arena-attack']['12'].statCeilings).toEqual({ spd: 0 });
  expect(saved.monsterPreferences['deck-1-4']).toBeUndefined();
  expect(saved.monsterPreferences['deck-1-5']).toBeUndefined();
  await addMenu(page).selectOption('12');
  await page.reload();
  dialog = await openProfileIn(page, '12', 'deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('0');
  await expect(gearCards()).toHaveCount(6);
});

const ceilings = async (page: Page) => {
  const profiles = (await stored(page)).monsterPreferences as Record<string, Record<string, { statCeilings?: unknown }>>;
  return Object.fromEntries(Object.entries(profiles).flatMap(([contextId, copies]) =>
    copies['12'] ? [[contextId, copies['12'].statCeilings]] : []));
};

test('a profile belongs to one area: Scenario and other areas keep their own choices', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);

  /* Nothing filled in: 12 states nothing anywhere, in Scenario or a preset. */
  let dialog = await openProfileIn(page, '12', 'deck-1-4');
  await expect(spdAtMost(dialog)).toHaveValue('');
  /* Empty profiles stay in the menu, but offer no user choices to copy. */
  const copyMenu = () => dialog.getByLabel('Copy the profile from another area');
  await expect(copyMenu()).toBeEnabled();
  await expect(copyMenu().locator('option[value="scenario"]')).toBeDisabled();
  await expect(copyMenu().locator('option[value="unassigned"]')).toBeDisabled();
  expect(await copyMenu().locator('option[value="scenario"]').evaluate((option) => {
    const expected = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    const probe = document.createElement('span');
    probe.style.color = expected;
    document.body.append(probe);
    const matches = getComputedStyle(option).color === getComputedStyle(probe).color;
    probe.remove();
    return matches;
  })).toBe(true);
  const controls = () => dialog.locator('.monster-overlay-controls');
  const emptyBox = await box(controls());
  await page.screenshot({ path: testInfo.outputPath('profile-copy-empty-before.png') });
  await copyMenu().focus();
  await copyMenu().press('ArrowDown');
  await copyMenu().press('Enter');
  await expect(copyMenu()).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(await box(controls())).toEqual(emptyBox);
  await page.screenshot({ path: testInfo.outputPath('profile-copy-empty-after.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  /* The reported case: a max Spd stated in Scenario. */
  dialog = await openProfileIn(page, '12', 'scenario');
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
  expect(await ceilings(page)).toEqual({ scenario: { spd: 150 }, 'content:arena-attack': { spd: 180 } });

  /* The requirements Rune Optimization starts from are the chosen preset's own. */
  await expect(spdAtMost(page)).toHaveValue('180');
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await expect(spdAtMost(page)).toHaveValue('150');
  /* A change made on the page for one preset is not carried into another. */
  await spdAtMost(page).fill('170');
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-4');
  await expect(spdAtMost(page)).toHaveValue('180');
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await expect(spdAtMost(page)).toHaveValue('150');

  /* In the overlay, the box switches the profile read, and moves nothing beside it. */
  await page.getByRole('button', { name: 'Open profile' }).click();
  dialog = page.getByRole('dialog');
  const group = dialog.getByRole('group', { name: 'Build for area' });
  const before = await box(group);
  await page.screenshot({ path: testInfo.outputPath('profile-switch-before.png') });
  await dialog.getByLabel('Build for', { exact: true }).selectOption('content:arena-attack');
  await expect(spdAtMost(dialog)).toHaveValue('180');
  await dialog.getByLabel('Build for', { exact: true }).selectOption('unassigned');
  await expect(spdAtMost(dialog)).toHaveValue('');
  expect(await box(group)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('profile-switch-after.png') });

  /* Everything filled in: a profile copied from Scenario is a copy, not a link. */
  await expect(dialog.getByLabel('Copy the profile from another area')).toBeEnabled();
  await expect(copyMenu().locator('option[value="scenario"]')).toBeEnabled();
  await expect(copyMenu().locator('option[value="content:arena-attack"]')).toBeEnabled();
  const fullBox = await box(controls());
  await page.screenshot({ path: testInfo.outputPath('profile-copy-populated-before.png') });
  await dialog.getByLabel('Copy the profile from another area').selectOption('scenario');
  await expect(spdAtMost(dialog)).toHaveValue('150');
  await expect(dialog.getByLabel('Copy the profile from another area')).toHaveValue('');
  expect(await box(group)).toEqual(before);
  expect(await box(controls())).toEqual(fullBox);
  await page.screenshot({ path: testInfo.outputPath('profile-copy-populated-after.png') });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  dialog = await openProfileIn(page, '12', 'scenario');
  await spdAtMost(dialog).fill('140');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  expect(await ceilings(page)).toEqual({ scenario: { spd: 140 }, 'content:arena-attack': { spd: 180 }, unassigned: { spd: 150 } });
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
  /* Scenario, and the other preset 12 stands in, keep the game's name. */
  expect(await copyNames(page)).toEqual(names);
  await choosePreset(page, 'Not yet named', 'Preset 99 · 1');
  await expect(page.locator('.monster-priority-entry .monster-name').first()).toHaveText(names[12]);
});
