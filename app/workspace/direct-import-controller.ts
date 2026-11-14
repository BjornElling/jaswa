import type { DirectImportMode, ImportRoute, ImportedGame } from '../domain/model';
import { WorkspaceReadOnly } from './ports';
import type { HelperConnection, HelperProfile, HelperProfileResult } from './ports';

export type DirectImportSnapshot = {
  connection: HelperConnection;
  reloading: boolean;
  reloadError: string | null;
  importStopped: string | null;
};

export type DirectImportController = {
  getSnapshot(): DirectImportSnapshot;
  subscribe(listener: () => void): () => void;
  start(config: DirectImportConfig): void;
  stop(): void;
  refresh(force?: boolean): Promise<void>;
  resetObservation(): void;
};

export type DirectImportConfig = {
  route: ImportRoute;
  mode: DirectImportMode;
  getGame(): ImportedGame | null;
  checkConnection(): Promise<HelperConnection>;
  readProfile(): Promise<HelperProfileResult>;
  helperStatusMessage(connection: HelperConnection): string;
  createImportedGame(profile: HelperProfile, connection: HelperConnection): ImportedGame;
  importAccount(imported: ImportedGame, options: { carryLiveLocks: boolean }): Promise<ImportedGame | null>;
  onAccepted(imported: ImportedGame, manual: boolean): void;
  onMessage(message: string): void;
};

/**
 * Direct import is a source lifecycle, not a React effect. The controller keeps
 * source tokens and rejection notices stable across renders, allows one profile
 * read at a time, and coalesces a poll that arrives while a forced reload runs.
 */
export function createDirectImportController(initialConnection: HelperConnection): DirectImportController {
  let state: DirectImportSnapshot = { connection: initialConnection, reloading: false, reloadError: null, importStopped: null };
  let config: DirectImportConfig | null = null;
  let running = false;
  let refreshing = false;
  let reloadPending = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let acceptedRevision: number | null = null;
  let acceptedSession: string | null = null;
  let rejectedSnapshot: { key: string; reason: string } | null = null;
  let reportedRejection: string | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function update(update: Partial<DirectImportSnapshot>) {
    state = { ...state, ...update };
    notify();
  }

  function sourceKey(connection: HelperConnection): string {
    return `${connection.instanceId}:${connection.sessionId}:${connection.revision}`;
  }

  function sessionKey(connection: HelperConnection): string {
    return `${connection.instanceId}:${connection.sessionId}`;
  }

  function profileMatchesConnection(profile: HelperProfile, connection: HelperConnection): boolean {
    return profile.instanceId === connection.instanceId
      && profile.sessionId === connection.sessionId
      && profile.revision === connection.revision;
  }

  async function refresh(force = false): Promise<void> {
    const startedConfig = config;
    if (!running || startedConfig === null || startedConfig.route !== 'direct') return;
    if (force) {
      update({ reloading: true, reloadError: null });
    }
    if (refreshing) {
      reloadPending ||= force;
      return;
    }
    refreshing = true;
    try {
      const connection = await startedConfig.checkConnection();
      if (!running || config !== startedConfig) return;
      if (!connection.profileReady) {
        rejectedSnapshot = null;
        update({ connection, importStopped: startedConfig.mode === 'live' ? connection.captureError : null,
          ...(force ? { reloadError: startedConfig.helperStatusMessage(connection) } : {}) });
        return;
      }

      const key = sourceKey(connection);
      if (!force && rejectedSnapshot?.key === key) {
        update({ importStopped: rejectedSnapshot.reason });
        return;
      }
      const needsImport = startedConfig.mode === 'live'
        ? acceptedRevision !== connection.revision || acceptedSession !== sessionKey(connection)
        : acceptedSession !== sessionKey(connection);
      if (!force && !needsImport) {
        if (acceptedRevision === connection.revision && acceptedSession === sessionKey(connection)) update({ connection, importStopped: null });
        return;
      }

      const result = await startedConfig.readProfile();
      if (!running || config !== startedConfig) return;
      if (result.state === 'unavailable') {
        if (force) update({ reloadError: 'Game data could not be loaded. Check the helper on Home.' });
        else startedConfig.onMessage('Game data could not be loaded. JASWA is keeping the last saved import. Check the helper.');
        update({ connection: { ...connection, state: 'unavailable', profileReady: false, detail: result.reason } });
        return;
      }
      if (result.state === 'unreadable') {
        rejectedSnapshot = { key: sourceKey({ ...connection, revision: result.identity.revision }), reason: result.reason };
        update({ connection, importStopped: result.reason,
          ...(force ? { reloadError: 'Game data could not be read. Check the helper on Home.' } : {}) });
        if (!force && reportedRejection !== rejectedSnapshot.key) {
          reportedRejection = rejectedSnapshot.key;
          startedConfig.onMessage(`${result.reason} Use Report Issue to send the details.${startedConfig.getGame() ? ' JASWA is still showing your last good import.' : ' JASWA has not loaded this account.'}`);
        }
        return;
      }

      /* Health and profile are two passive reads. If the game advances between
         them, never pair a newer profile with older capture coverage; re-read
         health once and accept only a matching source observation. The next
         live poll will retry a moving source, while an explicit reload reports
         that the user can try again. */
      let acceptedConnection = connection;
      if (!profileMatchesConnection(result.profile, connection)) {
        const current = await startedConfig.checkConnection();
        if (!running || config !== startedConfig) return;
        if (!current.profileReady || !profileMatchesConnection(result.profile, current)) {
          update({ connection: current,
            ...(force ? { reloadError: 'Game data changed while it was loading. Please try again.' } : {}) });
          return;
        }
        acceptedConnection = current;
      }
      const imported = startedConfig.createImportedGame(result.profile, acceptedConnection);
      const next = await startedConfig.importAccount(imported, { carryLiveLocks: startedConfig.mode === 'live' });
      if (!running || config !== startedConfig || next === null) return;
      acceptedRevision = result.profile.revision;
      acceptedSession = `${result.profile.instanceId}:${result.profile.sessionId}`;
      rejectedSnapshot = null;
      reportedRejection = null;
      update({ connection: acceptedConnection, importStopped: null, reloadError: null });
      startedConfig.onAccepted(next, force);
    } catch (error) {
      if (running && config === startedConfig) {
        if (error instanceof WorkspaceReadOnly) return;
        if (force) update({ reloadError: 'Game data could not be loaded. Please try again.' });
        else startedConfig.onMessage('JASWA could not save the helper import. Please try again.');
      }
    } finally {
      refreshing = false;
      if (force && running && config === startedConfig) update({ reloading: false });
      if (reloadPending && running && config === startedConfig) {
        reloadPending = false;
        void refresh(true);
      }
    }
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(nextConfig) {
      if (timer !== null) clearInterval(timer);
      config = nextConfig;
      running = true;
      if (acceptedSession === null) {
        const saved = nextConfig.getGame()?.helperSession;
        if (saved) acceptedSession = `${saved.instanceId}:${saved.sessionId}`;
      }
      state = { connection: initialConnection, reloading: false, reloadError: null, importStopped: null };
      notify();
      void refresh();
      timer = setInterval(() => void refresh(), 2_000);
    },
    stop() {
      running = false;
      config = null;
      if (timer !== null) clearInterval(timer);
      timer = null;
      reloadPending = false;
      update({ reloading: false, importStopped: null });
    },
    refresh,
    resetObservation() {
      acceptedRevision = null;
      acceptedSession = null;
      rejectedSnapshot = null;
      reportedRejection = null;
    },
  };
}
