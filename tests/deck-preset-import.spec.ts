import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The import boundary of `docs/DECK-PRESETS.md`: what a saved deck may say
 * reaches the Presets page in full, and what contradicts itself is refused with
 * the reason, never skipped (AGENTS.md §0.1).
 */

const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
const craft = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8'));
const rune = craft.unit_list[0].runes[0];

type Deck = { deck_type: number; deck_seq: number; unit_id_list: unknown[]; equip: unknown };
const engraved = (unitId: number, runeIds: number[] = [rune.rune_id]) => ({ unit_id: unitId, rune_id_list: runeIds, artifact_id_list: [] });
const withDecks = (deck_list: Deck[], extra: Record<string, unknown> = {}) => ({ ...account, runes: [rune], deck_list, ...extra });

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

async function importFile(page: Page, name: string, data: unknown) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
}

async function openPresets(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Presets' }).click();
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeVisible();
}

/* One of the chosen content's presets, from the list that shows each one's team. */
async function choosePreset(page: Page, name: string) {
  const field = page.getByLabel('Preset', { exact: true });
  await field.click();
  await page.getByRole('listbox').getByRole('option')
    .filter({ has: page.locator('.preset-team-name').getByText(name, { exact: true }) }).click();
  await expect(field.locator('.preset-team-name')).toHaveText(name);
}

test('imports two saved decks that place one rune on different monsters, and both defense decks', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.screenshot({ path: testInfo.outputPath('before-import.png') });
  await importFile(page, 'deck-presets.json', withDecks([
    { deck_type: 1, deck_seq: 1, unit_id_list: [1, 0, 0, 0], equip: [engraved(1)] },
    { deck_type: 1, deck_seq: 2, unit_id_list: [2, 0, 0, 0], equip: [engraved(2)] },
  ], {
    defense_deck_info: { unit_id_list: [2, 1, 0, 0], equip: null },
    server_arena_defense_deck_info: { unit_id_list: [{ pos_id: 1, unit_id: 1 }, { pos_id: 2, unit_id: 0 }], equip: null },
  }));
  await expect(page.getByText('deck-presets.json')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('after-import.png') });

  /* Every deck is reachable: the rune is engraved once in each attack preset, on its own monster. */
  await openPresets(page);
  await expect(page.getByLabel('Content', { exact: true }).locator('option'))
    .toHaveText(['Default', 'Arena', 'Guild', 'Cairos', 'Trial of Ascension', 'Temple of Chaos', 'Rift of Worlds', 'Dimension Hole']);
  await page.getByLabel('Content', { exact: true }).selectOption('Arena');
  for (const name of ['Arena Attack 1', 'Arena Attack 2']) {
    await choosePreset(page, name);
    const entries = page.locator('.monster-priority-entry');
    await expect(entries).toHaveCount(1);
    await expect(entries.first().getByRole('img', { name: '1 of 6 runes engraved' })).toBeVisible();
  }
  await page.getByLabel('Area', { exact: true }).selectOption('Arena Defense');
  await choosePreset(page, 'Arena Defense');
  /* A defense deck has no leader field: the game leads with the first position. */
  const entries = page.locator('.monster-priority-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first().locator('.preset-leader')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.monster-priority-about')).toHaveText('');
  /* So a new leader trades places with the old one, and the leader's own crown takes nothing away. */
  const [first, second] = await entries.locator('.monster-name').allInnerTexts();
  await entries.nth(1).locator('.preset-leader').click();
  await expect(entries.locator('.monster-name')).toHaveText([second, first]);
  await expect(entries.first().locator('.preset-leader')).toHaveAttribute('aria-pressed', 'true');
  await expect(entries.nth(1).locator('.preset-leader')).toHaveAttribute('aria-pressed', 'false');
  await entries.first().locator('.preset-leader').click();
  await expect(entries.first().locator('.preset-leader')).toHaveAttribute('aria-pressed', 'true');
});

test('a rune a deck still names after it was sold stays visible', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importFile(page, 'sold-rune.json', withDecks([
    { deck_type: 1, deck_seq: 1, unit_id_list: [1], equip: [engraved(1, [rune.rune_id, 999999999])] },
  ]));
  await expect(page.getByText('sold-rune.json')).toBeVisible();
  await openPresets(page);
  await page.getByLabel('Content', { exact: true }).selectOption('Arena');
  await choosePreset(page, 'Arena Attack 1');
  await expect(page.locator('.monster-priority-about')).toHaveText('Names 1 sold item');
  /* The sold rune is named beside the count, not counted as engraved. */
  await expect(page.locator('.monster-priority-entry').getByRole('img', { name: '1 of 6 runes engraved, and 1 sold' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sold-rune.png') });
});

for (const [title, decks, message] of [
  ['a rune assigned twice inside one saved deck',
    [{ deck_type: 1, deck_seq: 1, unit_id_list: [1, 2], equip: [engraved(1), engraved(2)] }],
    'This Deck Preset assigns a rune more than once or has an invalid rune ID.'],
  ['a deck that saves gear for some of its monsters but not all',
    [{ deck_type: 1, deck_seq: 1, unit_id_list: [1, 2], equip: [engraved(1)] }],
    'This Deck Preset saves engravings for some of its monsters but not all.'],
  ['gear engraved on a monster outside the deck',
    [{ deck_type: 1, deck_seq: 1, unit_id_list: [1], equip: [engraved(1, []), engraved(2)] }],
    'This Deck Preset engraves gear on a monster outside the deck, or twice on one.'],
  ['a deck without a monster list',
    [{ deck_type: 1, deck_seq: 1, equip: null }],
    'This account contains a Deck Preset without a monster list.'],
] as const) {
  test(`reports ${title}`, async ({ page }, testInfo) => {
    await freshWorkspace(page);
    await importFile(page, 'invalid-deck.json', withDecks(decks as unknown as Deck[]));
    await expect(page.getByText(message)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('invalid-deck.png') });
  });
}
