import { isPreferencesDocument } from '../ingest/preferences';
import { choiceObject } from '../workspace/preference-sharing';
import type { PreferenceSharingPort, SharedPreferenceCopy } from '../workspace/shared-preferences';
import { readWorkspaceValue, savePreferences } from './browser-storage';

function readCopy(value: unknown): SharedPreferenceCopy {
  if (!choiceObject(value) || typeof value.token !== 'string' || !value.token || !choiceObject(value.preferences) || !isPreferencesDocument(value.preferences)) {
    throw new Error('The helper returned unreadable personalization. The saved copies were left unchanged.');
  }
  return { token: value.token, preferences: value.preferences };
}

async function request(method: 'GET' | 'PUT', body?: unknown): Promise<Response> {
  try {
    return await fetch('http://127.0.0.1:37654/preferences', {
      method, cache: 'no-store', signal: AbortSignal.timeout(3_000),
      ...(method === 'PUT' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Sharing is unavailable. Start JASWA Helper; your choices remain saved in this browser.');
  }
}

async function responseCopy(response: Response): Promise<SharedPreferenceCopy | null> {
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) throw new Error('Update JASWA Helper to share personalization. Your choices remain saved in this browser.');
    throw new Error('The helper could not read or save shared personalization. Your browser’s copy was kept; JASWA will try again.');
  }
  const value: unknown = await response.json();
  return value === null ? null : readCopy(value);
}

export const helperPreferenceSharing: PreferenceSharingPort = {
  read: async () => responseCopy(await request('GET')),
  write: async (expectedToken, preferences) => {
    const response = await request('PUT', { expectedToken, preferences });
    if (response.status === 409) return null;
    const copy = await responseCopy(response);
    if (!copy) throw new Error('The helper did not confirm the personalization save.');
    return copy;
  },
  checkpoint: () => readWorkspaceValue('shared-preference-checkpoint'),
  save: (preferences, checkpoint) => savePreferences(preferences, undefined, checkpoint),
};
