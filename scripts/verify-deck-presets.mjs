import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDeckPresets } from '../app/lib/deck-presets.ts';
import { validateGameFile } from '../app/lib/file-imports.ts';

const sample = JSON.parse(readFileSync('tests/fixtures/craft-account.json', 'utf8'));
const rune = sample.unit_list[0].runes[0];
const artifactId = 501;
const unitId = sample.unit_list[0].unit_id;
const otherUnit = { ...sample.unit_list[0], unit_id: Math.max(...sample.unit_list.map((unit) => unit.unit_id)) + 1, runes: [] };
const account = { ...sample, unit_list: [...sample.unit_list, otherUnit], artifacts: [{ rid: artifactId }],
  deck_list: [
    { deck_type: 1, deck_seq: 1, equip: [{ unit_id: unitId, rune_id_list: [rune.rune_id], artifact_id_list: [artifactId] }] },
    { deck_type: 1, deck_seq: 2, equip: [{ unit_id: otherUnit.unit_id, rune_id_list: [rune.rune_id], artifact_id_list: [artifactId] }] },
    { deck_type: 2, deck_seq: 1, equip: null },
  ] };

const decks = readDeckPresets(account);
assert.equal(decks.length, 3);
assert.equal(decks[0].runeOwnerById.get(String(rune.rune_id)), String(unitId));
assert.equal(decks[1].runeOwnerById.get(String(rune.rune_id)), String(otherUnit.unit_id));
assert.equal(decks[1].artifactOwnerById.get(String(artifactId)), String(otherUnit.unit_id));
assert.equal(decks[2].hasEngravings, false);
assert.deepEqual(decks[0].missingRuneIds, []);
assert.deepEqual(decks[0].missingArtifactIds, []);
assert.equal(validateGameFile({ ...account, artifacts: [] }).valid, true,
  `the import accepts one rune in different saved decks: ${validateGameFile({ ...account, artifacts: [] }).message}`);

const stale = readDeckPresets({ ...account, deck_list: [
  { deck_type: 1, deck_seq: 1, equip: [{ unit_id: unitId, rune_id_list: [999999999] }] },
] });
assert.deepEqual(stale[0].missingRuneIds, ['999999999'], 'sold runes stay visible in saved decks');
const staleArtifact = readDeckPresets({ ...account, deck_list: [
  { deck_type: 1, deck_seq: 1, equip: [{ unit_id: unitId, rune_id_list: [], artifact_id_list: [999999999] }] },
] });
assert.deepEqual(staleArtifact[0].missingArtifactIds, ['999999999'], 'sold artifacts remain represented');
assert.throws(() => readDeckPresets({ ...account, deck_list: [
  { deck_type: 1, deck_seq: 1, equip: [
    { unit_id: unitId, rune_id_list: [rune.rune_id] },
    { unit_id: otherUnit.unit_id, rune_id_list: [rune.rune_id] },
  ] },
] }), /assigns a rune more than once/);
assert.equal(validateGameFile({ ...account, deck_list: [
  { deck_type: 1, deck_seq: 1, equip: [
    { unit_id: unitId, rune_id_list: [rune.rune_id] },
    { unit_id: otherUnit.unit_id, rune_id_list: [rune.rune_id] },
  ] },
] }).valid, false, 'the import rejects a rune assigned twice within one deck');
assert.throws(() => readDeckPresets({ ...account, deck_list: [
  account.deck_list[0], account.deck_list[0],
] }), /duplicate Deck Preset identities/);
assert.throws(() => readDeckPresets({ ...account, deck_list: [
  { deck_type: 1, deck_seq: 1, equip: [
    { unit_id: unitId, rune_id_list: [], artifact_id_list: [artifactId] },
    { unit_id: otherUnit.unit_id, rune_id_list: [], artifact_id_list: [artifactId] },
  ] },
] }), /assigns an artifact more than once/);

console.log('Deck Preset identity, per-deck engraving ownership, stale references and duplicate guards passed.');

if (process.argv[2]) {
  const lines = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
  let snapshot;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.command === 'HubUserLogin' || entry.command === 'GuestLogin') snapshot = entry.response;
    } catch { /* The traffic log may end with an incomplete line. */ }
  }
  if (!snapshot) throw new Error('The traffic log contains no login snapshot.');
  const captured = readDeckPresets(snapshot);
  console.log(`Captured account: ${captured.length} saved decks, ${captured.filter((deck) => deck.hasEngravings).length} with engravings, ${captured.reduce((count, deck) => count + deck.missingRuneIds.length, 0)} stale rune references, ${captured.reduce((count, deck) => count + deck.missingArtifactIds.length, 0)} stale artifact references.`);
}
