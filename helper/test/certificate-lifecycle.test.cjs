'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanup, releaseHostEntries } = require('../src/service.cjs');

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

test('retries the hosts file through a transient lock', async () => {
  let attempts = 0;
  const removed = await releaseHostEntries({
    pause: async () => {},
    record: async () => {},
    execute: async () => {},
    removeHostEntries: async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    },
  });

  assert.equal(removed, true);
  assert.equal(attempts, 3);
});

test('records a diagnostic when the hosts file never unlocks', async () => {
  const recorded = [];
  const removed = await releaseHostEntries({
    attempts: 2,
    pause: async () => {},
    execute: async () => {},
    record: async (kind) => { recorded.push(kind); },
    removeHostEntries: async () => { throw new Error('locked'); },
  });

  assert.equal(removed, false);
  assert.deepEqual(recorded, ['hosts cleanup failure']);
});

test('reports an uninstall that cannot clear the gateway rules', async () => {
  await assert.rejects(
    cleanup({
      platform: 'win32',
      pause: async () => {},
      record: async () => {},
      removeHostEntries: async () => { throw new Error('locked'); },
      execute: async () => {},
      removeCertificateAt: async () => {},
    }),
    /could not be removed from the hosts file/,
  );
});
