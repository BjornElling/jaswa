'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

/* The Windows Steam protocol key lives in one place so a game update is a
 * small, reviewable change rather than a hidden behavior of the proxy. It
 * decrypts only the gateway envelope already sent to this computer; JASWA
 * never forwards it or the account data anywhere else. */
const steamProtocolKey = Buffer.from('Gr4S2eiNl7zq5MrU', 'utf8');
const zeroIv = Buffer.alloc(16);
const maximumDecodedResponseBytes = 32 * 1024 * 1024;

function decryptEnvelope(payload, key = steamProtocolKey) {
  if (typeof payload !== 'string' || !payload.trim()) throw new Error('The gateway envelope was empty.');
  const encrypted = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, zeroIv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function decodeRequest(payload, key = steamProtocolKey) {
  return JSON.parse(decryptEnvelope(payload, key).toString('utf8'));
}

function decodeResponse(payload, key = steamProtocolKey) {
  return JSON.parse(zlib.inflateSync(decryptEnvelope(payload, key), { maxOutputLength: maximumDecodedResponseBytes }).toString('utf8'));
}

module.exports = { decodeRequest, decodeResponse, decryptEnvelope, maximumDecodedResponseBytes, steamProtocolKey };
