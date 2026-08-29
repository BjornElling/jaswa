'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeProfile, suggestedExportPath, withJsonExtension } = require('../src/profile-export.cjs');

test('exports only the SWEX payload and omits session keys', () => {
  const data = {
    unit_list: [{ unit_id: 1 }],
    runes: [{ rune_id: 2 }],
    session_key: 'private',
    nested: { session_key_node: 'private', kept: true },
  };
  const expected = {
    unit_list: [{ unit_id: 1 }],
    runes: [{ rune_id: 2 }],
    nested: { kept: true },
  };

  assert.equal(serializeProfile({ data }), `${JSON.stringify(expected, null, 2)}\n`);
  assert.equal(serializeProfile(null), null);
});

test('suggests a dated JSON filename in the downloads folder', () => {
  assert.equal(
    suggestedExportPath('C:\\Users\\Captain\\Downloads', new Date('2026-08-29T10:15:00.000Z')),
    'C:\\Users\\Captain\\Downloads\\SummonersWar-2026-08-29.json',
  );
});

test('keeps a JSON extension when the chosen filename has none', () => {
  assert.equal(withJsonExtension('C:\\Users\\Captain\\Downloads\\profile'), 'C:\\Users\\Captain\\Downloads\\profile.json');
  assert.equal(withJsonExtension('C:\\Users\\Captain\\Downloads\\profile.JSON'), 'C:\\Users\\Captain\\Downloads\\profile.JSON');
});
