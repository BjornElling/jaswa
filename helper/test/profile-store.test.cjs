'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProfileStore, profileActivityTimeoutMs } = require('../src/profile-store.cjs');

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
  assert.equal(store.applyUpdate({}, { command: 'SellRune_v2', rune_id_list: [5] }), true);
  assert.equal(store.applyUpdate({}, { command: 'SellRuneCraftItem', craft_id_list: [9] }), true);
  assert.deepEqual(store.read().data.runes, [{ rune_id: 6, upgrade_curr: 12 }]);
  assert.deepEqual(store.read().data.rune_craft_item_list, []);
});

test('expires a cached profile when gateway activity stops', () => {
  let now = 1_000;
  const store = new ProfileStore(() => now);
  store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  assert.equal(store.isConnected(), true);
  now += profileActivityTimeoutMs + 1;
  assert.equal(store.isConnected(), false);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 1 }]);
});

test('keeps a session connected while gateway activity continues', () => {
  let now = 1_000;
  const store = new ProfileStore(() => now);
  store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  now += profileActivityTimeoutMs - 1;
  store.markActivity();
  now += profileActivityTimeoutMs - 1;
  assert.equal(store.isConnected(), true);
});

test('drops the previous snapshot before a new session can reuse it', () => {
  let now = 1_000;
  const store = new ProfileStore(() => now);
  store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  now += profileActivityTimeoutMs + 1;
  store.markActivity();
  assert.equal(store.read(), null);
  assert.equal(store.isConnected(), false);
});

test('keeps a fresh login snapshot after the previous session has expired', () => {
  let now = 1_000;
  const store = new ProfileStore(() => now);
  store.acceptSnapshot({ unit_list: [{ unit_id: 1 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });

  now += profileActivityTimeoutMs + 1;
  assert.equal(store.acceptSnapshot({ unit_list: [{ unit_id: 2 }], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] }), true);
  assert.deepEqual(store.read().data.unit_list, [{ unit_id: 2 }]);
  assert.equal(store.status().sessionId, 2);
});

test('does not publish a new revision for an unchanged live response', () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [], runes: [{ rune_id: 5, upgrade_curr: 9 }], artifacts: [], relics: [], rune_craft_item_list: [] });
  const revision = store.status().revision;

  assert.equal(store.applyUpdate({ rune: { rune_id: 5, upgrade_curr: 9 } }, { command: 'upgradeRune_v2' }), false);
  assert.equal(store.status().revision, revision);
  assert.equal(store.read().source, 'game-start');
});
