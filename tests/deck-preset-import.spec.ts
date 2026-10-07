import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
const craft = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8'));
const rune = craft.unit_list[0].runes[0];

function withDecks(duplicateWithinDeck: boolean) {
  const engravings = (unitId: number) => ({ unit_id: unitId, rune_id_list: [rune.rune_id], artifact_id_list: [] });
  return { ...account, runes: [rune], deck_list: duplicateWithinDeck
    ? [{ deck_type: 1, deck_seq: 1, equip: [engravings(1), engravings(2)] }]
    : [
      { deck_type: 1, deck_seq: 1, equip: [engravings(1)] },
      { deck_type: 1, deck_seq: 2, equip: [engravings(2)] },
    ] };
}

test('imports two saved decks that place one rune on different monsters', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('before-import.png') });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'deck-presets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withDecks(false))),
  });
  await expect(page.getByText('deck-presets.json')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('after-import.png') });
});

test('reports a rune assigned twice inside one saved deck', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'invalid-deck.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withDecks(true))),
  });
  await expect(page.getByText('This Deck Preset assigns a rune more than once or has an invalid rune ID.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('invalid-deck.png') });
});
