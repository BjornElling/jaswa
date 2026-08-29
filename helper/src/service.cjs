'use strict';

const dns = require('node:dns');
const fs = require('node:fs/promises');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Proxy } = require('http-mitm-proxy');
const { createApi } = require('./api.cjs');
const { allowedOrigins, dataDirectory, gatewayHosts, helperPort, proxyPort } = require('./config.cjs');
const { removeEntries, writeEntries } = require('./hosts.cjs');
const { ProfileStore } = require('./profile-store.cjs');
const { decodeRequest, decodeResponse } = require('./protocol.cjs');

const run = promisify(execFile);
const gatewayPath = '/api/gateway_c2.php';
const upstreamArgument = '--jaswa-upstream-map=';
const fallbackUpstreams = Object.freeze({
  'summonerswar-eu-lb.qpyou.cn': ['34.160.156.240'],
  'summonerswar-gb-lb.qpyou.cn': ['34.160.216.76'],
  'summonerswar-sea-lb.qpyou.cn': ['34.160.209.2'],
  'summonerswar-jp-lb.qpyou.cn': ['34.160.238.133'],
  'summonerswar-kr-lb.qpyou.cn': ['34.160.106.3'],
  'summonerswar-cn-lb.qpyou.cn': ['34.111.217.241'],
});

async function isAdministrator() {
  try { await run('net.exe', ['session'], { windowsHide: true }); return true; } catch { return false; }
}

async function resolveGatewayAddresses() {
  const entries = await Promise.all(Object.keys(gatewayHosts).map(async (hostname) => [hostname, await dns.promises.resolve4(hostname)]));
  return Object.fromEntries(entries);
}

function startupAddresses() {
  const encoded = process.argv.find((argument) => argument.startsWith(upstreamArgument))?.slice(upstreamArgument.length);
  if (!encoded) return new Map(Object.entries(fallbackUpstreams));
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return new Map(Object.entries(value).filter(([, addresses]) => Array.isArray(addresses) && addresses.every((address) => typeof address === 'string')));
  } catch { return new Map(Object.entries(fallbackUpstreams)); }
}

async function restartAsAdministrator(addresses) {
  const encoded = Buffer.from(JSON.stringify(addresses)).toString('base64url');
  const quotedArguments = [...process.argv.slice(1), `${upstreamArgument}${encoded}`].map((argument) => `'${argument.replace(/'/g, "''")}'`).join(', ');
  const command = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -ArgumentList ${quotedArguments || "''"} -Verb RunAs -WindowStyle Hidden`;
  await run('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
}

function startGatewayBridge(hostname, address) {
  const server = net.createServer((gameSocket) => {
    const proxySocket = net.connect(proxyPort, '127.0.0.1', () => {
      proxySocket.write(`CONNECT ${hostname}:443 HTTP/1.1\r\nHost: ${hostname}:443\r\n\r\n`);
    });
    let opening = true;
    let header = Buffer.alloc(0);
    const onProxyData = (chunk) => {
      if (!opening) return gameSocket.write(chunk);
      header = Buffer.concat([header, chunk]);
      const boundary = header.indexOf('\r\n\r\n');
      if (boundary === -1) return;
      const firstLine = header.subarray(0, boundary).toString('ascii').split('\r\n')[0];
      if (!/^HTTP\/1\.[01] 2\d\d/.test(firstLine)) return gameSocket.destroy(new Error(`Local proxy could not connect to ${hostname}.`));
      opening = false;
      proxySocket.off('data', onProxyData);
      const remainder = header.subarray(boundary + 4);
      if (remainder.length) gameSocket.write(remainder);
      gameSocket.pipe(proxySocket);
      proxySocket.pipe(gameSocket);
    };
    proxySocket.on('data', onProxyData);
    const closeBoth = () => { gameSocket.destroy(); proxySocket.destroy(); };
    gameSocket.on('error', closeBoth); proxySocket.on('error', closeBoth);
  });
  server.listen(443, address);
  return server;
}

async function installCertificate(certificatePath) {
  await run('certutil.exe', ['-user', '-addstore', '-f', 'Root', certificatePath], { windowsHide: true });
}

async function start() {
  if (process.platform !== 'win32') throw new Error('JASWA Helper only works with Summoners War on Steam for Windows.');
  if (!await isAdministrator()) {
    await restartAsAdministrator(await resolveGatewayAddresses());
    return { elevationRequested: true };
  }
  const directory = dataDirectory();
  await fs.mkdir(directory, { recursive: true });
  const certificateDirectory = path.join(directory, 'certificates');
  const profileStore = new ProfileStore();
  let lastError = null;
  let running = true;
  const api = createApi({
    allowedOrigins: allowedOrigins(), port: helperPort, profileStore,
    status: () => ({ running, profileReady: Boolean(profileStore.read()), lastError }),
  });
  const proxy = new Proxy();
  let hostsInstalled = false;
  const requestBodies = new WeakMap();
  const responseBodies = new WeakMap();
  /* The proxy also carries unrelated game traffic. Only an error tied to the
   * intercepted gateway, or a proxy-level error with no request context, can
   * say anything useful about the profile connection. */
  proxy.onError((context, error) => {
    const requestUrl = context?.clientToProxyRequest?.url;
    if (requestUrl && !requestUrl.includes(gatewayPath)) return;
    lastError = error.message;
  });
  proxy.onRequest((context, callback) => {
    if (!context.clientToProxyRequest.url.includes(gatewayPath)) return callback();
    context.use(Proxy.gunzip);
    requestBodies.set(context, []); responseBodies.set(context, []);
    context.onRequestData((requestContext, chunk, next) => { requestBodies.get(requestContext).push(chunk); next(null, chunk); });
    context.onResponseData((responseContext, chunk, next) => { responseBodies.get(responseContext).push(chunk); next(null, chunk); });
    context.onResponseEnd((responseContext, next) => {
      try {
        const request = decodeRequest(Buffer.concat(requestBodies.get(responseContext)).toString('utf8'));
        const response = decodeResponse(Buffer.concat(responseBodies.get(responseContext)).toString('utf8'));
        if (request.command === 'HubUserLogin' || request.command === 'GuestLogin') profileStore.acceptSnapshot(response);
        else profileStore.applyUpdate(response, request);
        /* A decoded gateway response proves the link recovered. Do not leave a
         * transient proxy error in the tray forever after that proof arrives. */
        lastError = null;
      } catch (error) { lastError = `Could not read one game response: ${error.message}`; }
      next();
    });
    callback();
  });
  /* Resolve before the temporary hosts entries point these names to loopback.
   * The game load balancer can still choose a fresh address every helper start,
   * while the proxy never asks Windows to resolve the redirected names again. */
  const upstreamAddresses = startupAddresses();
  const upstreamAgent = new https.Agent({
    keepAlive: false,
    /* Hosts points the gateway names at loopback for the game. The proxy must
     * deliberately bypass that local override on its own outbound connection,
     * otherwise it would send the request straight back into itself. */
    lookup: (hostname, options, callback) => {
      const addresses = upstreamAddresses.get(hostname);
      if (!addresses?.[0]) return callback(new Error(`DNS returned no IPv4 address for ${hostname}.`));
      if (options.all) return callback(null, addresses.map((address) => ({ address, family: 4 })));
      return callback(null, addresses[0], 4);
    },
  });
  let bridges = [];
  try {
    /* Hosts changes are the only administrative operation. Do it before
     * opening ports or trusting a certificate, so declining the Windows prompt
     * leaves no half-running helper behind. */
    await writeEntries();
    hostsInstalled = true;
    await run('ipconfig.exe', ['/flushdns'], { windowsHide: true });
    await new Promise((resolve, reject) => proxy.listen({ host: '127.0.0.1', port: proxyPort, sslCaDir: certificateDirectory, httpsAgent: upstreamAgent }, (error) => error ? reject(error) : resolve()));
    const certificatePath = path.join(certificateDirectory, 'certs', 'ca.pem');
    await installCertificate(certificatePath);
    bridges = Object.entries(gatewayHosts).map(([hostname, address]) => startGatewayBridge(hostname, address));
  } catch (error) {
    api.close();
    try { proxy.close(); } catch { /* The proxy can fail before it owns a server. */ }
    if (hostsInstalled) {
      try { await removeEntries(); await run('ipconfig.exe', ['/flushdns'], { windowsHide: true }); } catch { /* The original startup error is the useful one. */ }
    }
    throw error;
  }
  const stop = async () => {
    if (!running) return;
    running = false;
    for (const bridge of bridges) bridge.close();
    proxy.close(); api.close();
    if (hostsInstalled) {
      try { await removeEntries(); await run('ipconfig.exe', ['/flushdns'], { windowsHide: true }); } catch (error) { console.error(`Could not remove the temporary gateway rules: ${error.message}`); }
    }
  };
  process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
  return {
    profile: () => profileStore.read(),
    status: () => ({ running, lastError }),
    stop,
  };
}

function reportStartupError(error) {
  const message = `JASWA Helper could not start: ${error.stack || error.message}`;
  console.error(message);
  /* Packaged Windows applications do not always have a visible console. A
   * short local startup note turns a vanished window into something support can
   * diagnose without writing account data or proxy traffic to disk. */
  fs.mkdir(dataDirectory(), { recursive: true })
    .then(() => fs.appendFile(path.join(dataDirectory(), 'startup.log'), `${new Date().toISOString()} ${message}\n`))
    .finally(() => process.exit(1));
}

if (require.main === module) start().catch(reportStartupError);

module.exports = { reportStartupError, start };
