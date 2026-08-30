'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setStartsWithWindows, startsWithWindows } = require('../src/startup.cjs');

test('uses the installed helper executable for the Windows sign-in setting', () => {
  let openAtLogin = false;
  let settings;
  const app = {
    isPackaged: true,
    getLoginItemSettings: () => ({ openAtLogin }),
    getPath: (name) => name === 'exe' ? 'C:\\Program Files\\JASWA Helper\\JASWA Helper.exe' : '',
    setLoginItemSettings: (value) => { settings = value; openAtLogin = value.openAtLogin; },
  };

  assert.equal(startsWithWindows(app), false);
  assert.equal(setStartsWithWindows(app, true), true);
  assert.deepEqual(settings, {
    openAtLogin: true,
    openAsHidden: true,
    path: 'C:\\Program Files\\JASWA Helper\\JASWA Helper.exe',
  });
});

test('does not register a development build at Windows sign-in', () => {
  const app = {
    isPackaged: false,
    getLoginItemSettings: () => ({ openAtLogin: true }),
    getPath: () => 'ignored',
    setLoginItemSettings: () => { throw new Error('must not be called'); },
  };
  assert.equal(startsWithWindows(app), false);
  assert.equal(setStartsWithWindows(app, true), false);
});
