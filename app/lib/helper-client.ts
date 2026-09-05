import { validateGameFile } from './file-imports';

const helperOrigin = 'http://127.0.0.1:37654';

export type HelperConnection = {
  state: 'checking' | 'ready' | 'unavailable';
  detail: string;
  profileReady: boolean;
  restartRequired: boolean;
  instanceId: string;
  revision: number;
  sessionId: number;
};

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
  const timeout = window.setTimeout(() => controller.abort(), 1500);
  try { return await fetch(`${helperOrigin}${path}`, { cache: 'no-store', signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function checkHelperConnection(): Promise<HelperConnection> {
  try {
    const response = await localFetch('/health');
    if (!response.ok) return { state: 'unavailable', detail: 'The helper did not answer.', profileReady: false, restartRequired: false, instanceId: '', revision: 0, sessionId: 0 };
    const value = await response.json() as unknown;
    if (!isRecord(value) || value.running !== true || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 0 || typeof value.restartRequired !== 'boolean') return { state: 'unavailable', detail: 'The helper is not ready.', profileReady: false, restartRequired: false, instanceId: '', revision: 0, sessionId: 0 };
    return value.profileReady === true
      ? { state: 'ready', detail: 'Mindflayer is active and successfully sucking your brain.', profileReady: true, restartRequired: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
      : value.restartRequired
        ? { state: 'checking', detail: 'Helper was late to the party. Restart Summoners War and then all will be fine.', profileReady: false, restartRequired: true, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
        : { state: 'checking', detail: 'Helper goblin is awake and waiting in ambush for you to run Summoners War.', profileReady: false, restartRequired: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId };
  } catch {
    return { state: 'unavailable', detail: 'Run the helper. Then roll for initiative.', profileReady: false, restartRequired: false, instanceId: '', revision: 0, sessionId: 0 };
  }
}

/**
 * A snapshot the helper served, or why it could not be used.
 *
 * The rejection carries its reason rather than collapsing to `null`, because
 * the two failures need opposite treatment: an envelope JASWA cannot parse is a
 * transient nothing to wait out, while an account JASWA cannot read is the one
 * the user must be told about — the same sentence the file route shows. Silently
 * returning `null` for both is what let a single unreadable artifact stop direct
 * import with the dashboard still reading "Connected".
 */
export type HelperProfileResult =
  | { state: 'ready'; profile: HelperProfile }
  | { state: 'unreadable'; reason: string; identity: HelperSessionIdentity }
  | { state: 'unavailable' };

/** Which snapshot a rejection belongs to, so it is reported once and not every poll. */
export type HelperSessionIdentity = { instanceId: string; sessionId: number; revision: number };

/**
 * Classifies one `/profile` answer. Split from the request so the decision that
 * failed silently — an account JASWA cannot read, told apart from a helper with
 * nothing to serve — is testable without a socket on the helper's fixed port.
 */
export function classifyHelperProfile(value: unknown): HelperProfileResult {
  if (!isRecord(value) || typeof value.updatedAt !== 'string' || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 1 || (value.source !== 'game-start' && value.source !== 'live') || !isRecord(value.data)) return { state: 'unavailable' };
  const report = validateGameFile(value.data);
  return report.valid
    ? { state: 'ready', profile: { updatedAt: value.updatedAt, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId, source: value.source, data: value.data } }
    : { state: 'unreadable', reason: report.message, identity: { instanceId: value.instanceId, sessionId: value.sessionId, revision: value.revision } };
}

export async function readHelperProfile(): Promise<HelperProfileResult> {
  try {
    const response = await localFetch('/profile');
    if (!response.ok) return { state: 'unavailable' };
    return classifyHelperProfile(await response.json() as unknown);
  } catch { return { state: 'unavailable' }; }
}
