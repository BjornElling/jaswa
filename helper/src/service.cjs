'use strict';

const dns = require('node:dns');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Proxy } = require('http-mitm-proxy');
const { createApi } = require('./api.cjs');
const { allowedOrigins, dataDirectory, gatewayHosts, helperPort, proxyPort } = require('./config.cjs');
const { recordDiagnostic } = require('./diagnostics.cjs');
const { removeEntries, writeEntries } = require('./hosts.cjs');
const { ProfileStore } = require('./profile-store.cjs');
const { decodeRequest, decodeResponse } = require('./protocol.cjs');

const run = promisify(execFile);
const gatewayPath = '/api/gateway_c2.php';
const upstreamArgument = '--jaswa-upstream-map=';
const maximumInterceptedBodyBytes = 16 * 1024 * 1024;
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

async function resolveGatewayAddresses({ resolve4 = dns.promises.resolve4, record = recordDiagnostic } = {}) {
  const entries = await Promise.all(Object.keys(gatewayHosts).map(async (hostname) => {
    try {
      const addresses = (await resolve4(hostname)).filter((address) => net.isIP(address) === 4);
      if (addresses.length > 0) return [hostname, addresses];
      throw new Error('DNS returned no IPv4 address.');
    } catch (error) {
      const fallback = fallbackUpstreams[hostname];
      if (fallback) {
        await record('startup DNS fallback', `${hostname}: ${error instanceof Error ? error.message : String(error)}`);
        return [hostname, fallback];
      }
      throw error;
    }
  }));
  return Object.fromEntries(entries);
}

function startupAddresses() {
  const encoded = process.argv.find((argument) => argument.startsWith(upstreamArgument))?.slice(upstreamArgument.length);
  if (!encoded) return new Map(Object.entries(fallbackUpstreams));
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const entries = Object.keys(gatewayHosts).map((hostname) => {
      const addresses = value[hostname];
      if (!Array.isArray(addresses) || addresses.length === 0 || !addresses.every((address) => typeof address === 'string' && net.isIP(address) === 4)) throw new Error('Invalid saved gateway addresses.');
      return [hostname, addresses];
    });
    return new Map(entries);
  } catch { return new Map(Object.entries(fallbackUpstreams)); }
}

async function restartAsAdministrator(addresses) {
  const encoded = Buffer.from(JSON.stringify(addresses)).toString('base64url');
  const quotedArguments = [...process.argv.slice(1), `${upstreamArgument}${encoded}`].map((argument) => `'${argument.replace(/'/g, "''")}'`).join(', ');
  const command = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -ArgumentList ${quotedArguments || "''"} -Verb RunAs -WindowStyle Hidden`;
  await run('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
}

async function startGatewayBridge(hostname, address) {
  const server = net.createServer((gameSocket) => {
    const proxySocket = net.connect(proxyPort, '127.0.0.1', () => {
      proxySocket.write(`CONNECT ${hostname}:443 HTTP/1.1\r\nHost: ${hostname}:443\r\n\r\n`);
    });
    let opening = true;
    let header = Buffer.alloc(0);
    const onProxyData = (chunk) => {
      if (!opening) return gameSocket.write(chunk);
      header = Buffer.concat([header, chunk]);
      if (header.length > 8 * 1024) return closeBoth();
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
  await new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(443, address);
  });
  server.on('error', (error) => console.error(`Gateway bridge for ${hostname} stopped: ${error.message}`));
  return server;
}

async function installCertificate(certificatePath) {
  await run('certutil.exe', ['-user', '-addstore', '-f', 'Root', certificatePath], { windowsHide: true });
}

async function certificateThumbprint(certificatePath) {
  const certificate = new crypto.X509Certificate(await fs.readFile(certificatePath));
  return crypto.createHash('sha1').update(certificate.raw).digest('hex').toUpperCase();
}

async function removeCertificate(thumbprint) {
  await run('certutil.exe', ['-user', '-delstore', 'Root', thumbprint], { windowsHide: true });
}

async function removeCertificateDirectory(certificatePath) {
  try {
    await removeCertificate(await certificateThumbprint(certificatePath));
    await fs.rm(path.dirname(certificatePath), { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
}

async function cleanup() {
  if (process.platform !== 'win32') return;
  const certificatePath = path.join(dataDirectory(), 'certificates', 'certs', 'ca.pem');
  const failures = [];
  try { await removeEntries(); await run('ipconfig.exe', ['/flushdns'], { windowsHide: true }); }
  catch (error) { failures.push(error); }
  try { await removeCertificateDirectory(certificatePath); }
  catch (error) { failures.push(error); }
  if (failures.length > 0) throw failures[0];
}

function retainBodyChunk(bodies, sizes, context, chunk) {
  const size = (sizes.get(context) ?? 0) + chunk.length;
  sizes.set(context, size);
  if (size <= maximumInterceptedBodyBytes) bodies.get(context).push(chunk);
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
  const certificatePath = path.join(certificateDirectory, 'certs', 'ca.pem');
  /* A crash cannot run normal shutdown. On the next launch, remove any CA left
     by that interrupted session before creating a fresh, short-lived one. */
  await removeCertificateDirectory(certificatePath);
  const profileStore = new ProfileStore();
  let lastError = null;
  let running = true;
  const api = createApi({
    allowedOrigins: allowedOrigins(), port: helperPort, profileStore,
    status: () => ({ running, ...profileStore.status(), lastError }),
  });
  const proxy = new Proxy();
  let hostsInstalled = false;
  const requestBodies = new WeakMap();
  const responseBodies = new WeakMap();
  const requestBodySizes = new WeakMap();
  const responseBodySizes = new WeakMap();
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
    profileStore.markActivity();
    context.use(Proxy.gunzip);
    requestBodies.set(context, []); responseBodies.set(context, []);
    requestBodySizes.set(context, 0); responseBodySizes.set(context, 0);
    context.onRequestData((requestContext, chunk, next) => { retainBodyChunk(requestBodies, requestBodySizes, requestContext, chunk); next(null, chunk); });
    context.onResponseData((responseContext, chunk, next) => { retainBodyChunk(responseBodies, responseBodySizes, responseContext, chunk); next(null, chunk); });
    context.onResponseEnd((responseContext, next) => {
      try {
        if ((requestBodySizes.get(responseContext) ?? 0) > maximumInterceptedBodyBytes || (responseBodySizes.get(responseContext) ?? 0) > maximumInterceptedBodyBytes) throw new Error('The game response was too large to import safely.');
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
  let certificateThumbprintValue = null;
  let certificateInstalled = false;
  try {
    /* Hosts changes are the only administrative operation. Do it before
     * opening ports or trusting a certificate, so declining the Windows prompt
     * leaves no half-running helper behind. */
    await writeEntries();
    hostsInstalled = true;
    await run('ipconfig.exe', ['/flushdns'], { windowsHide: true });
    await new Promise((resolve, reject) => proxy.listen({ host: '127.0.0.1', port: proxyPort, sslCaDir: certificateDirectory, httpsAgent: upstreamAgent }, (error) => error ? reject(error) : resolve()));
    certificateThumbprintValue = await certificateThumbprint(certificatePath);
    await installCertificate(certificatePath);
    certificateInstalled = true;
    for (const [hostname, address] of Object.entries(gatewayHosts)) bridges.push(await startGatewayBridge(hostname, address));
  } catch (error) {
    api.close();
    for (const bridge of bridges) bridge.close();
    try { proxy.close(); } catch { /* The proxy can fail before it owns a server. */ }
    if (certificateInstalled && certificateThumbprintValue) {
      try { await removeCertificate(certificateThumbprintValue); await fs.rm(certificateDirectory, { recursive: true, force: true }); } catch { /* The startup error is the useful one. */ }
    }
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
    if (certificateInstalled && certificateThumbprintValue) {
      try { await removeCertificate(certificateThumbprintValue); await fs.rm(certificateDirectory, { recursive: true, force: true }); } catch (error) { console.error(`Could not remove the temporary JASWA certificate: ${error.message}`); }
    }
  };
  process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
  return {
    profile: () => profileStore.read(),
    status: () => ({ running, ...profileStore.status(), lastError }),
    stop,
  };
}

async function reportStartupError(error) {
  const message = `JASWA Helper could not start: ${error instanceof Error ? error.stack || error.message : String(error)}`;
  console.error(message);
  await recordDiagnostic('startup failure', message);
}

if (require.main === module) start().catch((error) => void reportStartupError(error).finally(() => process.exit(1)));

module.exports = { certificateThumbprint, cleanup, maximumInterceptedBodyBytes, removeCertificateDirectory, reportStartupError, resolveGatewayAddresses, start, startupAddresses };
