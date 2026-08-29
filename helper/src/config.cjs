'use strict';

const path = require('node:path');
const os = require('node:os');

const helperPort = 37654;
const proxyPort = 37655;
const hostsMarker = '# JASWA Helper — Summoners War Steam proxy';
const gatewayHosts = Object.freeze({
  'summonerswar-eu-lb.qpyou.cn': '127.11.12.13',
  'summonerswar-gb-lb.qpyou.cn': '127.11.12.14',
  'summonerswar-sea-lb.qpyou.cn': '127.11.12.15',
  'summonerswar-jp-lb.qpyou.cn': '127.11.12.16',
  'summonerswar-kr-lb.qpyou.cn': '127.11.12.17',
  'summonerswar-cn-lb.qpyou.cn': '127.11.12.18',
});

function dataDirectory(environment = process.env, platform = process.platform) {
  if (platform === 'win32') return path.join(environment.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'JASWA Helper');
  return path.join(os.homedir(), '.jaswa-helper');
}

function allowedOrigins(environment = process.env) {
  const configured = environment.JASWA_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set(['http://localhost:3000', 'http://127.0.0.1:3000', ...configured]);
}

module.exports = { allowedOrigins, dataDirectory, gatewayHosts, helperPort, hostsMarker, proxyPort };
