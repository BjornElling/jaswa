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
      ? { state: 'ready', detail: 'Link is stable, Captain. We’re ready to go to warp.', profileReady: true, restartRequired: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
      : value.restartRequired
        ? { state: 'checking', detail: 'Helper was late to the party. Restart Summoners War and then all will be fine.', profileReady: false, restartRequired: true, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId }
        : { state: 'checking', detail: 'Helper goblin is awake and waiting for you to run Summoners War.', profileReady: false, restartRequired: false, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId };
  } catch {
    return { state: 'unavailable', detail: 'Run the helper. Then roll for initiative.', profileReady: false, restartRequired: false, instanceId: '', revision: 0, sessionId: 0 };
  }
}

export async function readHelperProfile(): Promise<HelperProfile | null> {
  try {
    const response = await localFetch('/profile');
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    if (!isRecord(value) || typeof value.updatedAt !== 'string' || typeof value.instanceId !== 'string' || value.instanceId.length === 0 || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.sessionId !== 'number' || !Number.isSafeInteger(value.sessionId) || value.sessionId < 1 || (value.source !== 'game-start' && value.source !== 'live') || !isRecord(value.data)) return null;
    const report = validateGameFile(value.data);
    return report.valid ? { updatedAt: value.updatedAt, instanceId: value.instanceId, revision: value.revision, sessionId: value.sessionId, source: value.source, data: value.data } : null;
  } catch { return null; }
}
