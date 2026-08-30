'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { helperBlock, withoutHelperEntries } = require('../src/hosts.cjs');

test('removes only JASWA-owned hosts lines', () => {
  const hosts = `127.0.0.1\tlocalhost\r\n\r\n${helperBlock()}\r\n`;
  assert.equal(withoutHelperEntries(hosts), '127.0.0.1\tlocalhost');
});

test('preserves user entries enclosed by a malformed JASWA marker', () => {
  const marker = '# JASWA Helper — Summoners War Steam proxy';
  const hosts = `${marker}\r\n203.0.113.7\timportant.example\r\n${marker} end\r\n`;
  assert.equal(withoutHelperEntries(hosts), '203.0.113.7\timportant.example');
});
