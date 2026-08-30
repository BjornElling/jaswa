'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { restartRequired, startsWithActiveGame } = require('../src/service.cjs');

test('requires a fresh game start when the helper finds an already-running game without a snapshot', () => {
  assert.equal(restartRequired({ hasProfile: false }, true, true), true);
  assert.equal(restartRequired({ hasProfile: false }, false, true), false);
  assert.equal(restartRequired({ hasProfile: true }, true, true), false);
  assert.equal(restartRequired({ hasProfile: false }, true, false), false);
});

test('distinguishes a game that started before the helper from one started afterwards', () => {
  assert.equal(startsWithActiveGame(false, true, { hasProfile: false }), true);
  assert.equal(startsWithActiveGame(true, true, { hasProfile: false }), false);
  assert.equal(startsWithActiveGame(false, false, { hasProfile: false }), false);
});
