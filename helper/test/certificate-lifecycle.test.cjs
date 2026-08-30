'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanup } = require('../src/service.cjs');

test('keeps the local certificate when cleanup does not request its removal', async () => {
  const calls = [];
  await cleanup({
    platform: 'win32',
    certificatePath: 'C:\\JASWA Helper\\certificates\\certs\\ca.pem',
    removeHostEntries: async () => { calls.push('hosts'); },
    execute: async () => { calls.push('flush DNS'); },
    removeCertificateAt: async () => { calls.push('certificate'); },
  });

  assert.deepEqual(calls, ['hosts', 'flush DNS']);
});

test('removes the local certificate only when uninstalling with approval', async () => {
  const calls = [];
  await cleanup({
    removeCertificate: true,
    platform: 'win32',
    certificatePath: 'C:\\JASWA Helper\\certificates\\certs\\ca.pem',
    removeHostEntries: async () => { calls.push('hosts'); },
    execute: async () => { calls.push('flush DNS'); },
    removeCertificateAt: async (certificatePath) => { calls.push(certificatePath); },
  });

  assert.deepEqual(calls, ['hosts', 'flush DNS', 'C:\\JASWA Helper\\certificates\\certs\\ca.pem']);
});
