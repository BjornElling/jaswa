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
const { createApi, listenApi, PortUnavailableError } = require('./api.cjs');
const { allowedOrigins, dataDirectory, gatewayHosts, helperPort, proxyPort } = require('./config.cjs');
const { recordDiagnostic } = require('./diagnostics.cjs');
const { removeEntries, writeEntries } = require('./hosts.cjs');
const { isSummonersWarRunning } = require('./game-process.cjs');
const { ProfileStore } = require('./profile-store.cjs');
const { decodeRequest, decodeResponse } = require('./protocol.cjs');
const { TrafficLog } = require('./traffic-log.cjs');

const run = promisify(execFile);
const gatewayPath = '/api/gateway_c2.php';
const upstreamArgument = '--jaswa-upstream-map=';
const maximumInterceptedBodyBytes = 16 * 1024 * 1024;
const gameProcessPollIntervalMs = 2_000;
const fallbackUpstreams = Object.freeze({
  'summonerswar-eu-lb.qpyou.cn': ['34.160.156.240'],
  'summonerswar-gb-lb.qpyou.cn': ['34.160.216.76'],
  'summonerswar-sea-lb.qpyou.cn': ['34.160.209.2'],
  'summonerswar-jp-lb.qpyou.cn': ['34.160.238.133'],
  'summonerswar-kr-lb.qpyou.cn': ['34.160.106.3'],
  'summonerswar-cn-lb.qpyou.cn': ['34.111.217.241'],
});

class CertificateInstallationDeclinedError extends Error {
  constructor() {
    super('The JASWA Helper certificate was not installed.');
    this.name = 'CertificateInstallationDeclinedError';
  }
}

class CertificateInstallationError extends Error {
  constructor(cause) {
    super(`Windows could not install the JASWA Helper certificate: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CertificateInstallationError';
    this.cause = cause;
  }
}

class GatewayPortError extends Error {
  constructor(hostname, cause) {
    super(`Another program is using port 443 on this computer, so JASWA Helper could not open its local link for ${hostname}. Close web-server software such as IIS or Docker Desktop and start JASWA Helper again.`);
    this.name = 'GatewayPortError';
    this.cause = cause;
  }
}

class AdministratorPermissionError extends Error {
  constructor(cause) {
    super(`Windows did not grant JASWA Helper administrator permission: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'AdministratorPermissionError';
    this.cause = cause;
  }
}

function restartRequired(snapshot, gameRunning, waitingForFreshStart) {
  return gameRunning && waitingForFreshStart && !snapshot.hasProfile;
}

function startsWithActiveGame(observedGameProcess, gameRunning, snapshot) {
  return !observedGameProcess && gameRunning && !snapshot.hasProfile;
}

async function isAdministrator() {
  try { await run('net.exe', ['session'], { windowsHide: true }); return true; } catch { return false; }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveGatewayAddresses({ attempts = 3, pause = wait, record = recordDiagnostic, resolve4 = dns.promises.resolve4 } = {}) {
  const entries = await Promise.all(Object.keys(gatewayHosts).map(async (hostname) => {
    let failure;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const addresses = (await resolve4(hostname)).filter((address) => net.isIP(address) === 4);
        if (addresses.length > 0) return [hostname, addresses];
        throw new Error('DNS returned no IPv4 address.');
      } catch (error) {
        failure = error;
        if (attempt < attempts) await pause(500);
      }
    }
    const fallback = fallbackUpstreams[hostname];
    if (fallback) {
      await record('startup DNS fallback', `${hostname}: ${failure instanceof Error ? failure.message : String(failure)} after ${attempts} attempts`);
      return [hostname, fallback];
    }
    throw failure;
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
    const onError = (error) => {
      server.off('listening', onListening);
      /* Something already owns port 443 on this loopback address — IIS, Docker
         or another proxy binding every interface. Say so plainly, because the
         raw errno tells the player nothing about what to close. */
      reject(error?.code === 'EADDRINUSE' || error?.code === 'EACCES'
        ? new GatewayPortError(hostname, error)
        : error);
    };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(443, address);
  });
  server.on('error', (error) => console.error(`Gateway bridge for ${hostname} stopped: ${error.message}`));
  return server;
}

/* The helper always runs elevated, so "-user" would trust the CA for whichever
   account answered the UAC prompt — not necessarily the one playing the game.
   The machine store is the only one that reliably covers the real player. */
async function installCertificate(certificatePath) {
  await run('certutil.exe', ['-addstore', '-f', 'Root', certificatePath], { windowsHide: true });
}

async function certificateThumbprint(certificatePath) {
  const certificate = new crypto.X509Certificate(await fs.readFile(certificatePath));
  return crypto.createHash('sha1').update(certificate.raw).digest('hex').toUpperCase();
}

/* Earlier builds trusted the CA per user. Clear both stores so upgrading and
   then uninstalling never strands a trusted certificate on the machine. */
async function removeCertificate(thumbprint) {
  const failures = [];
  for (const scope of [[], ['-user']]) {
    try { await run('certutil.exe', [...scope, '-silent', '-delstore', 'Root', thumbprint], { windowsHide: true }); }
    catch (error) { failures.push(error); }
  }
  if (failures.length === 2) throw failures[0];
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

/* Antivirus and other scanners take brief exclusive locks on the hosts file.
   A single failed attempt would leave the game pointed at loopback, so retry
   before reporting, and always record what happened. */
async function releaseHostEntries({ attempts = 4, pause = wait, record = recordDiagnostic, removeHostEntries = removeEntries, execute = run } = {}) {
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await removeHostEntries();
      try { await execute('ipconfig.exe', ['/flushdns'], { windowsHide: true }); }
      catch { /* Stale DNS resolves to the entries that are already gone. */ }
      return true;
    } catch (error) {
      failure = error;
      if (attempt < attempts) await pause(400);
    }
  }
  await record('hosts cleanup failure', failure);
  return false;
}

async function cleanup({ removeCertificate: shouldRemoveCertificate = false, platform = process.platform, certificatePath = path.join(dataDirectory(), 'certificates', 'certs', 'ca.pem'), removeHostEntries = removeEntries, execute = run, pause = wait, record = recordDiagnostic, removeCertificateAt = removeCertificateDirectory } = {}) {
  if (platform !== 'win32') return;
  const failures = [];
  /* Uninstalling is the last chance to remove the block. Retry through a
     transient lock rather than leaving the game unable to reach its servers. */
  try {
    if (!await releaseHostEntries({ removeHostEntries, execute, pause, record })) throw new Error('The temporary gateway rules could not be removed from the hosts file.');
  } catch (error) { failures.push(error); }
  if (shouldRemoveCertificate) {
    try { await removeCertificateAt(certificatePath); }
    catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw failures[0];
}

function retainBodyChunk(bodies, sizes, context, chunk) {
  const size = (sizes.get(context) ?? 0) + chunk.length;
  sizes.set(context, size);
  if (size <= maximumInterceptedBodyBytes) bodies.get(context).push(chunk);
}

async function start({ confirmCertificateInstallation = async () => true } = {}) {
  if (process.platform !== 'win32') throw new Error('JASWA Helper only works with Summoners War on Steam for Windows.');
  if (!await isAdministrator()) {
    try { await restartAsAdministrator(await resolveGatewayAddresses()); }
    catch (error) { throw new AdministratorPermissionError(error); }
    return { elevationRequested: true };
  }
  const directory = dataDirectory();
  await fs.mkdir(directory, { recursive: true });
  const certificateDirectory = path.join(directory, 'certificates');
  const certificatePath = path.join(certificateDirectory, 'certs', 'ca.pem');
  /* The proxy's CA is a stable local identity. Keeping its key lets a restart,
     an update, or a reinstallation reuse the same trusted certificate. */
  const certificateAlreadyExists = await fs.access(certificatePath).then(() => true).catch(() => false);
  const profileStore = new ProfileStore();
  /* Off until the user asks for it in the tray. It records what the game
     already sent to this computer, to a local file, and uploads nothing. */
  const trafficLog = new TrafficLog();
  let lastError = null;
  let gameProcessError = null;
  let running = true;
  let gameRunning = false;
  let gameCheckFailed = false;
  let observedGameProcess = false;
  let waitingForFreshStart = false;
  let gameProcessTimer = null;
  const status = () => {
    const snapshot = profileStore.status();
    return {
      running,
      ...snapshot,
      /* Network traffic is naturally bursty. A captured snapshot stays ready
       while the game process is alive; a stopped process or proxy fault is a
       real loss of the live link. */
      profileReady: snapshot.hasProfile && gameRunning && !gameCheckFailed && lastError === null && gameProcessError === null,
      restartRequired: restartRequired(snapshot, gameRunning, waitingForFreshStart),
      lastError: lastError ?? gameProcessError,
    };
  };
  const refreshGameProcess = async () => {
    try {
      const nextGameRunning = await isSummonersWarRunning();
      if (startsWithActiveGame(observedGameProcess, nextGameRunning, profileStore.status())) waitingForFreshStart = true;
      observedGameProcess = true;
      if (gameRunning && !nextGameRunning) {
        profileStore.clear();
        waitingForFreshStart = false;
      }
      gameRunning = nextGameRunning;
      gameCheckFailed = false;
      gameProcessError = null;
    } catch (error) {
      gameRunning = false;
      gameCheckFailed = true;
      gameProcessError = `Could not check whether Summoners War is running: ${error.message}`;
    }
  };
  const api = createApi({
    allowedOrigins: allowedOrigins(), port: helperPort, profileStore,
    status,
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
        /* Log before importing. A response the import cannot use is precisely
         * the one worth investigating, so it must not be lost to a throw. */
        trafficLog.record(request.command, request, response);
        if (request.command === 'HubUserLogin' || request.command === 'GuestLogin') {
          profileStore.acceptSnapshot(response);
          waitingForFreshStart = false;
        }
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
  let createdCertificate = false;
  try {
    /* Hosts changes are the only administrative operation. Do it before
     * opening ports or trusting a certificate, so declining the Windows prompt
     * leaves no half-running helper behind. */
    await writeEntries();
    hostsInstalled = true;
    await run('ipconfig.exe', ['/flushdns'], { windowsHide: true });
    await listenApi(api, helperPort);
    createdCertificate = !certificateAlreadyExists;
    await new Promise((resolve, reject) => proxy.listen({ host: '127.0.0.1', port: proxyPort, sslCaDir: certificateDirectory, httpsAgent: upstreamAgent }, (error) => error
      ? reject(error?.code === 'EADDRINUSE' || error?.code === 'EACCES' ? new PortUnavailableError(proxyPort, error) : error)
      : resolve()));
    /* Adding the same certificate to a Windows store is idempotent. This also
       restores trust if the user kept JASWA's local CA file but removed its
       matching root-store entry outside the helper. */
    if (createdCertificate && !await confirmCertificateInstallation()) throw new CertificateInstallationDeclinedError();
    try { await installCertificate(certificatePath); }
    catch (error) { throw new CertificateInstallationError(error); }
    for (const [hostname, address] of Object.entries(gatewayHosts)) bridges.push(await startGatewayBridge(hostname, address));
    await refreshGameProcess();
    gameProcessTimer = setInterval(() => void refreshGameProcess(), gameProcessPollIntervalMs);
  } catch (error) {
    api.close();
    for (const bridge of bridges) bridge.close();
    try { proxy.close(); } catch { /* The proxy can fail before it owns a server. */ }
    if (createdCertificate) {
      try { await removeCertificateDirectory(certificatePath); } catch { /* The startup error is the useful one. */ }
    }
    if (hostsInstalled) {
      try { await removeEntries(); await run('ipconfig.exe', ['/flushdns'], { windowsHide: true }); } catch { /* The original startup error is the useful one. */ }
    }
    throw error;
  }
  const stop = async () => {
    if (!running) return;
    running = false;
    if (gameProcessTimer) clearInterval(gameProcessTimer);
    /* Queued log lines are the ones written just before quitting, so they are
       the ones a user is most likely to be looking for. */
    await trafficLog.flush();
    for (const bridge of bridges) bridge.close();
    proxy.close(); api.close();
    if (hostsInstalled) {
      /* Leaving the block behind points the game's servers at loopback with no
         proxy answering, which breaks Summoners War until it is removed. An
         antivirus scanner briefly locking the hosts file is the common cause,
         so retry before giving up, and leave a record either way. */
      await releaseHostEntries();
    }
  };
  process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
  return {
    profile: () => profileStore.read(),
    status,
    stop,
    trafficLog,
  };
}

async function reportStartupError(error) {
  const message = `JASWA Helper could not start: ${error instanceof Error ? error.stack || error.message : String(error)}`;
  console.error(message);
  await recordDiagnostic('startup failure', message);
}

if (require.main === module) start().catch((error) => void reportStartupError(error).finally(() => process.exit(1)));

module.exports = { AdministratorPermissionError, CertificateInstallationDeclinedError, CertificateInstallationError, GatewayPortError, PortUnavailableError, certificateThumbprint, cleanup, gameProcessPollIntervalMs, maximumInterceptedBodyBytes, releaseHostEntries, removeCertificateDirectory, reportStartupError, restartRequired, resolveGatewayAddresses, start, startsWithActiveGame, startupAddresses };
