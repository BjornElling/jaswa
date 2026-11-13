import { validateGameFile } from '../ingest/game-export';
import { helperUpdateAvailable, isHelperVersion, recommendedHelperVersion } from '../domain/shared/helper-version';

const helperOrigin = 'http://127.0.0.1:37654';

export type HelperConnection = {
  state: 'checking' | 'ready' | 'unavailable';
  detail: string;
  /** Only the helper’s own red capture state raises a capture-failure notice. */
  captureError: string | null;
  version: string | null;
  updateAvailable: boolean;
  /** The helper's own answer to whether Summoners War is running; `false` until a helper says otherwise. */
  gameRunning: boolean;
  profileReady: boolean;
  restartRequired: boolean;
  gameStartedBeforeHelper: boolean;
  gameLoginPending: boolean;
  instanceId: string;
  revision: number;
  sessionId: number;
  /** Account changes the helper could not read since the game's login, each command and cause once. */
  missedChanges: HelperMiss[];
};

/**
 * Why the helper missed a change. `encrypted` is proven, not supposed: the
 * answer carried the game's per-session-key marker, which passive reading can
 * never open (docs/LIVE-IMPORT-COVERAGE.md). `unread` is everything else — a
 * reader JASWA has yet to write.
 */
export type HelperMiss = { command: string; cause: 'encrypted' | 'unread' };

/* The Rift Raid result is the one encrypted answer seen so far, and the user
   knows it as rewards, not as a command name. */
const raidResultCommand = 'BattleRiftOfWorldsRaidResult';

/* The helper's own list, one entry per miss; a command named once is enough
   to know which part of the game to go and model. `null` when the list is not
   the shape the helper sends. */
function readMissedChanges(value: unknown): HelperMiss[] | null {
  if (!Array.isArray(value)) return null;
  const misses: HelperMiss[] = [];
  for (const miss of value) {
    if (!isRecord(miss) || typeof miss.command !== 'string' || typeof miss.reason !== 'string'
      || (miss.cause !== 'encrypted' && miss.cause !== 'unread')) return null;
    const cause = miss.cause;
    if (!misses.some((seen) => seen.command === miss.command && seen.cause === cause)) misses.push({ command: miss.command, cause });
  }
  return misses;
}

/** Three named, the rest counted. */
function nameSome(names: readonly string[]): string {
  return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

/**
 * The gap notice's two lines. An unread command is JASWA's to fix and an
 * encrypted one the game's limit, and each sentence names only its own kind:
 * one sentence explaining the other's commands read as if a sale of summoning
 * pieces were a Rift Raid reward.
 */
export function missedChangesNotice(misses: readonly HelperMiss[]): { gap: string; next: string } | null {
  if (!misses.length) return null;
  const unread = [...new Set(misses.filter((miss) => miss.cause === 'unread').map((miss) => miss.command))];
  const sealed = [...new Set(misses.filter((miss) => miss.cause === 'encrypted').map((miss) => miss.command))];
  const sealedNames = nameSome(sealed.map((command) => command === raidResultCommand ? 'Rift Raid rewards' : `${command} answers`));
  if (!unread.length) {
    return { gap: `${sealedNames} are encrypted on purpose by the game’s developer — a deliberate limit no JASWA update can get around.`,
      next: 'Everything else keeps arriving. Restart Summoners War after your runs to load them.' };
  }
  const read = `The helper cannot read ${nameSome(unread)} yet — a JASWA update can fix that.`;
  return { gap: sealed.length ? `${read} ${sealedNames} were missed too: the game’s developer encrypts them on purpose.` : read,
    next: 'Everything else keeps arriving. Restart Summoners War for a complete import.' };
}

/* The opening words of the one refusal an update cures, so the Home card and
   the corner notice can tell it from a helper that is broken. */
const outdatedHelper = 'This helper is older than JASWA';

/** Keep socket evidence in diagnostics; the Home card needs a next step. */
export function helperStatusMessage(connection: HelperConnection): string {
  if (connection.state !== 'unavailable') return connection.detail;
  if (connection.detail.startsWith('Helper is not running.')) return 'Helper is not running. Open it and try again.';
  if (connection.detail.startsWith(outdatedHelper)) return 'This helper is older than JASWA. Update it, then start it again.';
  if (connection.detail.startsWith('Gateway exchange failed:')) return 'Connection to the game was interrupted. Try Restart helper. Check its status for any missing game data.';
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

/** No helper heard from yet: every fact unknown, so every fact off. */
export const silentHelper: HelperConnection = { state: 'checking', captureError: null, detail: 'Run the helper. Then roll for initiative.', version: null, updateAvailable: false, gameRunning: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0, missedChanges: [] };

export async function checkHelperConnection(): Promise<HelperConnection> {
  try {
    /* The poll carries the helper this build ships, which is how the helper's
       own window learns an update exists without a request of its own. */
    const response = await localFetch(`/health?latest=${recommendedHelperVersion}`);
    if (!response.ok) return { ...silentHelper, state: 'unavailable', detail: `The helper goblin answered, but only in grunts (HTTP ${response.status}). Open the helper and save an error report.` };
    const value = await response.json() as unknown;
    const reportedVersion = isRecord(value) && value.running === true && isHelperVersion(value.version) ? value.version : null;
    const knownUpdate = reportedVersion !== null && helperUpdateAvailable(reportedVersion);
    /* Returned, not thrown: the catch below is for a helper that could not be
       reached at all, and its "helper is not running" reading is wrong for a
       helper that answered with a status JASWA cannot read. An older helper
       is the usual reason, and then the cure is the update rather than an
       error report — the status that stood beside a gap on November 3 said
       "restart it and the game", which no restart could mend. */
    const unreadable = (version: string | null, updateAvailable: boolean): HelperConnection => ({ ...silentHelper, state: 'unavailable', version, updateAvailable,
      detail: updateAvailable && version !== null
        ? `${outdatedHelper} and speaks an older dialect. Update it from the corner card, then start it again.`
        : 'The helper goblin said something, but not in any known language. Open the helper and save an error report.' });
    if (!isRecord(value) || value.running !== true || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 0 || typeof value.restartRequired !== 'boolean' || typeof value.gameStartedBeforeHelper !== 'boolean' || typeof value.gameLoginPending !== 'boolean' || typeof value.gameRunning !== 'boolean' || (value.version !== undefined && !isHelperVersion(value.version))) return unreadable(reportedVersion, knownUpdate);
    /* Helpers from before version reporting can still be useful, but they are
       precisely the ones JASWA must flag: a missing version is an unknown
       compatibility risk, not proof that the helper is current. */
    const version = typeof value.version === 'string' ? value.version : null;
    const updateAvailable = helperUpdateAvailable(version);
    const missedChanges = readMissedChanges(value.missedChanges);
    if (typeof value.profileReady !== 'boolean' || (value.lastError !== null && typeof value.lastError !== 'string') || missedChanges === null) return unreadable(version, updateAvailable);
    /* Whether the game runs is the helper's to say (helper/src-tauri/src/game_session.rs):
       when it closes, the helper ends the snapshot, its gaps and its errors
       together, and every notice here reads them off this one answer. */
    const session = { version, updateAvailable, gameRunning: value.gameRunning, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId, missedChanges };
    if (typeof value.lastError === 'string' && value.lastError) return { ...silentHelper, ...session, state: 'unavailable', captureError: value.lastError, detail: value.lastError };
    if (value.profileReady === true) return { ...silentHelper, ...session, state: 'ready', profileReady: true, detail: 'Mindflayer is active and successfully sucking your brain.' };
    if (value.gameStartedBeforeHelper) return { ...silentHelper, ...session, restartRequired: true, gameStartedBeforeHelper: true, detail: 'Summoners War was already running when the helper started, so it missed the account login. Quit the game and open it again — the next launch is captured normally.' };
    if (value.gameLoginPending) return { ...silentHelper, ...session, gameLoginPending: true, detail: 'The helper has seen a Summoners War connection but no account login yet. It keeps waiting; if you are already in-game and this remains, save an error report.' };
    return { ...silentHelper, ...session, detail: value.gameRunning
      ? 'Summoners War is running. The helper goblin waits for the login that carries your account.'
      : 'Helper goblin is awake and waiting in ambush for you to run Summoners War.' };
  } catch (error) {
    /* The raw reason still has to reach the user — it is what an error report is
       made of — but as a parenthetical, not as the whole sentence. A bare
       "TypeError: Failed to fetch" tells nobody that the fix is to start the
       helper. */
    const reason = error instanceof Error ? error.message : String(error);
    return { ...silentHelper, state: 'unavailable', detail: `Helper is not running. We wants it, we needs it. Must have the precious! (${reason})` };
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
