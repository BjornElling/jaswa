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
  assert.equal(store.applyUpdate({ rune: { rune_id: 6, upgrade_curr: 12 } }, { command: 'upgradeRune_v2' }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRuneCraftItem', craft_id_list: [9] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 5 }, { rune_id: 6, upgrade_curr: 12 }]);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
});
