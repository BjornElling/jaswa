'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProfileStore } = require('../src/profile-store.cjs');

test('keeps an account snapshot and merges live rune updates by identifier', () => {
  const store = new ProfileStore();
  assert.equal(store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [{ rune_id: 5, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [] }), true);
  assert.equal(store.applyUpdate({ runes: [{ rune_id: 5, upgrade_curr: 12 }, { rune_id: 6, upgrade_curr: 0 }] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, upgrade_curr: 12 }, { rune_id: 6, upgrade_curr: 0 }]);
  assert.equal(store.read().source, 'live');
});

test('keeps live single-item responses and removes sold items', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [], runes: [{ rune_id: 5 }], artifacts: [], relics: [], rune_craft_item_list: [{ craft_item_id: 9 }] });
  assert.equal(store.applyUpdate({ rune: { rune_id: 6, upgrade_curr: 12 } }, { command: 'upgradeRune' }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRuneCraftItem', craft_id_list: [9] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5 }, { rune_id: 6, upgrade_curr: 12 }]);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
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
    artifacts: [{ artifact_id: 6, pri_effect: [100, 100] }],
    relics: [{ relic_id: 7, pri_effect: [101, 100] }],
    rune_craft_item_list: [],
  });

  assert.equal(store.applyUpdate({}, { command: 'EquipRune', rune_id: 5, unit_id: 1 }), true);
  assert.deepEqual(store.read().data.unit_list[0].runes, [{ rune_id: 5, set_id: 13 }]);
  assert.deepEqual(store.read().data.runes, []);
  assert.equal(store.applyUpdate({}, { command: 'UpdateArtifactOccupation', updates: [{ artifact_id: 6, unit_id: 1 }] }), true);
  assert.equal(store.applyUpdate({}, { command: 'UpdateRelicOccupation', updates: [{ relic_id: 7, unit_id: 1 }] }), true);
  assert.deepEqual(store.read().data.unit_list[0].artifacts, [{ artifact_id: 6, pri_effect: [100, 100] }]);
  assert.deepEqual(store.read().data.unit_list[0].relics, [{ relic_id: 7, pri_effect: [101, 100] }]);
  assert.equal(store.applyUpdate({}, { command: 'UnequipRune', rune_id: 5 }), true);
  assert.deepEqual(store.read().data.unit_list[0].runes, []);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5, set_id: 13 }]);
});

test('removes every sold tracked item, including its equipped copy', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({
    unit_list: [{ unit_id: 1, unit_master_id: 10101, artifacts: [{ artifact_id: 6 }], relics: [{ relic_id: 7 }] }],
    runes: [{ rune_id: 5 }], artifacts: [{ artifact_id: 6 }], relics: [{ relic_id: 7 }], rune_craft_item_list: [{ craft_item_id: 8 }],
  });

  assert.equal(store.applyUpdate({}, { command: 'SellRune', rune_id_list: [5] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellArtifacts', artifact_ids: [6] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRelics', relic_ids: [7] }), true);
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
