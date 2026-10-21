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
  accountItems, engravings, monsterInPreset, presetMenu, readOwnPresets, readPresets, runeSlots, runesInPreset, teammateSetsInPreset,
} from '../app/lib/presets.ts';
import { engraveImportedGame } from '../app/lib/engrave-rune-build.ts';
import { addToGamePreset } from '../app/lib/game-preset-edits.ts';
import { noRuneLocks, runeLocksInPreset } from '../app/lib/rune-locks.ts';
import { readRunes } from '../app/lib/runes.ts';
import { presetContent, presetContents } from '../app/lib/preset-contents.ts';
import { battleLeaders, leadArea, teamLeadsFor } from '../app/lib/team-leads.ts';

const clone = (value) => JSON.parse(JSON.stringify(value));

/* 1. The raw reader. */
const sample = JSON.parse(readFileSync('tests/fixtures/craft-account.json', 'utf8'));
/* Unit 1 carries rune 103 (slot 4) in Scenario; runes 101 and 102 (both slot 2)
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
assert.equal(byKey.get('interserver-defense').runeOwnerById.get('103'), '3', 'a defense deck holds its own gear apart from Scenario');
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
/* A gone member whose engravings the deck still lists is one more missing
   member, its gear kept readable — never a reason to refuse the account. */
const goneWithGear = { ...only(deck(1, 1, [1, 77], [gear(1, [101]), gear(77, [104], [artifactId])])), artifacts: [] };
assert.equal(validateGameFile(goneWithGear).valid, true, `a sold member's engravings never fail the import: ${validateGameFile(goneWithGear).message}`);
const goneGeared = readDeckPresets(goneWithGear)[0];
assert.deepEqual(goneGeared.missingUnitIds, ['77']);
assert.deepEqual(goneGeared.gear.get('77'), { runeIds: ['104'], artifactIds: [String(artifactId)] }, 'its engravings stay readable');
assert.equal(goneGeared.savesGear, true);
/* A Normal Sealed Shrine monster can stand in a saved deck, but no page reads
   it from there: it is missing, as it is from a preset built in JASWA. */
const shrineMember = { ...only(deck(1, 1, [1, 88], [gear(1, [101]), gear(88, [])])), artifacts: [],
  unit_storage_normal_list: [{ unit_id: 88, unit_master_id: 10111, unit_level: 40, class: 5 }] };
assert.equal(validateGameFile(shrineMember).valid, true, validateGameFile(shrineMember).message);
assert.deepEqual(readDeckPresets(shrineMember)[0].missingUnitIds, ['88'], 'a Normal-shrine member of a game preset is missing');
const shrinePresets = readPresets(createImportedGame('shrine.json', clone(shrineMember), validateGameFile(shrineMember)).data,
  readOwnPresets([{ id: 'own-s', name: 'Shrine draft', content: null, members: ['1', '88'], leaderUnitId: null, gear: null }]));
assert.deepEqual(shrinePresets.find((preset) => preset.id === 'deck-1-1').missingUnitIds, ['88']);
assert.deepEqual(shrinePresets.find((preset) => preset.id === 'own-s').missingUnitIds, ['88'],
  'and the same monster is missing from a preset built in JASWA: one model for both');

/* Rejected: every way a deck can contradict itself. */
const rejects = (entries, pattern, message) => assert.throws(() => readDeckPresets(only(...entries)), pattern, message);
rejects([{ deck_type: 1, deck_seq: 1, equip: null }], /without a monster list/, 'a deck requires unit_id_list');
rejects([deck(1, 1, [1, 2], [gear(1, [101]), gear(2, [101])])], /assigns a rune more than once/, 'a rune twice in one deck');
rejects([deck(1, 1, [1, 2], [gear(1, [], [artifactId]), gear(2, [], [artifactId])])], /assigns an artifact more than once/, 'an artifact twice in one deck');
rejects([deck(1, 1, [1, 2], [gear(1, [101])])], /some of its monsters but not all/, 'gear saved for some members only');
rejects([deck(1, 1, [1], [gear(1, []), gear(2, [101])])], /outside the preset/, 'gear for a monster outside the preset');
rejects([deck(1, 1, [1, 2], [gear(1, []), gear(1, []), gear(2, [])])], /outside the preset, or twice/, 'gear twice for one member');
rejects([deck(1, 1, [1, 2], null, { leader_unit_id: 3 })], /leader is not one of its monsters/, 'a leader outside the deck');
rejects([deck(1, 1, [1, 1], null)], /invalid or repeated monster/, 'a monster twice in one deck');
rejects([deck(1, 1, [1], [gear(1, [101, 102])])], /two runes to one monster slot/, 'two runes in one slot');
rejects([deck(1, 1, [1], null), deck(1, 1, [2], null)], /duplicate Deck Preset identities/, 'one identity twice');
rejects([deck(1, 0, [1], null)], /invalid Deck Preset identity/, 'a deck numbered zero');
assert.equal(validateGameFile(only(deck(1, 1, [1, 2], [gear(1, [101]), gear(2, [101])]))).valid, false,
  'the import rejects a rune engraved twice within one deck');
assert.equal(validateGameFile(only(deck(1, 1, [1, 2], [gear(1, [101])]))).valid, false,
  'the import rejects a deck saving gear for some members only');

/* 2. The presets every page reads: Scenario first, then the game's by content, then the user's own. */
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
  ['Scenario', 'Arena Attack 4', 'Arena Attack 5', 'Arena Defense', "Giant's Keep 1", 'Draft', 'Preset 99 · 1', 'Geared'],
  'Scenario first, every preset by content, the user\'s own after the game\'s in theirs, and anything without a content last');
assert.deepEqual(presets.map((preset) => preset.kind), ['scenario', 'game', 'game', 'game', 'game', 'own', 'game', 'own']);
assert.deepEqual(presets.map((preset) => preset.id), ['scenario', 'deck-1-4', 'deck-1-5', 'arena-defense', 'deck-24-101', 'own-a', 'deck-99-1', 'own-b']);
/* Runes 101 and 102 are both slot 2: a preset putting both on one monster is
   dropped, alone, whether the account is at hand when the preferences are read
   or only when the presets are. */
const twoInOneSlot = [...ownStored, { id: 'own-c', name: 'Crowded', content: null, members: ['1'], leaderUnitId: null,
  gear: { 1: { runeIds: ['101', '102'], artifactIds: [] } } }];
assert.deepEqual(readOwnPresets(twoInOneSlot, runeSlots(prepared)).map((entry) => entry.id), ['own-a', 'own-b'],
  'an own preset with two runes in one slot costs only itself');
assert.deepEqual(readPresets(prepared, readOwnPresets(twoInOneSlot)).filter((preset) => preset.kind === 'own').map((preset) => preset.id),
  ['own-a', 'own-b'], 'and is left out of the presets when read without the account');
const menu = presetMenu(presets);
assert.deepEqual(menu.map((tab) => tab.label),
  ['Scenario', 'Arena', 'Guild', 'Cairos', 'Trial of Ascension', 'Temple of Chaos', 'Rift of Worlds', 'Dimension Hole', 'Not yet named'],
  'the menu is the game\'s tabs, every one of them, then the presets not yet named');
assert.deepEqual(menu.find((tab) => tab.label === 'Dimension Hole').areas.map((area) => area.label),
  ['Forest of Roaring Beasts', 'Sanctuary of Dreaming Fairies', 'Cliff of Tough Beast Men', 'Ruin of Silent Death',
    'Castle of Forgotten Heroes', 'Hellground of Raging Fires', 'Dimension Raid Phase 1', 'Dimension Raid Phase 2', 'Dimension Raid Phase 3'],
  'a tab holds every content of its menu, the empty ones too');
assert.deepEqual(menu.find((tab) => tab.label === 'Cairos').areas.find((area) => area.label === "Giant's Keep").presets.map((preset) => preset.name),
  ["Giant's Keep 1", 'Draft'], 'a preset built here stands in its content beside the game\'s');
assert.deepEqual(presetMenu(readPresets({ ...prepared, deck_list: [] }, [])).map((tab) => tab.label).at(-1), 'Dimension Hole',
  'the presets not yet named leave the menu once there are none');
assert.equal(presets.find((preset) => preset.id === 'deck-1-4').contentAssumed, false, 'a confirmed deck type is not marked assumed');
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
/* A preset that saves monsters only leaves each on its Scenario gear. */
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('deck-24-101'), items)), ['103'],
  'a monsters-only preset reads Scenario gear');
assert.equal(monsterInPreset(unitRecord('1'), presetById.get('scenario'), items), unitRecord('1'), 'Scenario is the record as imported');
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('own-a'), items)), ['103'], 'an own preset without gear reads Scenario');
assert.deepEqual(runeIdsOf(monsterInPreset(unitRecord('1'), presetById.get('own-b'), items)), ['101'], 'an own preset with gear reads its own');
assert.deepEqual(presetById.get('own-b').missingRuneIds, [], 'an owned rune in an own preset is not reported sold');

/* occupiedId answers "who carries it in this preset", never "who carries it somewhere". */
const runes = readRunes(prepared);
const occupied = (presetId) => Object.fromEntries(runesInPreset(runes, presetById.get(presetId)).map((rune) => [rune.id, rune.occupiedId]));
assert.deepEqual(occupied('scenario'), { 101: null, 102: null, 103: '1', 104: null });
assert.deepEqual(occupied('deck-1-4'), { 101: '2', 102: null, 103: null, 104: null }, 'a Scenario rune is free in a preset that does not engrave it');
assert.deepEqual(occupied('deck-1-5'), { 101: '1', 102: null, 103: null, 104: null });
assert.deepEqual(occupied('deck-24-101'), { 101: null, 102: null, 103: '1', 104: null }, 'a monsters-only preset holds Scenario gear');
assert.equal(runesInPreset(runes, presetById.get('scenario'))[0], runes[0], 'Scenario reads the runes as they are');

/* Every place an item is engraved, and a monsters-only preset counted once, as Scenario. */
const where = engravings(presets);
assert.deepEqual(where.runes.get('101'), [
  { presetId: 'deck-1-4', unitId: '2' }, { presetId: 'deck-1-5', unitId: '1' }, { presetId: 'own-b', unitId: '1' },
], 'a rune shared by several presets lists each placement');
assert.deepEqual(where.runes.get('103'), [{ presetId: 'scenario', unitId: '1' }], 'a preset saving no gear adds no placement of its own');
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
assert.deepEqual(ownRead.map((entry) => entry.id), ['own-a', 'own-b', 'own-too-many', 'own-content'], 'every malformed own preset is dropped alone, and the readable ones kept');
assert.deepEqual(ownRead.slice(2).map((entry) => entry.content), [null, null],
  'a content the structure does not hold, or a team too large for it, starts from no content and keeps the preset');
assert.deepEqual(ownRead[2].members, ['1', '2', '3', '4', '5', '6'], 'and keeps its monsters');
assert.deepEqual(ownRead[0], draft, 'a readable own preset reads back unchanged');
assert.deepEqual(readOwnPresets(undefined), [], 'no stored presets reads as none');
assert.deepEqual(readOwnPresets([]), [], 'an emptied list stays empty');

/* 3. An engrave written into one preset, and nowhere else. */
const optimization = JSON.parse(readFileSync('tests/fixtures/rune-optimization-account.json', 'utf8'));
/* Scenario: 11 carries 5001–5006, 12 carries 5007–5012; 5013 onward is inventory. */
const arenaEleven = ['5013', '5021', '5029', '5037', '5045', '5053'];
const twelveScenario = ['5007', '5008', '5009', '5010', '5011', '5012'];
const engraveAccount = { ...optimization, deck_list: [
  deck(1, 1, [11, 12], [gear(11, arenaEleven.map(Number)), gear(12, twelveScenario.map(Number))]),
  deck(1, 2, [12], [gear(12, [5001])]),
  deck(24, 101, [11, 12], null),
], defense_deck_info: { unit_id_list: [12, 11], equip: null } };
const game = createImportedGame('engrave.json', clone(engraveAccount), validateGameFile(engraveAccount));
const before = readPresets(game.data, []);
const find = (list, id) => list.find((preset) => preset.id === id);
const gearOf = (data, type, seq) => data.deck_list.find((entry) => entry.deck_type === type && entry.deck_seq === seq).equip;
const runeIdsByMember = (equip) => Object.fromEntries(equip.map((entry) => [String(entry.unit_id), entry.rune_id_list.map(String)]));

/* Into a gear-saving preset: the six runes move onto 12, 5013 leaves 11 in this preset only. */
const build = ['5013', '5002', '5003', '5004', '5005', '5006'];
const engraved = engraveImportedGame(game, find(before, 'deck-1-1'), '12', build);
assert.deepEqual(runeIdsByMember(gearOf(engraved.data, 1, 1)), { 11: arenaEleven.slice(1), 12: build },
  'the build lands on its monster and leaves the other member of the same preset');
assert.deepEqual(gearOf(engraved.data, 1, 2), gearOf(game.data, 1, 2), 'another preset holding one of the runes is untouched');
assert.deepEqual(gearOf(engraved.data, 24, 101), null, 'a monsters-only preset is untouched');
assert.deepEqual(engraved.data.runes, game.data.runes, 'no rune moves in Scenario');
assert.deepEqual(engraved.data.unit_list, game.data.unit_list, 'no monster\'s Scenario runes change');
assert.deepEqual(engraved.data.defense_deck_info, game.data.defense_deck_info);
assert.deepEqual(engraved.loadedPlacements, { 'deck-1-1': {
  5013: '11', 5002: null, 5003: null, 5004: null, 5005: null, 5006: null,
  5007: '12', 5008: '12', 5009: '12', 5010: '12', 5011: '12', 5012: '12',
} }, 'where each moved rune sat in that preset is remembered under that preset');
const after = readPresets(engraved.data, []);
assert.deepEqual(find(after, 'deck-1-1').runesOf.get('12'), build);
assert.deepEqual(find(after, 'scenario').runesOf, find(before, 'scenario').runesOf, 'Scenario reads exactly as before');

/* Into a monsters-only preset: every member's Scenario gear is written down first, and only the target changes. */
const keepBuild = ['5014', '5022', '5030', '5038', '5046', '5054'];
const keep = engraveImportedGame(game, find(before, 'deck-24-101'), '11', keepBuild);
assert.deepEqual(runeIdsByMember(gearOf(keep.data, 24, 101)), { 11: keepBuild, 12: twelveScenario },
  'a monsters-only preset gets every member\'s Scenario gear materialised');
assert.equal(find(readPresets(keep.data, []), 'deck-24-101').savesGear, true, 'and from then on saves gear');
assert.deepEqual(keep.data.runes, game.data.runes, 'Scenario is untouched');
assert.deepEqual(gearOf(keep.data, 1, 1), gearOf(game.data, 1, 1));

/* Into a defense preset: its own field, nothing else. */
const defense = engraveImportedGame(game, find(before, 'arena-defense'), '11', keepBuild);
assert.deepEqual(runeIdsByMember(defense.data.defense_deck_info.equip), { 12: twelveScenario, 11: keepBuild });
assert.deepEqual(defense.data.deck_list, game.data.deck_list);

/* Into Scenario: the old single-placement engrave, recorded under Scenario. */
const inScenario = engraveImportedGame(game, find(before, 'scenario'), '12', ['5001', '5002', '5003', '5004', '5005', '5006']);
assert.deepEqual(runeIdsOf(inScenario.data.unit_list.find((unit) => unit.unit_id === 12)).sort(), ['5001', '5002', '5003', '5004', '5005', '5006']);
assert.deepEqual(runeIdsOf(inScenario.data.unit_list.find((unit) => unit.unit_id === 11)), [], 'Scenario still holds a rune once');
assert.deepEqual(inScenario.data.deck_list, game.data.deck_list, 'a Scenario engrave changes no preset');
assert.equal(inScenario.loadedPlacements.scenario['5001'], '11');

assert.throws(() => engraveImportedGame(game, find(before, 'deck-1-2'), '11', keepBuild), /not in the selected preset/,
  'a monster outside the preset cannot be engraved in it');
const ownPreset = readPresets(game.data, readOwnPresets([{ id: 'own-x', name: 'Mine', content: null, members: ['11'], leaderUnitId: null, gear: null }]));
assert.throws(() => engraveImportedGame(game, find(ownPreset, 'own-x'), '11', keepBuild), /preferences/,
  'an own preset is engraved in the preferences, never in the import');

/* 4. A pool: Temple of Chaos's teams (deck_type 23) share their monsters, runes and artifacts (§1 rule 5). */
/* The game does not always stop an overlap, so the import reads it and the preset carries it as a fault. */
const overlapping = { ...only(
  deck(23, 1, [1], [gear(1, [101], [artifactId])]),
  deck(23, 2, [2, 1], [gear(2, [101], [artifactId]), gear(1, [])]),
  deck(1, 1, [1], [gear(1, [101])]),
), artifacts: [] };
assert.equal(validateGameFile(overlapping).valid, true, `an overlap in a pool never fails the import: ${validateGameFile(overlapping).message}`);
const overlapPresets = readPresets(createImportedGame('overlap.json', clone(overlapping), validateGameFile(overlapping)).data, []);
assert.deepEqual(find(overlapPresets, 'deck-23-2').poolConflicts, { runeIds: ['101'], artifactIds: [String(artifactId)], unitIds: ['1'] },
  'a team names the rune, artifact and monster another team holds too');
assert.deepEqual(find(overlapPresets, 'deck-23-1').poolConflicts, { runeIds: ['101'], artifactIds: [String(artifactId)], unitIds: ['1'] },
  'and so does the other team');
assert.deepEqual(find(overlapPresets, 'deck-1-1').poolConflicts, { runeIds: [], artifactIds: [], unitIds: [] },
  'outside a pool one rune and one monster may stand in several presets');
const overlapRunes = readRunes(createImportedGame('overlap.json', clone(overlapping), validateGameFile(overlapping)).data);
assert.equal(runesInPreset(overlapRunes, find(overlapPresets, 'deck-23-1')).find((rune) => rune.id === '101').occupiedId, '1',
  'a rune the team\'s own monster carries is read on that monster, whoever else holds it');
assert.equal(runesInPreset(overlapRunes, find(overlapPresets, 'deck-23-2')).find((rune) => rune.id === '101').occupiedId, '2');

const poolAccount = { ...optimization, deck_list: [
  deck(23, 1, [11], [gear(11, arenaEleven.map(Number))]),
  deck(23, 2, [12], null),
  deck(1, 1, [11], [gear(11, arenaEleven.map(Number))]),
] };
assert.equal(validateGameFile(poolAccount).valid, true, `a whole pool reads: ${validateGameFile(poolAccount).message}`);
const poolGame = createImportedGame('pool.json', clone(poolAccount), validateGameFile(poolAccount));
const pooled = readPresets(poolGame.data, readOwnPresets([{ id: 'own-t', name: 'Draft', content: 'temple-of-chaos', members: ['11'], leaderUnitId: null, gear: null }]));
assert.equal(find(pooled, 'deck-23-1').pool, 'pool:temple-of-chaos');
assert.equal(find(pooled, 'deck-1-1').pool, null, 'Arena presets are placements of their own');
assert.equal(find(pooled, 'own-t').pool, null, 'a Temple of Chaos preset built in JASWA is a draft outside the game\'s pool');
assert.deepEqual([...find(pooled, 'deck-23-2').poolTakenUnitIds], ['11'], 'a team knows the monsters its pool\'s other teams hold');
const poolRunes = readRunes(poolGame.data);
const occupiedIn = (presetId) => Object.fromEntries(runesInPreset(poolRunes, find(pooled, presetId)).map((rune) => [rune.id, rune.occupiedId]));
assert.equal(occupiedIn('deck-23-2')['5013'], null, 'each team is read alone: a rune on another team is not engraved in this one');
assert.equal(occupiedIn('deck-23-2')['5007'], '12', 'and the team\'s own Scenario gear is its own');
assert.deepEqual([...find(pooled, 'deck-23-2').poolRuneIds].sort(), [...arenaEleven].sort(), 'a team knows the runes the pool\'s other teams hold');

/* Rune Optimization is never offered a rune another team holds; the user's own lock on one stands. */
assert.equal(runeLocksInPreset(noRuneLocks, find(pooled, 'deck-23-2'), '12')['5013'], 'excluded');
assert.equal(runeLocksInPreset(noRuneLocks, find(pooled, 'deck-23-2'), '12')['5007'], undefined, 'the team\'s own runes stay open to it');
assert.equal(runeLocksInPreset(noRuneLocks, find(pooled, 'deck-1-1'), '11')['5013'], undefined, 'outside a pool nothing is held back');
const lockedHere = { 'pool:temple-of-chaos': { 12: { 5013: 'locked' } } };
assert.equal(runeLocksInPreset(lockedHere, find(pooled, 'deck-23-2'), '12')['5013'], 'locked', 'a lock the user set stands over the pool');

/* An engrave never brings in a rune another team holds, and never edits another team. */
const poolBuild = ['5013', '5008', '5009', '5010', '5011', '5012'];
assert.throws(() => engraveImportedGame(poolGame, find(pooled, 'deck-23-2'), '12', poolBuild), /another team/,
  'a build taking a rune from another team of the pool is refused');

/* The game let team 2's 12 keep 5013, which team 1's 11 carries too. Both are read as
   the game has them, and engraving team 1 leaves team 2's runes where they are. */
const sharedAccount = { ...optimization, deck_list: [
  deck(23, 1, [11], [gear(11, arenaEleven.map(Number))]),
  deck(23, 2, [12], [gear(12, poolBuild.map(Number))]),
] };
const sharedGame = createImportedGame('shared.json', clone(sharedAccount), validateGameFile(sharedAccount));
const shared = readPresets(sharedGame.data, []);
assert.deepEqual(find(shared, 'deck-23-2').runesOf.get('12'), poolBuild, 'a team keeps the rune it shares with another');
assert.deepEqual(find(shared, 'deck-23-2').poolConflicts.runeIds, ['5013'], 'and names it as its fault');
const unitInShared = createImportedGame('shared.json', clone(sharedAccount), validateGameFile(sharedAccount)).data.unit_list.find((unit) => unit.unit_id === 12);
assert.deepEqual(monsterInPreset(unitInShared, find(shared, 'deck-23-2'), accountItems(sharedGame.data)).runes.map((rune) => String(rune.rune_id)), poolBuild,
  'the team\'s monster carries all six runes, as the game shows it');
const teamOne = engraveImportedGame(sharedGame, find(shared, 'deck-23-1'), '11', keepBuild);
assert.deepEqual(runeIdsByMember(gearOf(teamOne.data, 23, 1)), { 11: keepBuild }, 'the build lands in its team');
assert.deepEqual(gearOf(teamOne.data, 23, 2), gearOf(sharedGame.data, 23, 2), 'and the other team is untouched');
const kept = engraveImportedGame(sharedGame, find(shared, 'deck-23-2'), '12', poolBuild);
assert.deepEqual(runeIdsByMember(gearOf(kept.data, 23, 2)), { 12: poolBuild }, 'a shared rune the monster already carries may stay');

/* A monster in another team cannot join; a newcomer brings only Scenario gear no team holds. */
const editable = { ...poolGame, data: { ...poolGame.data, deck_list: [
  deck(23, 1, [11, 0], [gear(11, [5007])]), deck(23, 2, [0], []),
] } };
const editablePresets = readPresets(editable.data, []);
assert.throws(() => addToGamePreset(editable, find(editablePresets, 'deck-23-2'), find(editablePresets, 'scenario'), '11'), /another team/,
  'a monster of one Temple of Chaos team cannot join another');
const joined = addToGamePreset(editable, find(editablePresets, 'deck-23-1'), find(editablePresets, 'scenario'), '12');
assert.deepEqual(runeIdsByMember(gearOf(joined.data, 23, 1))['12'], twelveScenario.filter((id) => id !== '5007'),
  'a newcomer brings its Scenario gear less what the pool holds');

/* The other contents of several decks in one battle (§1 rule 6) share their runes and artifacts, not
   their monsters, and Dimension Raid's three phases are one pool although they are three contents. */
const raids = { ...only(
  deck(19, 1, [1], [gear(1, [101])]),
  deck(19, 2, [2], [gear(2, [102])]),
  deck(19, 3, [1], [gear(1, [102])]),
  deck(21, 1, [1], [gear(1, [101])]),
  deck(20, 1, [2], [gear(2, [])]),
  deck(3, 1, [2], [gear(2, [101])]),
  deck(3, 2, [1], [gear(1, [101])]),
  deck(2, 1, [1], [gear(1, [101])]),
  deck(2, 2, [2], [gear(2, [101])]),
  deck(6, 1, [1], [gear(1, [101])]),
), artifacts: [] };
assert.equal(validateGameFile(raids).valid, true, `an overlap in a raid's pool never fails the import: ${validateGameFile(raids).message}`);
const raidPresets = readPresets(createImportedGame('raids.json', clone(raids), validateGameFile(raids)).data, []);
assert.deepEqual(['deck-19-1', 'deck-20-1', 'deck-21-1'].map((id) => find(raidPresets, id).pool), Array(3).fill('pool:dimension-raid'),
  'Dimension Raid\'s phases are one pool');
assert.deepEqual(find(raidPresets, 'deck-21-1').poolConflicts, { runeIds: ['101'], artifactIds: [], unitIds: [] },
  'a rune on phase 1 and phase 3 is a fault of both, and the monster on both is not');
assert.deepEqual([...find(raidPresets, 'deck-20-1').poolRuneIds].sort(), ['101', '102'], 'a phase knows the runes the other phases hold');
assert.deepEqual(find(raidPresets, 'deck-20-1').poolTakenUnitIds.size, 0, 'and takes in any monster');
/* A battle places one deck per phase, so a phase's own presets are alternatives. */
assert.deepEqual(find(raidPresets, 'deck-19-2').poolConflicts.runeIds, [],
  'two presets of one phase may hold the same rune: only one of them is placed');
assert.equal(find(raidPresets, 'deck-19-3').poolRuneIds.has('102'), false, 'and neither withholds it from the other');
assert.equal(find(raidPresets, 'deck-21-1').poolRuneIds.has('102'), true, 'while another phase is still kept off it');
assert.equal(find(raidPresets, 'deck-3-2').pool, 'pool:rift-raid');
assert.deepEqual(find(raidPresets, 'deck-3-2').poolConflicts.runeIds, ['101'], 'Rift Raid\'s teams share one rune set');
/* deck_type 2 is World Guild Battle only by assumption: a guessed content is
   listed and marked, but withholds no rune from anything JASWA proposes. */
assert.equal(find(raidPresets, 'deck-2-2').contentAssumed, true);
assert.equal(find(raidPresets, 'deck-2-2').pool, null, 'a deck whose content is only assumed joins no pool');
assert.deepEqual(find(raidPresets, 'deck-2-2').poolConflicts.runeIds, [], 'and so has no overlap to report');
assert.equal(runeLocksInPreset(noRuneLocks, find(raidPresets, 'deck-2-1'), '1')['101'], undefined,
  'a rune another assumed deck holds stays on offer');
assert.equal(find(raidPresets, 'deck-6-1').pool, null, 'a content of one deck per battle shares nothing');
assert.equal(runeLocksInPreset(noRuneLocks, find(raidPresets, 'deck-6-1'), '1')['101'], undefined);
assert.equal(runeLocksInPreset(noRuneLocks, find(raidPresets, 'deck-20-1'), '2')['101'], 'excluded',
  'Rune Optimization in one phase is never offered a rune another phase holds');
for (const entry of presetContents) {
  const shared = ['siege-defense', 'world-guild', 'world-guild-defense', 'temple-of-chaos', 'rift-raid', 'dimension-raid-1', 'dimension-raid-2', 'dimension-raid-3'];
  assert.equal(entry.sharedPool !== null, shared.includes(entry.id), `${entry.name} ${shared.includes(entry.id) ? 'shares' : 'does not share'} one rune set across its decks`);
}
assert.equal(presetContent('siege').sharedPool, null, 'Siege Battle attacks are fought apart, so their runes may repeat');

console.log('Deck Presets: raw decks, defense decks, per-preset placements, presets by content, own presets one at a time, per-preset engraving and shared pools passed.');

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


// Team bonuses belong to one preset, not to an area profile, the roster or a shared pool.
const teamAccount = JSON.parse(readFileSync('tests/fixtures/automatic-team-bonuses.json', 'utf8'));
assert.equal(validateGameFile(teamAccount).valid, true, validateGameFile(teamAccount).message);
const teamData = createImportedGame('team-bonuses.json', teamAccount, validateGameFile(teamAccount)).data;
const teamItems = accountItems(teamData);
const teams = readPresets(teamData, []);
const team = (id) => teams.find((entry) => entry.id === id);
assert.deepEqual(teammateSetsInPreset(team('deck-1-1'), '11', teamItems),
  { Fight: 2, Determination: 1, Accuracy: 1, Enhance: 1, Tolerance: 1 });
assert.deepEqual(teammateSetsInPreset(team('scenario'), '11', teamItems), {});
assert.deepEqual(teammateSetsInPreset(team('deck-1-2'), '11', teamItems), {});
assert.deepEqual(teammateSetsInPreset(team('deck-1-3'), '11', teamItems), {});
assert.deepEqual(teammateSetsInPreset(team('deck-24-101'), '11', teamItems), { Fight: 1, Determination: 1, Accuracy: 1 });
assert.deepEqual(teammateSetsInPreset(team('deck-1-1'), 'not-a-member', teamItems), {});
const teamLocks = runeLocksInPreset(noRuneLocks, team('deck-1-1'), '11');
for (const id of team('deck-1-1').runesOf.get('12')) assert.equal(teamLocks[id], 'excluded');
for (const id of team('deck-1-1').runesOf.get('11')) assert.equal(teamLocks[id], undefined);
const withoutSoldRune = { ...teamItems, runes: new Map(teamItems.runes) };
withoutSoldRune.runes.delete(team('deck-1-1').runesOf.get('12')[0]);
assert.equal(teammateSetsInPreset(team('deck-1-1'), '11', withoutSoldRune).Fight, 1);
console.log('Automatic team bonuses: all five sets, Intangible, own-set exclusion, per-preset gear, Scenario fallback, sold runes and teammate protection agree.');

/* Leads are the preset's leaders' (`team-leads.ts`): Rift Raid 1–3 fight one
   battle under all three leaders, a lead counts only where its area and element
   reach, and leads of one attribute for the same monsters do not stack. Master ids from the snapshot:
   14404 CRI Rate 24 % everywhere, 12813 CRI Rate 10 %, 11801 SPD 19 %, 16714 CRI
   Dmg 25 %, 10101 RES 20 %, 14115 ATK 33 % in arena, 10502 ATK 30 % on Fire. */
{
  const unit = (unitId, masterId, attribute) => [unitId, { unit_id: Number(unitId), unit_master_id: masterId, attribute }];
  const roster = new Map([
    unit('1', 14404, 4), unit('2', 11801, 1), unit('3', 16714, 4), unit('4', 10101, 1), unit('5', 14115, 5),
    unit('6', 10502, 2), unit('7', 12813, 2), unit('8', 99999, 1), unit('9', 10502, 1),
  ]);
  const fake = (id, kind, contentId, number, members, leaderUnitId) => ({
    id, kind, name: id, number, members, leaderUnitId, content: contentId === null ? null : presetContent(contentId),
  });
  const raid = (number, members, leader) => fake(`deck-3-${number}`, 'game', 'rift-raid', number, members, leader);
  /* Rift Raid has decks 1, 2 and 3 only, and every battle fields all three. */
  const battle = [raid(1, ['1', '9'], '1'), raid(2, ['2', '5', '4'], '2'), raid(3, ['3', '6'], '3')];
  const reading = (preset, unitId, presets = battle) => teamLeadsFor(preset, presets, unitId, roster);
  const summary = (read) => read.leads.map((lead) => [lead.unitId, lead.reach]);

  assert.deepEqual(battleLeaders(battle[1], battle).map((leader) => leader.unitId), ['2', '1', '3'],
    'a Rift Raid deck fights under its own leader first, then the battle\'s others in deck order');
  const first = reading(battle[0], '9');
  assert.deepEqual(summary(first), [['1', 'counts'], ['2', 'counts'], ['3', 'counts']]);
  assert.deepEqual(first.bonuses, { criRate: 24, criDmg: 25 }, 'SPD reaches no figure here; CRI Rate and CRI Dmg do');
  const resisting = [raid(1, ['4'], '4'), raid(2, ['1'], null), raid(3, ['2'], null)];
  assert.deepEqual(reading(resisting[2], '2', resisting).bonuses, { res: 20 }, 'a leader of another deck reaches a deck with none');

  /* An Arena lead counts in no raid; a Fire lead only on a Fire member. */
  const arenaLed = [raid(1, ['5'], '5'), raid(2, ['6', '9'], '6')];
  assert.deepEqual(summary(reading(arenaLed[1], '9', arenaLed)), [['6', 'element'], ['5', 'area']]);
  assert.deepEqual(reading(arenaLed[1], '6', arenaLed).bonuses, { atk: 30 });

  /* Two CRI Rate leads: the larger counts, wherever it stands. */
  const twoCrits = [raid(1, ['7'], '7'), raid(2, ['1'], '1')];
  assert.deepEqual(summary(reading(twoCrits[0], '7', twoCrits)), [['7', 'outranked'], ['1', 'counts']]);
  assert.deepEqual(reading(twoCrits[0], '7', twoCrits).bonuses, { criRate: 24 });

  /* One stat, different monsters: a lead for every monster (13911, ATK 25 %)
     and a lead for Fire (11202, ATK 40 %) add up on a Fire member; two Fire
     leads of one stat do not (10502's 30 % gives way to 11202's 40 %). */
  const atkRoster = new Map([...roster, unit('20', 13911, 4), unit('21', 11202, 2), unit('22', 10502, 2), unit('23', 99999, 1)]);
  const atk = [raid(1, ['20', '21'], '20'), raid(2, ['21'], '21'), raid(3, ['22', '23'], '22')];
  const fire = teamLeadsFor(atk[0], atk, '21', atkRoster);
  assert.deepEqual(fire.leads.map((lead) => lead.reach), ['counts', 'counts', 'outranked']);
  assert.deepEqual(fire.bonuses, { atk: 65 }, 'a general and an element lead of one stat add up');
  assert.deepEqual(teamLeadsFor(atk[0], atk, '23', atkRoster).bonuses, { atk: 25 }, 'a Water member takes the general lead alone');

  /* A leader the import no longer holds, and one with no leader skill, add nothing and are still named. */
  const odd = fake('deck-1-1', 'game', 'arena-attack', 1, ['8', 'gone'], 'gone');
  assert.deepEqual(reading(odd, '8', [odd]).leads.map(({ unitId, missing, skill, reach }) => ({ unitId, missing, skill, reach })),
    [{ unitId: 'gone', missing: true, skill: null, reach: null }]);
  const leaderless = fake('deck-1-2', 'game', 'arena-attack', 2, ['8'], '8');
  assert.deepEqual(reading(leaderless, '8', [leaderless]).leads.map(({ skill, missing }) => ({ skill, missing })), [{ skill: null, missing: false }]);
  assert.deepEqual(reading(fake('deck-1-3', 'game', 'arena-attack', 3, ['8'], null), '8', []), { leads: [], bonuses: {} });

  /* Scenario states its leads by hand; a Rift Raid preset built here is a battle of its own; a preset not yet named counts General leads alone. */
  assert.equal(reading(fake('scenario', 'scenario', null, null, ['1'], null), '1'), null);
  const own = fake('own-1', 'own', 'rift-raid', null, ['2'], '2');
  assert.deepEqual(battleLeaders(own, [...battle, own]).map((leader) => leader.unitId), ['2']);
  const unnamed = fake('deck-99-1', 'game', null, null, ['5', '1'], '5');
  assert.deepEqual(summary(reading(unnamed, '1', [unnamed])), [['5', 'area']]);
  assert.equal(leadArea(unnamed), 'unnamed');
  console.log('Team leads: Rift Raid 1–3 as one battle, area, element, no stacking, a missing or skill-less leader, and Scenario agree.');
}
