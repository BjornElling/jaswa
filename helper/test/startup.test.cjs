'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setStartsWithWindows, startsWithWindows } = require('../src/startup.cjs');
const { resolveGatewayAddresses } = require('../src/service.cjs');

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

test('uses built-in gateway addresses when the local DNS resolver is unavailable', async () => {
  const addresses = await resolveGatewayAddresses({
    resolve4: async () => { throw new Error('ECONNREFUSED'); },
    record: async () => {},
  });
  assert.deepEqual(addresses, {
    'summonerswar-eu-lb.qpyou.cn': ['34.160.156.240'],
    'summonerswar-gb-lb.qpyou.cn': ['34.160.216.76'],
    'summonerswar-sea-lb.qpyou.cn': ['34.160.209.2'],
    'summonerswar-jp-lb.qpyou.cn': ['34.160.238.133'],
    'summonerswar-kr-lb.qpyou.cn': ['34.160.106.3'],
    'summonerswar-cn-lb.qpyou.cn': ['34.111.217.241'],
  });
});
