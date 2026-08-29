'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { gatewayHosts, hostsMarker } = require('./config.cjs');

function hostsPath(platform = process.platform, root = process.env.SystemRoot) {
  if (platform !== 'win32') throw new Error('JASWA Helper only supports Windows.');
  if (!root) throw new Error('Windows did not provide its system directory.');
  return path.join(root, 'System32', 'drivers', 'etc', 'hosts');
}

function withoutHelperEntries(contents) {
  const lines = contents.replace(/\r\n/g, '\n').split('\n');
  const retained = [];
  let skipping = false;
  for (const line of lines) {
    if (line === hostsMarker) { skipping = true; continue; }
    if (line === `${hostsMarker} end`) { skipping = false; continue; }
    if (!skipping) retained.push(line);
  }
  return retained.join('\r\n').replace(/\r\n+$/, '');
}

function helperBlock(entries = gatewayHosts) {
  const lines = Object.entries(entries).map(([host, address]) => `${address}\t${host}`);
  return [hostsMarker, ...lines, `${hostsMarker} end`].join('\r\n');
}

async function writeEntries(file = hostsPath(), entries = gatewayHosts) {
  const current = await fs.readFile(file, 'utf8');
  const clean = withoutHelperEntries(current);
  await fs.writeFile(file, `${clean}\r\n\r\n${helperBlock(entries)}\r\n`, 'utf8');
}

async function removeEntries(file = hostsPath()) {
  const current = await fs.readFile(file, 'utf8');
  const clean = withoutHelperEntries(current);
  if (clean !== current.replace(/\r\n+$/, '')) await fs.writeFile(file, `${clean}\r\n`, 'utf8');
}

module.exports = { helperBlock, hostsPath, removeEntries, withoutHelperEntries, writeEntries };
