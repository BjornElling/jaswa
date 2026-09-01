'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProfileStore } = require('../src/profile-store.cjs');

test('keeps an account snapshot and merges known live runes by identifier', () => {
  const store = new ProfileStore();
  assert.equal(store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [{ rune_id: 5, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [] }), true);
  assert.equal(store.applyUpdate({ runes: [{ rune_id: 5, upgrade_curr: 12 }, { rune_id: 6, upgrade_curr: 0 }] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, upgrade_curr: 12 }]);
  assert.equal(store.read().source, 'live');
});

test('keeps known live item responses and removes sold items', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [], runes: [{ rune_id: 5 }], artifacts: [], relics: [], rune_craft_item_list: [{ craft_item_id: 9 }] });
  assert.equal(store.applyUpdate({ rune: { rune_id: 5, upgrade_curr: 12 } }, { command: 'upgradeRune' }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRuneCraftItem', craft_id_list: [9] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, upgrade_curr: 12 }]);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
});

test('keeps one owned PvE copy of each snapshot monster', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    wizard_id: 7,
    unit_list: [
      { unit_id: 1, wizard_id: 7, unit_master_id: 10101, building_id: 0 },
      { unit_id: 2, wizard_id: 9, unit_master_id: 10101, building_id: 0 },
      { unit_id: 1, wizard_id: 7, unit_master_id: 10101, building_id: 0 },
    ],
    runes: [{ rune_id: 5 }, { rune_id: 5 }], artifacts: [{ rid: 6 }, { rid: 6 }], relics: [{ rid: 7 }, { rid: 7 }], rune_craft_item_list: [],
  });

  assert.deepEqual(store.read().data.unit_list.map((unit) => unit.unit_id), [1]);
  assert.deepEqual(store.read().data.runes.map((rune) => rune.rune_id), [5]);
  assert.deepEqual(store.read().data.artifacts.map((artifact) => artifact.rid), [6]);
  assert.deepEqual(store.read().data.relics.map((relic) => relic.rid), [7]);
});

test('retains inventory artifacts and relics alongside equipped items', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [{ unit_id: 1, artifacts: [{ rid: 6 }], relics: [{ rid: 7 }] }],
    runes: [],
    artifacts: [{ rid: 8 }, { rid: 8 }],
    relics: [{ rid: 9 }, { rid: 9 }],
    rune_craft_item_list: [],
  });

  assert.deepEqual(store.read().data.artifacts.map((artifact) => artifact.rid), [8]);
  assert.deepEqual(store.read().data.relics.map((relic) => relic.rid), [9]);
  assert.deepEqual(store.read().data.unit_list[0].artifacts.map((artifact) => artifact.rid), [6]);
  assert.deepEqual(store.read().data.unit_list[0].relics.map((relic) => relic.rid), [7]);
});

test('does not add opponent, helper, shop-preview or RTA records to the account', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    wizard_id: 7,
    unit_list: [{ unit_id: 1, wizard_id: 7, unit_master_id: 10101, building_id: 0 }],
    runes: [{ rune_id: 5, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [],
  });
  const revision = store.status().revision;

  assert.equal(store.applyUpdate({ helper: { unit_id: 2, wizard_id: 9, unit_master_id: 10101 } }, { command: 'GetHelperList_v2' }), false);
  assert.equal(store.applyUpdate({ rune: { rune_id: 6, upgrade_curr: 12 } }, { command: 'GetBlackMarketList' }), false);
  assert.equal(store.applyUpdate({ unit: { unit_id: 1, wizard_id: 7, unit_master_id: 10101, building_id: 99 } }, { command: 'GetRTPvPInfo_v3' }), false);
  assert.equal(store.status().revision, revision);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 1, wizard_id: 7, unit_master_id: 10101, building_id: 0 }]);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, upgrade_curr: 9 }]);
});

test('keeps a snapshot ready during a quiet game session', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  assert.equal(store.isConnected(), true);
  assert.equal(store.status().profileReady, true);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 1 }]);
});

test('does not publish a new revision for an unchanged live response', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [], runes: [{ rune_id: 5, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [] });
  const revision = store.status().revision;

  assert.equal(store.applyUpdate({ rune: { rune_id: 5, upgrade_curr: 9 } }, { command: 'upgradeRune' }), false);
  assert.equal(store.status().revision, revision);
  assert.equal(store.read().source, 'game-start');
});

test('uses an acknowledged storage request to update a monster placement', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [{ unit_id: 1, unit_master_id: 10101, building_id: 0, runes: [{ rune_id: 5, set_id: 13 }] }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  assert.equal(store.applyUpdate({}, { command: 'SetUnitInStorage', unit_id: 1, building_id: 25 }), true);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 1, unit_master_id: 10101, building_id: 25, runes: [{ rune_id: 5, set_id: 13 }] }]);
});

test('finds changed account records behind new response wrappers without losing omitted fields', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [{ unit_id: 1, unit_master_id: 10101, building_id: 0, runes: [{ rune_id: 5, set_id: 13 }] }],
    runes: [{ rune_id: 6, set_id: 2, slot_no: 1, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [],
  });

  assert.equal(store.applyUpdate({ changed: { units: [{ unit_id: 1, building_id: 25 }], loot: { rune: { rune_id: 6, upgrade_curr: 12 } } } }), true);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 1, unit_master_id: 10101, building_id: 25, runes: [{ rune_id: 5, set_id: 13 }] }]);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 6, set_id: 2, slot_no: 1, upgrade_curr: 12 }]);
});

test('keeps rune, artifact and relic ownership current when an action has no item response', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [{ unit_id: 1, unit_master_id: 10101, runes: [], artifacts: [], relics: [] }],
    runes: [{ rune_id: 5, set_id: 13 }],
    artifacts: [{ rid: 6, pri_effect: [100, 100] }],
    relics: [{ rid: 7, pri_effect: [101, 100] }],
    rune_craft_item_list: [],
  });

  assert.equal(store.applyUpdate({}, { command: 'EquipRune', rune_id: 5, unit_id: 1 }), true);
  assert.deepEqual(store.read().data.unit_list[0].runes, [{ rune_id: 5, set_id: 13 }]);
  assert.deepEqual(store.read().data.runes, []);
  assert.equal(store.applyUpdate({}, { command: 'UpdateArtifactOccupation', updates: [{ rid: 6, unit_id: 1 }] }), true);
  assert.equal(store.applyUpdate({}, { command: 'UpdateRelicOccupation', updates: [{ rid: 7, unit_id: 1 }] }), true);
  assert.deepEqual(store.read().data.unit_list[0].artifacts, [{ rid: 6, pri_effect: [100, 100] }]);
  assert.deepEqual(store.read().data.unit_list[0].relics, [{ rid: 7, pri_effect: [101, 100] }]);
  assert.equal(store.applyUpdate({}, { command: 'UnequipRune', rune_id: 5 }), true);
  assert.deepEqual(store.read().data.unit_list[0].runes, []);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, set_id: 13 }]);
});

test('removes every sold tracked item, including its equipped copy', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [{ unit_id: 1, unit_master_id: 10101, artifacts: [{ rid: 6 }], relics: [{ rid: 7 }] }],
    runes: [{ rune_id: 5 }], artifacts: [{ rid: 6 }], relics: [{ rid: 7 }], rune_craft_item_list: [{ craft_item_id: 8 }],
  });

  assert.equal(store.applyUpdate({}, { command: 'SellRune', rune_id_list: [5] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellArtifacts', rid_list: [6] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRelics', rid_list: [7] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRuneCraftItem', craft_id_list: [8] }), true);
  assert.deepEqual(store.read().data.runes, []);
  assert.deepEqual(store.read().data.artifacts, []);
  assert.deepEqual(store.read().data.relics, []);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
  assert.deepEqual(store.read().data.unit_list[0].artifacts, []);
  assert.deepEqual(store.read().data.unit_list[0].relics, []);
});

test('removes a gem or grindstone when it is spent on a rune', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [], runes: [{ rune_id: 5, upgrade_curr: 12, sec_effect: [[8, 10]] }], artifacts: [], relics: [],
    rune_craft_item_list: [{ craft_item_id: 8, craft_type: 1 }, { craft_item_id: 9, craft_type: 2 }],
  });

  assert.equal(store.applyUpdate({ rune: { rune_id: 5, sec_effect: [[8, 15]] } }, { command: 'AmplifyRune_v2', rune_id: 5, craft_item_id: 8 }), true);
  assert.equal(store.applyUpdate({ rune: { rune_id: 5, sec_effect: [[4, 15]] } }, { command: 'ConvertRune_v2', rune_id: 5, craft_item_id: 9 }), true);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, upgrade_curr: 12, sec_effect: [[4, 15]] }]);
});

test('decrements a stacked gem or grindstone for each rune action', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [], runes: [{ rune_id: 5, upgrade_curr: 12, sec_effect: [[8, 10]] }], artifacts: [], relics: [],
    rune_craft_item_list: [{ craft_item_id: 8, craft_type: 1, amount: 3 }],
  });

  assert.equal(store.applyUpdate({ rune: { rune_id: 5, sec_effect: [[8, 15]] } }, { command: 'AmplifyRune_v2', rune_id: 5, craft_item_id: 8 }), true);
  assert.deepEqual(store.read().data.rune_craft_item_list, [{ craft_item_id: 8, craft_type: 1, amount: 2 }]);
  assert.equal(store.applyUpdate({ rune: { rune_id: 5, sec_effect: [[8, 18]] } }, { command: 'AmplifyRune_v2', rune_id: 5, craft_item_id: 8 }), true);
  assert.deepEqual(store.read().data.rune_craft_item_list, [{ craft_item_id: 8, craft_type: 1, amount: 1 }]);
  assert.equal(store.applyUpdate({ rune: { rune_id: 5, sec_effect: [[8, 21]] } }, { command: 'AmplifyRune_v2', rune_id: 5, craft_item_id: 8 }), true);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
});
