import { validateGameFile } from './file-imports';

const helperOrigin = 'http://127.0.0.1:37654';

export type HelperConnection = {
  state: 'checking' | 'ready' | 'unavailable';
  detail: string;
  profileReady: boolean;
};

export type HelperProfile = {
  updatedAt: string;
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
    if (!response.ok) return { state: 'unavailable', detail: 'The helper did not answer.', profileReady: false };
    const value = await response.json() as unknown;
    if (!isRecord(value) || value.running !== true) return { state: 'unavailable', detail: 'The helper is not ready.', profileReady: false };
    return value.profileReady === true
      ? { state: 'ready', detail: 'Link is stable, Captain. We’re ready to go to warp.', profileReady: true }
      : { state: 'checking', detail: 'Runner is doint just fine. Are you going to start the game soon?', profileReady: false };
  } catch {
    return { state: 'unavailable', detail: 'This would work better, if you actually ran the helper program.', profileReady: false };
  }
}

export async function readHelperProfile(): Promise<HelperProfile | null> {
  try {
    const response = await localFetch('/profile');
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    if (!isRecord(value) || typeof value.updatedAt !== 'string' || (value.source !== 'game-start' && value.source !== 'live') || !isRecord(value.data)) return null;
    const report = validateGameFile(value.data);
    return report.valid ? { updatedAt: value.updatedAt, source: value.source, data: value.data } : null;
  } catch { return null; }
}
