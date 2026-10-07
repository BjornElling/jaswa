/**
 * Holds the Deck Preset model (`docs/DECK-PRESETS.md`) at its three layers:
 * the raw reader (`deck-presets.ts`), the presets every page reads
 * (`presets.ts`), and an engrave written into one preset
 * (`engrave-rune-build.ts`). Each against the real module, never a copy.
 *
 * With a traffic log as its argument it also measures a captured account
 * without printing a single ID.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDeckPresets } from '../app/lib/deck-presets.ts';
import { createImportedGame, validateGameFile } from '../app/lib/file-imports.ts';
import {
  accountItems, engravings, monsterInPreset, presetGroupsOf, readOwnPresets, readPresets, runesInPreset,
} from '../app/lib/presets.ts';
import { engraveImportedGame } from '../app/lib/engrave-rune-build.ts';
import { readRunes } from '../app/lib/runes.ts';

const clone = (value) => JSON.parse(JSON.stringify(value));

/* 1. The raw reader. */
const sample = JSON.parse(readFileSync('tests/fixtures/craft-account.json', 'utf8'));
/* Unit 1 carries rune 103 (slot 4) in Default; runes 101 and 102 (both slot 2)
   and 104 (slot 6) are in the inventory. Unit 3 is a third copy. */
const thirdUnit = { ...sample.unit_list[1], unit_id: 3, runes: [] };
const artifactId = 501;
const deck = (type, seq, members, equip, extra = {}) => ({ deck_type: type, deck_seq: seq, unit_id_list: members, equip, ...extra });
const gear = (unitId, runeIds, artifactIds = []) => ({ unit_id: unitId, rune_id_list: runeIds, artifact_id_list: artifactIds });
const account = {
  ...sample, unit_list: [...sample.unit_list, thirdUnit], artifacts: [{ rid: artifactId }],
  deck_list: [
    /* One rune, two decks, a different monster in each (§1 rule 3). Zeros are empty positions. */
    deck(1, 1, [1, 0, 2, 0], [gear(1, [101], [artifactId]), gear(2, [104])], { leader_unit_id: 1 }),
    deck(1, 2, [2, 1], [gear(2, [101], [artifactId]), gear(1, [])]),
    deck(99, 1, [3], null),
    deck(24, 101, [1, 2], []),
  ],
  defense_deck_info: { unit_id_list: [2, 1, 0, 0], equip: null },
  server_arena_defense_deck_info: { unit_id_list: [{ pos_id: 1, unit_id: 3 }, { pos_id: 2, unit_id: 0 }], equip: [gear(3, [103])] },
};

const decks = readDeckPresets(account);
assert.deepEqual(decks.map((entry) => entry.key), ['deck-1-1', 'deck-1-2', 'deck-99-1', 'deck-24-101', 'arena-defense', 'interserver-defense'],
  'every attack deck and both defense decks are read, each under its own key');
const byKey = new Map(decks.map((entry) => [entry.key, entry]));
assert.deepEqual(byKey.get('deck-1-1').members, ['1', '2'], 'an empty position is no member');
assert.equal(byKey.get('deck-1-1').leaderUnitId, '1');
assert.equal(byKey.get('deck-1-2').leaderUnitId, null, 'a deck without a leader field has no leader');
assert.equal(byKey.get('deck-1-1').runeOwnerById.get('101'), '1');
assert.equal(byKey.get('deck-1-2').runeOwnerById.get('101'), '2', 'the same rune has a different monster in another deck');
assert.equal(byKey.get('deck-1-2').artifactOwnerById.get(String(artifactId)), '2');
assert.deepEqual(byKey.get('deck-1-2').gear.get('1'), { runeIds: [], artifactIds: [] }, 'a member saved with nothing engraved is still saved');
/* savesGear: true only for a non-empty equip array. */
assert.equal(byKey.get('deck-1-1').savesGear, true);
assert.equal(byKey.get('deck-99-1').savesGear, false, 'equip: null saves monsters only');
assert.equal(byKey.get('deck-24-101').savesGear, false, 'an empty equip list saves monsters only');
assert.equal(byKey.get('deck-99-1').gear.size, 0);
/* Defense decks: the first position leads; the Interserver writes positions as records. */
assert.deepEqual(byKey.get('arena-defense').source, { kind: 'arena-defense' });
assert.deepEqual(byKey.get('arena-defense').members, ['2', '1']);
assert.equal(byKey.get('arena-defense').leaderUnitId, '2', 'a defense deck is led by its first monster');
assert.deepEqual(byKey.get('interserver-defense').members, ['3']);
assert.equal(byKey.get('interserver-defense').leaderUnitId, '3');
assert.equal(byKey.get('interserver-defense').runeOwnerById.get('103'), '3', 'a defense deck holds its own gear apart from Default');
assert.deepEqual(byKey.get('deck-1-1').missingRuneIds, []);
assert.deepEqual(byKey.get('deck-1-1').missingArtifactIds, []);
assert.equal(validateGameFile({ ...account, artifacts: [] }).valid, true,
  `the import accepts one rune in different saved decks: ${validateGameFile({ ...account, artifacts: [] }).message}`);

const only = (...entries) => ({ ...account, deck_list: entries, defense_deck_info: undefined, server_arena_defense_deck_info: undefined });

/* A sold rune or artifact stays named, and the deck is read in full. */
const stale = readDeckPresets(only(deck(1, 1, [1], [gear(1, [999999999], [999999998])])))[0];
assert.deepEqual(stale.missingRuneIds, ['999999999'], 'a sold rune stays visible in its deck');
assert.deepEqual(stale.missingArtifactIds, ['999999998'], 'a sold artifact stays visible in its deck');
assert.deepEqual(stale.gear.get('1'), { runeIds: ['999999999'], artifactIds: ['999999998'] }, 'a sold item keeps its place in the gear');
assert.equal(stale.runeOwnerById.get('999999999'), '1');
/* A monster the account no longer holds is kept as a member and named missing; a deck saving gear need not carry it. */
const goneMonster = readDeckPresets(only(deck(1, 1, [1, 2, 77], [gear(1, [101]), gear(2, [])])))[0];
assert.deepEqual(goneMonster.missingUnitIds, ['77']);
assert.deepEqual(goneMonster.members, ['1', '2', '77']);

/* Rejected: every way a deck can contradict itself. */
const rejects = (entries, pattern, message) => assert.throws(() => readDeckPresets(only(...entries)), pattern, message);
rejects([{ deck_type: 1, deck_seq: 1, equip: null }], /without a monster list/, 'a deck requires unit_id_list');
rejects([deck(1, 1, [1, 2], [gear(1, [101]), gear(2, [101])])], /assigns a rune more than once/, 'a rune twice in one deck');
rejects([deck(1, 1, [1, 2], [gear(1, [], [artifactId]), gear(2, [], [artifactId])])], /assigns an artifact more than once/, 'an artifact twice in one deck');
rejects([deck(1, 1, [1, 2], [gear(1, [101])])], /some of its monsters but not all/, 'gear saved for some members only');
rejects([deck(1, 1, [1], [gear(1, []), gear(2, [101])])], /outside the deck/, 'gear for a monster outside the deck');
rejects([deck(1, 1, [1, 2], [gear(1, []), gear(1, []), gear(2, [])])], /outside the deck, or twice/, 'gear twice for one member');
rejects([deck(1, 1, [1, 2], null, { leader_unit_id: 3 })], /leader is not one of its monsters/, 'a leader outside the deck');
rejects([deck(1, 1, [1, 1], null)], /invalid or repeated monster/, 'a monster twice in one deck');
rejects([deck(1, 1, [1], [gear(1, [101, 102])])], /two runes to one monster slot/, 'two runes in one slot');
rejects([deck(1, 1, [1], null), deck(1, 1, [2], null)], /duplicate Deck Preset identities/, 'one identity twice');
rejects([deck(1, 0, [1], null)], /invalid Deck Preset identity/, 'a deck numbered zero');
assert.equal(validateGameFile(only(deck(1, 1, [1, 2], [gear(1, [101]), gear(2, [101])]))).valid, false,
  'the import rejects a rune engraved twice within one deck');
assert.equal(validateGameFile(only(deck(1, 1, [1, 2], [gear(1, [101])]))).valid, false,
  'the import rejects a deck saving gear for some members only');

/* 2. The presets every page reads: Default first, then the game's by content, then the user's own. */
const presetAccount = {
  ...sample, unit_list: [...sample.unit_list, thirdUnit], artifacts: [{ rid: artifactId }],
  deck_list: [
    deck(99, 1, [3], null),
    deck(24, 101, [1, 2], null),
    deck(1, 5, [1], [gear(1, [101])]),
    deck(1, 4, [2, 1], [gear(2, [101], [artifactId]), gear(1, [])]),
  ],
  defense_deck_info: { unit_id_list: [1], equip: null },
};
/* The workspace reads the prepared account, whose rune list also holds every engraved rune. */
const prepared = createImportedGame('presets.json', clone(presetAccount), validateGameFile({ ...presetAccount, artifacts: [] })).data;
const ownStored = [
  { id: 'own-a', name: 'Draft', content: 'giants', members: ['1', '2'], leaderUnitId: '1', gear: null },
  { id: 'own-b', name: 'Geared', content: null, members: ['1'], leaderUnitId: null, gear: { 1: { runeIds: ['101'], artifactIds: [] } } },
];
const presets = readPresets(prepared, readOwnPresets(ownStored));
assert.deepEqual(presets.map((preset) => preset.name),
  ['Default', 'Arena Attack 4', 'Arena Attack 5', 'Arena Defense', "Giant's Keep 1", 'Deck 99 · 1', 'Draft', 'Geared'],
  'Default first, the game\'s presets by content and number, an unnamed deck after every named one, the user\'s own last');
assert.deepEqual(presets.map((preset) => preset.kind), ['default', 'game', 'game', 'game', 'game', 'game', 'own', 'own']);
assert.deepEqual(presets.map((preset) => preset.id).slice(0, 6), ['default', 'deck-1-4', 'deck-1-5', 'arena-defense', 'deck-24-101', 'deck-99-1']);
assert.deepEqual(presetGroupsOf(presets).map((group) => group.label),
  ['Default', 'Arena Attack', 'Arena Defense', "Giant's Keep", 'Not yet named', 'Built in JASWA'], 'the menu groups follow the game');
assert.equal(presets.find((preset) => preset.id === 'deck-24-101').number, 1, 'a Cairos preset is numbered within its dungeon');
assert.deepEqual(readPresets(undefined, []), [], 'no import, no presets');
const presetById = new Map(presets.map((preset) => [preset.id, preset]));

const items = accountItems(prepared);
const unitRecord = (unitId) => prepared.unit_list.find((unit) => String(unit.unit_id) === unitId);
const runeIdsOf = (record) => record.runes.map((rune) => String(rune.rune_id));
/* A preset that saves gear swaps the monster's runes and artifacts for its own. */
const inArena = monsterInPreset(unitRecord('2'), presetById.get('deck-1-4'), items);
assert.deepEqual(runeIdsOf(inArena), ['101'], 'a gear-saving preset hands the monster its own runes');
assert.deepEqual(inArena.artifacts.map((artifact) => artifact.rid), [artifactId], 'and its own artifacts');
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('deck-1-4'), items)), [], 'a member saved bare is bare in that preset');
assert.deepEqual(runeIdsOf(unitRecord('2')), [], 'the export record itself is untouched');
/* A preset that saves monsters only leaves each on its Default gear. */
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('deck-24-101'), items)), ['103'],
  'a monsters-only preset reads Default gear');
assert.equal(monsterInPreset(unitRecord('1'), presetById.get('default'), items), unitRecord('1'), 'Default is the record as imported');
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('own-a'), items)), ['103'], 'an own preset without gear reads Default');
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('own-b'), items)), ['101'], 'an own preset with gear reads its own');
assert.deepEqual(presetById.get('own-b').missingRuneIds, [], 'an owned rune in an own preset is not reported sold');

/* occupiedId answers "who carries it in this preset", never "who carries it somewhere". */
const runes = readRunes(prepared);
const occupied = (presetId) => Object.fromEntries(runesInPreset(runes, presetById.get(presetId)).map((rune) => [rune.id, rune.occupiedId]));
assert.deepEqual(occupied('default'), { 101: null, 102: null, 103: '1', 104: null });
assert.deepEqual(occupied('deck-1-4'), { 101: '2', 102: null, 103: null, 104: null }, 'a Default rune is free in a preset that does not engrave it');
assert.deepEqual(occupied('deck-1-5'), { 101: '1', 102: null, 103: null, 104: null });
assert.deepEqual(occupied('deck-24-101'), { 101: null, 102: null, 103: '1', 104: null }, 'a monsters-only preset holds Default gear');
assert.equal(runesInPreset(runes, presetById.get('default'))[0], runes[0], 'Default reads the runes as they are');

/* Every place an item is engraved, and a monsters-only preset counted once, as Default. */
const where = engravings(presets);
assert.deepEqual(where.runes.get('101'), [
  { presetId: 'deck-1-4', unitId: '2' }, { presetId: 'deck-1-5', unitId: '1' }, { presetId: 'own-b', unitId: '1' },
], 'a rune shared by several presets lists each placement');
assert.deepEqual(where.runes.get('103'), [{ presetId: 'default', unitId: '1' }], 'a preset saving no gear adds no placement of its own');
assert.deepEqual(where.artifacts.get(String(artifactId)), [{ presetId: 'deck-1-4', unitId: '2' }]);
assert.equal(where.runes.has('102'), false, 'an item in inventory everywhere has no placement');

/* The user's own presets are read one at a time: one malformed costs only itself. */
const draft = ownStored[0];
const ownRead = readOwnPresets([
  draft,
  ownStored[1],
  { ...draft, id: 'own-dup-rune', gear: { 1: { runeIds: ['101'], artifactIds: [] }, 2: { runeIds: ['101'], artifactIds: [] } } },
  { ...draft, id: 'own-dup-artifact', gear: { 1: { runeIds: [], artifactIds: ['501'] }, 2: { runeIds: [], artifactIds: ['501'] } } },
  { ...draft, id: 'own-lost-leader', leaderUnitId: '9' },
  { ...draft, id: 'preset-1' },
  { ...draft, name: 'A repeated id' },
  { ...draft, id: 'own-too-many', members: ['1', '2', '3', '4', '5', '6'] },
  { ...draft, id: 'own-stray-gear', members: ['1'], leaderUnitId: null, gear: { 1: { runeIds: [], artifactIds: [] }, 2: { runeIds: [], artifactIds: [] } } },
  { ...draft, id: 'own-half-gear', gear: { 1: { runeIds: [], artifactIds: [] } } },
  { ...draft, id: 'own-blank', name: '   ' },
  { ...draft, id: 'own-content', content: 'world-arena' },
  'not a preset',
]);
assert.deepEqual(ownRead.map((entry) => entry.id), ['own-a', 'own-b'], 'every malformed own preset is dropped alone, and the readable ones kept');
assert.deepEqual(ownRead[0], draft, 'a readable own preset reads back unchanged');
assert.deepEqual(readOwnPresets(undefined), [], 'no stored presets reads as none');
assert.deepEqual(readOwnPresets([]), [], 'an emptied list stays empty');

/* 3. An engrave written into one preset, and nowhere else. */
const optimization = JSON.parse(readFileSync('tests/fixtures/rune-optimization-account.json', 'utf8'));
/* Default: 11 carries 5001–5006, 12 carries 5007–5012; 5013 onward is inventory. */
const arenaEleven = ['5013', '5021', '5029', '5037', '5045', '5053'];
const twelveDefault = ['5007', '5008', '5009', '5010', '5011', '5012'];
const engraveAccount = { ...optimization, deck_list: [
  deck(1, 1, [11, 12], [gear(11, arenaEleven.map(Number)), gear(12, twelveDefault.map(Number))]),
  deck(1, 2, [12], [gear(12, [5001])]),
  deck(24, 101, [11, 12], null),
], defense_deck_info: { unit_id_list: [12, 11], equip: null } };
const game = createImportedGame('engrave.json', clone(engraveAccount), validateGameFile(engraveAccount));
const before = readPresets(game.data, []);
const find = (list, id) => list.find((preset) => preset.id === id);
const equipOf = (data, type, seq) => data.deck_list.find((entry) => entry.deck_type === type && entry.deck_seq === seq).equip;
const runeIdsByMember = (equip) => Object.fromEntries(equip.map((entry) => [String(entry.unit_id), entry.rune_id_list.map(String)]));

/* Into a gear-saving preset: the six runes move onto 12, 5013 leaves 11 in this preset only. */
const build = ['5013', '5002', '5003', '5004', '5005', '5006'];
const engraved = engraveImportedGame(game, find(before, 'deck-1-1'), '12', build);
assert.deepEqual(runeIdsByMember(equipOf(engraved.data, 1, 1)), { 11: arenaEleven.slice(1), 12: build },
  'the build lands on its monster and leaves the other member of the same preset');
assert.deepEqual(equipOf(engraved.data, 1, 2), equipOf(game.data, 1, 2), 'another preset holding one of the runes is untouched');
assert.deepEqual(equipOf(engraved.data, 24, 101), null, 'a monsters-only preset is untouched');
assert.deepEqual(engraved.data.runes, game.data.runes, 'no rune moves in Default');
assert.deepEqual(engraved.data.unit_list, game.data.unit_list, 'no monster\'s Default runes change');
assert.deepEqual(engraved.data.defense_deck_info, game.data.defense_deck_info);
assert.deepEqual(engraved.loadedPlacements, { 'deck-1-1': {
  5013: '11', 5002: null, 5003: null, 5004: null, 5005: null, 5006: null,
  5007: '12', 5008: '12', 5009: '12', 5010: '12', 5011: '12', 5012: '12',
} }, 'where each moved rune sat in that preset is remembered under that preset');
const after = readPresets(engraved.data, []);
assert.deepEqual(find(after, 'deck-1-1').runesOf.get('12'), build);
assert.deepEqual(find(after, 'default').runesOf, find(before, 'default').runesOf, 'Default reads exactly as before');

/* Into a monsters-only preset: every member's Default gear is written down first, and only the target changes. */
const keepBuild = ['5014', '5022', '5030', '5038', '5046', '5054'];
const keep = engraveImportedGame(game, find(before, 'deck-24-101'), '11', keepBuild);
assert.deepEqual(runeIdsByMember(equipOf(keep.data, 24, 101)), { 11: keepBuild, 12: twelveDefault },
  'a monsters-only preset gets every member\'s Default gear materialised');
assert.equal(find(readPresets(keep.data, []), 'deck-24-101').savesGear, true, 'and from then on saves gear');
assert.deepEqual(keep.data.runes, game.data.runes, 'Default is untouched');
assert.deepEqual(equipOf(keep.data, 1, 1), equipOf(game.data, 1, 1));

/* Into a defense preset: its own field, nothing else. */
const defense = engraveImportedGame(game, find(before, 'arena-defense'), '11', keepBuild);
assert.deepEqual(runeIdsByMember(defense.data.defense_deck_info.equip), { 12: twelveDefault, 11: keepBuild });
assert.deepEqual(defense.data.deck_list, game.data.deck_list);

/* Into Default: the old single-placement engrave, recorded under Default. */
const inDefault = engraveImportedGame(game, find(before, 'default'), '12', ['5001', '5002', '5003', '5004', '5005', '5006']);
assert.deepEqual(runeIdsOf(inDefault.data.unit_list.find((unit) => unit.unit_id === 12)).sort(), ['5001', '5002', '5003', '5004', '5005', '5006']);
assert.deepEqual(runeIdsOf(inDefault.data.unit_list.find((unit) => unit.unit_id === 11)), [], 'Default still holds a rune once');
assert.deepEqual(inDefault.data.deck_list, game.data.deck_list, 'a Default engrave changes no preset');
assert.equal(inDefault.loadedPlacements.default['5001'], '11');

assert.throws(() => engraveImportedGame(game, find(before, 'deck-1-2'), '11', keepBuild), /not in the selected preset/,
  'a monster outside the preset cannot be engraved in it');
const ownPreset = readPresets(game.data, readOwnPresets([{ id: 'own-x', name: 'Mine', content: null, members: ['11'], leaderUnitId: null, gear: null }]));
assert.throws(() => engraveImportedGame(game, find(ownPreset, 'own-x'), '11', keepBuild), /preferences/,
  'an own preset is engraved in the preferences, never in the import');

console.log('Deck Presets: raw decks, defense decks, per-preset placements, presets by content, own presets one at a time, and per-preset engraving passed.');

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
  console.log(`Captured account: ${captured.length} saved decks, ${captured.filter((entry) => entry.savesGear).length} saving gear, ${captured.reduce((count, entry) => count + entry.missingRuneIds.length, 0)} stale rune references, ${captured.reduce((count, entry) => count + entry.missingArtifactIds.length, 0)} stale artifact references.`);
}
