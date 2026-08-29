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

function createApi({ allowedOrigins, port, profileStore, status }) {
  return http.createServer((request, response) => {
    const origin = request.headers.origin;
    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) return writeJson(response, 403, { error: 'This page is not allowed to read JASWA Helper.' }, origin, allowedOrigins);
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
    if (origin && !allowedOrigins.has(origin)) return writeJson(response, 403, { error: 'This page is not allowed to read JASWA Helper.' }, origin, allowedOrigins);
    if (request.url === '/health') return writeJson(response, 200, status(), origin, allowedOrigins);
    if (request.url === '/profile') {
      const profile = profileStore.read();
      return profile ? writeJson(response, 200, profile, origin, allowedOrigins) : writeJson(response, 404, { error: 'Start Summoners War to capture an account snapshot.' }, origin, allowedOrigins);
    }
    return writeJson(response, 404, { error: 'Unknown local JASWA Helper route.' }, origin, allowedOrigins);
  }).listen(port, '127.0.0.1');
}

module.exports = { createApi };
