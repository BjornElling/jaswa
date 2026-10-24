import { validateGameFile } from './file-imports';
import { helperUpdateAvailable, isHelperVersion } from './helper-version';

const helperOrigin = 'http://127.0.0.1:37654';

export type HelperConnection = {
  state: 'checking' | 'ready' | 'unavailable';
  detail: string;
  version: string | null;
  updateAvailable: boolean;
  profileReady: boolean;
  restartRequired: boolean;
  gameStartedBeforeHelper: boolean;
  gameLoginPending: boolean;
  instanceId: string;
  revision: number;
  sessionId: number;
};

/** Keep socket evidence in diagnostics; the Home card needs a next step. */
export function helperStatusMessage(connection: HelperConnection): string {
  if (connection.state !== 'unavailable') return connection.detail;
  if (connection.detail.startsWith('Helper is not running.')) return 'Helper is not running. Open it and try again.';
  if (connection.detail.startsWith('Gateway exchange failed:')) return 'Connection to the game was interrupted. Restart the helper, then reopen the game.';
  return 'The helper could not load game data. Save an error report in the helper, then restart it and the game.';
}

export type HelperProfile = {
  updatedAt: string;
  instanceId: string;
  revision: number;
  sessionId: number;
  source: 'game-start' | 'live';
  data: Record<string, unknown>;
};

async function localFetch(path: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${helperOrigin}${path}`, { cache: 'no-store', signal: controller.signal });
    const body = await response.text();
    return { ok: response.ok, status: response.status, json: () => JSON.parse(body) as unknown };
  }
  finally { window.clearTimeout(timeout); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function checkHelperConnection(): Promise<HelperConnection> {
  try {
    const response = await localFetch('/health');
    if (!response.ok) return { state: 'unavailable', detail: `The helper goblin answered, but only in grunts (HTTP ${response.status}). Open the helper and save an error report.`, version: null, updateAvailable: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0 };
    const value = await response.json() as unknown;
    if (!isRecord(value) || value.running !== true || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 0 || typeof value.restartRequired !== 'boolean' || typeof value.gameStartedBeforeHelper !== 'boolean' || typeof value.gameLoginPending !== 'boolean' || (value.version !== undefined && !isHelperVersion(value.version))) return { state: 'unavailable', detail: 'The helper goblin said something, but not in any known language. Open the helper and save an error report.', version: null, updateAvailable: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0 };
    /* Helpers from before version reporting can still be useful, but they are
       precisely the ones JASWA must flag: a missing version is an unknown
       compatibility risk, not proof that the helper is current. */
    const version = typeof value.version === 'string' ? value.version : null;
    const updateAvailable = helperUpdateAvailable(version);
    /* Returned, not thrown: the catch below is for a helper that could not be
       reached at all, and its "helper is not running" reading is wrong for a
       helper that answered with a status JASWA cannot read. */
    if (typeof value.profileReady !== 'boolean' || (value.lastError !== null && typeof value.lastError !== 'string')) return { state: 'unavailable', detail: 'The helper goblin said something, but not in any known language. Open the helper and save an error report.', version, updateAvailable, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0 };
    if (typeof value.lastError === 'string' && value.lastError) return { state: 'unavailable', detail: value.lastError, version, updateAvailable, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId };
    return value.profileReady === true
      ? { state: 'ready', detail: 'Mindflayer is active and successfully sucking your brain.', version, updateAvailable, profileReady: true, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
      : value.gameStartedBeforeHelper
        ? { state: 'checking', detail: 'Summoners War was already running when the helper started, so it missed the account login. Quit the game and open it again — the next launch is captured normally.', version, updateAvailable, profileReady: false, restartRequired: true, gameStartedBeforeHelper: true, gameLoginPending: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
        : value.gameLoginPending
          ? { state: 'checking', detail: 'The helper has seen a Summoners War connection but no account login yet. It keeps waiting; if you are already in-game and this remains, save an error report.', version, updateAvailable, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: true, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
          : { state: 'checking', detail: 'Helper goblin is awake and waiting in ambush for you to run Summoners War.', version, updateAvailable, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId };
  } catch (error) {
    /* The raw reason still has to reach the user — it is what an error report is
       made of — but as a parenthetical, not as the whole sentence. A bare
       "TypeError: Failed to fetch" tells nobody that the fix is to start the
       helper. */
    const reason = error instanceof Error ? error.message : String(error);
    return { state: 'unavailable', detail: `Helper is not running. We wants it, we needs it. Must have the precious! (${reason})`, version: null, updateAvailable: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0 };
  }
}

/**
 * A snapshot the helper served, or why it could not be used.
 *
 * The rejection carries its reason rather than collapsing to `null`, because
 * the two failures need opposite treatment: an envelope JASWA cannot parse is a
 * helper contract failure to report, while an account JASWA cannot read is the one
 * the user must be told about — the same sentence the file route shows. Silently
 * returning `null` for both is what let a single unreadable artifact stop direct
 * import with the dashboard still reading "Connected".
 */
export type HelperProfileResult =
  | { state: 'ready'; profile: HelperProfile }
  | { state: 'unreadable'; reason: string; identity: HelperSessionIdentity; data: Record<string, unknown> }
  | { state: 'unavailable'; reason: string; evidence?: unknown };

/** Which snapshot a rejection belongs to, so it is reported once and not every poll. */
export type HelperSessionIdentity = { instanceId: string; sessionId: number; revision: number };

/**
 * Classifies one `/profile` answer. Split from the request so the decision that
 * failed silently — an account JASWA cannot read, told apart from a helper with
 * nothing to serve — is testable without a socket on the helper's fixed port.
 */
export function classifyHelperProfile(value: unknown): HelperProfileResult {
  if (!isRecord(value) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 1 || (value.source !== 'game-start' && value.source !== 'live') || !isRecord(value.data)) return { state: 'unavailable', reason: 'The helper returned an invalid snapshot envelope. Use Report Issue to send the details.', evidence: value };
  const report = validateGameFile(value.data);
  return report.valid
    ? { state: 'ready', profile: { updatedAt: value.updatedAt, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId, source: value.source, data: value.data } }
    : { state: 'unreadable', reason: report.message, data: value.data, identity: { instanceId: value.instanceId, sessionId: value.sessionId, revision: value.revision } };
}

export async function readHelperProfile(): Promise<HelperProfileResult> {
  try {
    const response = await localFetch('/profile');
    if (!response.ok) return { state: 'unavailable', reason: `The helper could not serve its snapshot (HTTP ${response.status}). Open the helper and save an error report.` };
    return classifyHelperProfile(await response.json() as unknown);
  } catch (error) { return { state: 'unavailable', reason: `JASWA could not read the helper snapshot: ${error instanceof Error ? error.message : String(error)}. Open the helper and save an error report.` }; }
}
