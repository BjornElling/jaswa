'use strict';

const http = require('node:http');

function writeJson(response, status, value, origin, allowedOrigins) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
    headers['Access-Control-Allow-Private-Network'] = 'true';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(value));
}

class PortUnavailableError extends Error {
  constructor(port, cause) {
    super(`Another program is already using local port ${port}.`);
    this.name = 'PortUnavailableError';
    this.cause = cause;
  }
}

function createApi({ allowedOrigins, port, profileStore, status }) {
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin;
    const originAllowed = typeof origin === 'string' && allowedOrigins.has(origin);
    if (request.method === 'OPTIONS') {
      if (!originAllowed) return writeJson(response, 403, { error: 'This page is not allowed to read JASWA Helper.' }, origin, allowedOrigins);
      response.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      });
      return response.end();
    }
    if (request.method !== 'GET') return writeJson(response, 405, { error: 'Only reading your local import is supported.' }, origin, allowedOrigins);
    /* Loopback is not an Internet-facing service. Requiring an approved Origin
       prevents an unrelated website from reading the local profile in a browser. */
    if (!originAllowed) return writeJson(response, 403, { error: 'This page is not allowed to read JASWA Helper.' }, origin, allowedOrigins);
    if (request.url === '/health') return writeJson(response, 200, status(), origin, allowedOrigins);
    if (request.url === '/profile') {
      const profile = profileStore.read();
      return profile ? writeJson(response, 200, profile, origin, allowedOrigins) : writeJson(response, 404, { error: 'Start Summoners War to capture an account snapshot.' }, origin, allowedOrigins);
    }
    return writeJson(response, 404, { error: 'Unknown local JASWA Helper route.' }, origin, allowedOrigins);
  });
  /* A killed predecessor can still hold the port for a moment, and unrelated
     software may own it outright. Binding has to fail loudly here, or the
     helper runs on with no API and the page never finds it. */
  server.on('error', (error) => console.error(`Local API stopped: ${error.message}`));
  return server;
}

async function listenApi(server, port, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error?.code === 'EADDRINUSE' || error?.code === 'EACCES' ? new PortUnavailableError(port, error) : error);
    };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
  return server;
}

module.exports = { createApi, listenApi, PortUnavailableError };
