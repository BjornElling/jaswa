'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi, listenApi, PortUnavailableError } = require('../src/api.cjs');
const { ProfileStore } = require('../src/profile-store.cjs');

function request(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = http.request({ host: '127.0.0.1', port: server.address().port, path, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ body, headers: response.headers, status: response.statusCode }));
    });
    client.on('error', reject);
    client.end();
  });
}

test('allows the profile only to an approved JASWA origin', async () => {
  const store = new ProfileStore();
  store.acceptSnapshot({ unit_list: [], runes: [], artifacts: [], relics: [], rune_craft_item_list: [] });
  const server = createApi({
    allowedOrigins: new Set(['http://localhost:3000']),
    port: 0,
    profileStore: store,
    status: () => ({ running: true, ...store.status(), lastError: null }),
  });
  await listenApi(server, 0);
  try {
    const noOrigin = await request(server, '/profile');
    assert.equal(noOrigin.status, 403);

    const otherOrigin = await request(server, '/profile', { Origin: 'https://example.test' });
    assert.equal(otherOrigin.status, 403);

    const approved = await request(server, '/health', { Origin: 'http://localhost:3000' });
    assert.equal(approved.status, 200);
    assert.equal(approved.headers['access-control-allow-origin'], 'http://localhost:3000');
    assert.deepEqual(JSON.parse(approved.body), { running: true, ...store.status(), lastError: null });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('reports a taken local port instead of listening silently', async () => {
  const store = new ProfileStore();
  const options = { allowedOrigins: new Set(), profileStore: store, status: () => store.status() };
  const occupied = await listenApi(createApi({ ...options, port: 0 }), 0);
  const { port } = occupied.address();
  try {
    await assert.rejects(
      listenApi(createApi({ ...options, port }), port),
      (error) => error instanceof PortUnavailableError && error.message.includes(String(port)),
    );
  } finally {
    await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
  }
});
