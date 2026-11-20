import type { ImportedGame, Preferences } from '../domain/model';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import { isPreferencesDocument, readPreferences } from '../ingest/preferences';
import { PreferenceConflict, SharingUnavailable, choiceObject, mergePreferenceChoices, sameChoice, withoutPreferenceTime } from './preference-sharing';
import type { WorkspaceStore } from './workspace-store';

export type SharedPreferenceCopy = { token: string; preferences: Record<string, unknown> };
export type PreferenceCheckpoint = { local: Preferences; shared: Record<string, unknown> };
/** `unavailable`: no helper to share with. `local`: a helper answered, but the copies could not be joined. */
export type SharingStatus = { state: 'checking' | 'unavailable' | 'local' | 'shared' | 'conflict' | 'reader'; message: string };
export type PreferenceSharingPort = {
  read(): Promise<SharedPreferenceCopy | null>;
  /** `null` means another page committed first; reread before attempting a merge. */
  write(expectedToken: string | null, preferences: Record<string, unknown>): Promise<SharedPreferenceCopy | null>;
  checkpoint(): Promise<unknown>;
  save(preferences: Preferences, checkpoint: PreferenceCheckpoint): Promise<void>;
};

/** Only the origin's writer exchanges choices; account data never enters this port. */
export function createPreferenceSharing(store: WorkspaceStore, port: PreferenceSharingPort) {
  let status: SharingStatus = { state: 'checking', message: 'Checking shared personalization…' };
  const listeners = new Set<() => void>();
  let busy = false;
  let idle: Promise<void> = Promise.resolve();
  function report(next: SharingStatus) {
    if (sameChoice(status, next)) return;
    status = next;
    listeners.forEach((listener) => listener());
  }
  function checkpoint(value: unknown): PreferenceCheckpoint | null {
    if (value === null) return null;
    if (!choiceObject(value) || !isPreferencesDocument(value.local) || !isPreferencesDocument(value.shared)) {
      throw new Error('The sharing checkpoint could not be read. Your local and shared choices were left unchanged.');
    }
    return value as PreferenceCheckpoint;
  }
  function merge(local: Preferences, game: ImportedGame | null, base: PreferenceCheckpoint | null,
    remote: SharedPreferenceCopy | null, resolution?: 'local' | 'shared'): Record<string, unknown> {
    if (!remote) {
      if (base && resolution !== 'local') throw new Error('The helper’s saved personalization is missing. Choose Use this copy to restore it.');
      return { ...local };
    }
    if (resolution === 'shared') return remote.preferences;
    if (resolution === 'local') return { ...remote.preferences, ...local };
    if (base) return mergePreferenceChoices(base.local, local, base.shared, remote.preferences) as Record<string, unknown>;
    const remoteRead = readPreferences(remote.preferences, game);
    if (sameChoice(withoutPreferenceTime({ ...local }), withoutPreferenceTime({ ...remoteRead }))
      || sameChoice(withoutPreferenceTime({ ...local }), withoutPreferenceTime({ ...blankPreferences() }))) return remote.preferences;
    throw new PreferenceConflict();
  }

  async function synchronize(resolution?: 'local' | 'shared') {
    if (busy) {
      if (resolution) { await idle; return synchronize(resolution); }
      return;
    }
    const state = store.getSnapshot();
    if (!state.ready || state.writer === null) return;
    if (state.writer !== 'writer') {
      report({ state: 'reader', message: 'The writer tab shares personalization through JASWA Helper.' });
      return;
    }
    busy = true;
    let finish!: () => void;
    idle = new Promise<void>((resolve) => { finish = resolve; });
    try {
      // An unavailable helper must not hold up ordinary preference clicks.
      const [firstRemote, storedBase] = await Promise.all([port.read(), port.checkpoint()]);
      const base = checkpoint(storedBase);
      await store.synchronizePreferences(async (local, game) => {
        let remote = firstRemote;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const merged = merge(local, game, base, remote, resolution);
          const needsWrite = !remote || !sameChoice(withoutPreferenceTime(merged), withoutPreferenceTime(remote.preferences));
          let shared = remote;
          if (needsWrite) {
            shared = await port.write(remote?.token ?? null, { ...merged, updatedAt: new Date().toISOString() });
            if (!shared) { remote = await port.read(); continue; }
          }
          if (!shared) throw new Error('The helper returned no shared personalization.');
          const preferences = readPreferences(shared.preferences, game);
          const nextCheckpoint = { local: preferences, shared: shared.preferences };
          if (sameChoice(base, nextCheckpoint) && sameChoice(local, preferences)) return null;
          return { preferences, save: () => port.save(preferences, nextCheckpoint) };
        }
        throw new Error('Shared personalization kept changing. JASWA will try again.');
      });
      report({ state: 'shared', message: 'Personalization is shared with localhost and jaswa.net through JASWA Helper.' });
    } catch (error) {
      report(error instanceof PreferenceConflict
        ? { state: 'conflict', message: error.message }
        : error instanceof SharingUnavailable ? { state: 'unavailable', message: error.message }
        : { state: 'local', message: error instanceof Error ? error.message : 'Sharing is unavailable. Your choices remain saved in this browser.' });
    } finally { busy = false; finish(); }
  }
  return {
    synchronize,
    getSnapshot: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type PreferenceSharing = ReturnType<typeof createPreferenceSharing>;
