import type { ImportedGame, Preferences } from '../domain/model';

export type HelperMiss = { command: string; cause: 'encrypted' | 'unread' };
export type HelperConnection = {
  state: 'checking' | 'ready' | 'unavailable';
  detail: string;
  captureError: string | null;
  version: string | null;
  updateAvailable: boolean;
  gameRunning: boolean;
  profileReady: boolean;
  restartRequired: boolean;
  gameStartedBeforeHelper: boolean;
  gameLoginPending: boolean;
  instanceId: string;
  revision: number;
  sessionId: number;
  missedChanges: HelperMiss[];
};

export type HelperProfile = {
  updatedAt: string;
  instanceId: string;
  revision: number;
  sessionId: number;
  source: 'game-start' | 'live';
  data: Record<string, unknown>;
};

export type HelperSessionIdentity = { instanceId: string; sessionId: number; revision: number };
export type HelperProfileResult =
  | { state: 'ready'; profile: HelperProfile }
  | { state: 'unreadable'; reason: string; identity: HelperSessionIdentity; data: Record<string, unknown> }
  | { state: 'unavailable'; reason: string; evidence?: unknown };

/* The operations the workspace needs from the outside world, declared here and
   implemented in `app/platform/`. Only the shell connects the two, so the store
   can be exercised in a test without a browser, a database or another tab. */

/** The durable workspace: one accepted account and the user's preferences. */
export type WorkspaceRepository = {
  loadGame(): Promise<unknown>;
  loadPreferences(): Promise<unknown>;
  /** Whether the stored preferences were read, so a write cannot erase choices only the database holds. */
  canSavePreferences(): boolean;
  saveGame(game: ImportedGame): Promise<void>;
  clearGame(): Promise<void>;
  /**
   * Mirror first, then the database in order. `rebase` re-applies the same change
   * onto a paired write still in flight, so a click during it is not lost.
   */
  savePreferences(preferences: Preferences, rebase?: (current: Preferences) => Preferences): Promise<void>;
  /** The account and preferences committed in one transaction (`LOCAL-PERSISTENCE-CONTRACT.md`). */
  saveGamePair(game: ImportedGame, before: Preferences, after: Preferences): Promise<{ preferences: Preferences; mirrorSaved: boolean }>;
};

/**
 * Which tab may change the durable workspace. One writer per origin: another tab
 * reads and shows the workspace, and takes over when the writer closes.
 */
export type WriterRole = 'writer' | 'reader';
export type WriterCoordination = {
  /** Settles once this tab knows its role; a tab never changes storage before that. */
  ready(): Promise<WriterRole>;
  /** The current role, including a reader becoming the writer after takeover. */
  getRole(): WriterRole | null;
  /** Called when the role changes after `ready`, with the new role. */
  onRoleChange(listener: (role: WriterRole) => void): () => void;
  /** Tells the other tabs that committed state changed, without sending the state itself. */
  announceCommit(): void;
  /** Called when another tab committed a change. */
  onRemoteCommit(listener: () => void): () => void;
};

/** The database write succeeded, but closing immediately may lose a later edit. */
export class PreferenceMirrorUnavailable extends Error {
  constructor() {
    super('The preference recovery copy could not be saved.');
    this.name = 'PreferenceMirrorUnavailable';
  }
}

/** Writing over an unread database could erase choices missing from the mirror. */
export class PreferenceStoreUnreadable extends Error {
  constructor() {
    super('Reload to read the saved preferences before changing them.');
    this.name = 'PreferenceStoreUnreadable';
  }
}

/** A paired write cannot begin without a recoverable pending mirror. */
export class PairedCommitUnavailable extends Error {
  constructor() {
    super('The paired change could not be prepared safely. Please try again.');
    this.name = 'PairedCommitUnavailable';
  }
}

/** Another tab holds the writer role; this one shows the workspace but does not change it. */
export class WorkspaceReadOnly extends Error {
  constructor() {
    super('JASWA is open in another tab. Close it to make changes here.');
    this.name = 'WorkspaceReadOnly';
  }
}
