import type { ImportedGame, Preferences } from '../domain/model';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import { readRunes } from '../domain/runes/runes';
import { readPresets } from '../domain/placements/presets';
import type { OwnPreset, Preset } from '../domain/placements/presets';
import { engraveImportedGame, engraveOwnPreset, runesWithLocked, runesWithout } from '../domain/placements/engrave-rune-build';
import { carriedRuneLocks, heldRuneLocks, noRuneLocks, runeLockScope, withRuneLock } from '../domain/placements/rune-locks';
import type { RuneLock, RuneLocks } from '../domain/placements/rune-locks';
import { alwaysSynchronizedReason } from '../domain/placements/always-synchronized';
import { restoreWorkspace } from './restore';
import { createSerializedWriter } from './serialized-writes';
import { PreferenceMirrorUnavailable, PreferenceStoreUnreadable, WorkspaceReadOnly } from './ports';
import type { WorkspaceRepository, WriterCoordination, WriterRole } from './ports';

export type StorageNotice = { message: string; tone: 'warn' | 'bad' };

/**
 * The application's durable state: the accepted account, the user's choices and
 * how well they are stored. Dialog drafts, overlays and calculations are not here;
 * they belong to the component or the calculation that owns them.
 */
export type WorkspaceState = {
  ready: boolean;
  game: ImportedGame | null;
  preferences: Preferences;
  storageNotice: StorageNotice | null;
  /** Which saved records could not be read when the workspace opened. */
  restoreFailed: readonly ('game' | 'preferences')[];
  /** `null` until this tab knows whether it may write. */
  writer: WriterRole | null;
};

const mirrorWarning: StorageNotice = { tone: 'warn', message: 'Your preferences were saved, but their quick recovery copy could not be saved.' };
const unreadNotice: StorageNotice = { tone: 'bad', message: 'Reload to read your saved preferences before changing them.' };
const readOnlyNotice: StorageNotice = { tone: 'warn', message: 'JASWA is open in another tab. This tab shows your workspace and takes over when that tab closes.' };

/* JASWA changes the account only while no live sync would put the game's own back. */
export const canEngraveUnder = (preferences: Preferences) => preferences.importRoute === 'file' || preferences.directImportMode === 'on-load';

/**
 * Live sync replaces the import on every change in the game, and Lock and
 * Exclude are the user's word to the search, not the game's to undo: within one
 * account they carry to the next revision (`carriedRuneLocks`). Another account
 * starts with none.
 */
function withLiveRuneLocks(next: ImportedGame, previous: ImportedGame | null, ownPresets: readonly OwnPreset[]): ImportedGame {
  const account = previous?.data?.wizard_id;
  if (!previous?.runeLocks || account === undefined || account === null || String(account) !== String(next.data?.wizard_id)) return next;
  const runeIds = new Set(readRunes(next.data).map((rune) => rune.id));
  const locks = carriedRuneLocks(previous.runeLocks, runeIds, readPresets(next.data, ownPresets));
  return Object.keys(locks).length > 0 ? { ...next, runeLocks: locks } : next;
}

const withLocks = (game: ImportedGame, locks: RuneLocks): ImportedGame => ({ ...game, runeLocks: Object.keys(locks).length > 0 ? locks : undefined });

/**
 * The preferences without what was stated for one preset: its speed tuning and
 * its priority list. A deleted preset is gone in the game too, and what was said
 * about its team is said about nothing.
 */
export function withoutPreset(preferences: Preferences, presetId: string): Preferences {
  if (!(presetId in preferences.presetPriority) && !(presetId in preferences.speedTuning.presets)) return preferences;
  const rest = <T,>(map: Readonly<Record<string, T>>) => Object.fromEntries(Object.entries(map).filter(([id]) => id !== presetId));
  return {
    ...preferences,
    presetPriority: rest(preferences.presetPriority),
    speedTuning: { ...preferences.speedTuning, presets: rest(preferences.speedTuning.presets) },
  };
}

/**
 * The workspace store (`ARCHITECTURE-FROM-SCRATCH.md` §10.1): immutable
 * snapshots, a subscription, and the typed commands that are the only routes
 * from a choice to storage. Account commands run one at a time and read the
 * latest committed state when they start, never a render's stale copy; a
 * preference change is mirrored synchronously and written in order.
 */
export function createWorkspaceStore(repository: WorkspaceRepository, coordination: WriterCoordination) {
  let state: WorkspaceState = {
    ready: false, game: null, preferences: blankPreferences(), storageNotice: null, restoreFailed: [], writer: null,
  };
  const listeners = new Set<() => void>();
  const accountWrite = createSerializedWriter();

  function set(update: Partial<WorkspaceState>) {
    state = { ...state, ...update };
    listeners.forEach((listener) => listener());
  }

  async function restore() {
    const restored = await restoreWorkspace(repository).catch(() => null);
    if (restored === null) {
      set({ ready: true, preferences: blankPreferences(), restoreFailed: ['game', 'preferences'] });
      return;
    }
    set({
      ready: true,
      game: restored.game,
      preferences: restored.preferences,
      restoreFailed: restored.failed,
      storageNotice: state.writer === 'reader' ? readOnlyNotice : repository.canSavePreferences() ? null : unreadNotice,
    });
  }

  /* A reader shows what the writer committed; when it becomes the writer it reads
     once more, so it starts from the other tab's last word rather than its own. */
  coordination.onRoleChange((role) => {
    set({ writer: role, storageNotice: role === 'reader' ? readOnlyNotice : null });
    if (role === 'writer') void restore();
  });
  coordination.onRemoteCommit(() => {
    if (state.writer === 'reader') void restore();
  });
  void coordination.ready().then((role) => {
    set({ writer: role, ...(role === 'reader' ? { storageNotice: readOnlyNotice } : {}) });
  });

  async function requireWriter() {
    const role = await coordination.ready();
    if (role !== 'writer' || state.writer === 'reader') {
      set({ storageNotice: readOnlyNotice });
      throw new WorkspaceReadOnly();
    }
  }

  function publishPreferences(preferences: Preferences, notice: StorageNotice | null) {
    set({ preferences, storageNotice: notice });
  }

  /* The one route from a committed preference choice to state and storage. The
     change applies to the latest choices, so rapid consecutive changes build on
     each other before any render; storage mirrors each one synchronously. */
  function changePreferences(change: (current: Preferences) => Preferences): boolean {
    if (state.writer === 'reader') {
      set({ storageNotice: readOnlyNotice });
      return false;
    }
    const next = { ...change(state.preferences), updatedAt: new Date().toISOString() };
    const writing = repository.savePreferences(next, change);
    set({ preferences: next });
    void writing.then(() => {
      set({ storageNotice: null });
      coordination.announceCommit();
    }).catch((error: unknown) => {
      set({ storageNotice: error instanceof PreferenceMirrorUnavailable ? mirrorWarning
        : error instanceof PreferenceStoreUnreadable ? unreadNotice
        : { tone: 'bad', message: 'JASWA could not save your preferences. Your latest choice is still on screen.' } });
      if (error instanceof PreferenceMirrorUnavailable) coordination.announceCommit();
    });
    return true;
  }

  /** A whole preference document from a `.sw` file, stored before it is shown. */
  async function replacePreferences(next: Preferences): Promise<{ mirrorSaved: boolean }> {
    await requireWriter();
    let mirrorSaved = true;
    try {
      await repository.savePreferences(next);
    } catch (error) {
      if (!(error instanceof PreferenceMirrorUnavailable)) {
        set({ storageNotice: { tone: 'bad', message: error instanceof PreferenceStoreUnreadable
          ? unreadNotice.message : 'JASWA could not save these preferences. Please try again.' } });
        throw error;
      }
      mirrorSaved = false;
    }
    publishPreferences(next, mirrorSaved ? null : mirrorWarning);
    coordination.announceCommit();
    return { mirrorSaved };
  }

  /**
   * Store an accepted account, then show it. A helper snapshot arriving after the
   * route left direct import is dropped. Under live sync the same account's locks
   * carry to the new revision.
   */
  function importAccount(imported: ImportedGame, options: { carryLiveLocks?: boolean } = {}): Promise<ImportedGame | null> {
    return accountWrite(async () => {
      await requireWriter();
      const { preferences, game } = state;
      if (imported.helperSession && preferences.importRoute !== 'direct') return null;
      const next = options.carryLiveLocks && preferences.directImportMode === 'live'
        ? withLiveRuneLocks(imported, game, preferences.presets) : imported;
      await repository.saveGame(next);
      set({ game: next });
      coordination.announceCommit();
      return next;
    });
  }

  function removeAccount(): Promise<void> {
    return accountWrite(async () => {
      await requireWriter();
      await repository.clearGame();
      set({ game: null });
      coordination.announceCommit();
    });
  }

  /* Account and preferences together, in one transaction, published as one change. */
  async function commitPair(game: ImportedGame, after: Preferences) {
    const result = await repository.saveGamePair(game, state.preferences, { ...after, updatedAt: new Date().toISOString() });
    set({ game, preferences: result.preferences, storageNotice: result.mirrorSaved ? null : mirrorWarning });
    coordination.announceCommit();
  }

  async function commitGame(game: ImportedGame) {
    await repository.saveGame(game);
    set({ game, storageNotice: null });
    coordination.announceCommit();
  }

  /* A failed account command leaves the preceding state on screen and says why;
     the caller shows the message where the user acted. */
  function failed(error: unknown, fallback: string, notice = true): never {
    const reason = error instanceof Error ? error : new Error(fallback);
    if (notice && !(error instanceof WorkspaceReadOnly)) set({ storageNotice: { tone: 'bad', message: reason.message } });
    throw reason;
  }

  /* A build is engraved in one preset and nowhere else. A preset built in JASWA
     lives in the preferences, which no sync overwrites; Scenario and the game's
     presets live in the import, which live sync would put back. */
  function engraveBuild(presetId: string, unitId: string, runeIds: readonly string[]): Promise<void> {
    return accountWrite(async () => {
      await requireWriter();
      const { game, preferences } = state;
      const preset = readPresets(game?.data, preferences.presets).find((entry) => entry.id === presetId);
      if (preset?.kind === 'own') {
        const own = preferences.presets.find((entry) => entry.id === presetId);
        if (!own) throw new Error('This preset is no longer in your preferences.');
        const next = engraveOwnPreset(own, preset, unitId, runeIds);
        changePreferences((current) => ({ ...current, presets: current.presets.map((entry) => entry.id === presetId ? next : entry) }));
        return;
      }
      if (!game || !preset || !canEngraveUnder(preferences)) throw new Error('This build cannot be engraved in the current import mode.');
      try {
        const engraved = engraveImportedGame(game, preset, unitId, runeIds);
        /* A lock whose rune the build moved away is over, and is not stored to come back if the rune ever does. */
        await commitGame(withLocks(engraved, heldRuneLocks(engraved.runeLocks ?? noRuneLocks, readPresets(engraved.data, preferences.presets))));
      } catch (error) {
        failed(error, 'JASWA could not save this build. Please try again.', false);
      }
    });
  }

  /**
   * The one route from a Lock or Exclude control to storage, wherever it sits.
   * A lock engraves the rune on the monster first where it is not there yet, so
   * a lock always names a rune its monster carries, and an exclusion takes a rune
   * the monster carries off it. The locks are written with the import — never
   * the preferences — and only those still holding are kept. Where the lock also
   * engraves a preset built in JASWA, both are committed together.
   */
  function lockRune(presetId: string, unitId: string, runeId: string, lock: RuneLock | null): Promise<void> {
    return accountWrite(async () => {
      await requireWriter();
      const { game, preferences } = state;
      const presets = readPresets(game?.data, preferences.presets);
      const preset = presets.find((entry) => entry.id === presetId);
      if (!game || !preset) throw new Error('This rune cannot be locked or excluded without an import.');
      /* Under live sync only the engraving is off, and only where the game owns the
         placement: the choice itself is the search's, so it stands either way. */
      const mayEngrave = canEngraveUnder(preferences) || preset.kind === 'own';
      const onMonster = preset.runeOwner.get(runeId) === unitId;
      if (lock === 'locked' && !onMonster && !mayEngrave) throw new Error(alwaysSynchronizedReason);
      const slots = new Map(readRunes(game.data).map((rune) => [rune.id, rune.slot]));
      const slotOf = (id: string) => slots.get(id);
      try {
        let next = game;
        let ownPresets = preferences.presets;
        let changedOwnPreset = false;
        const runeIds = lock === 'locked' && !onMonster ? runesWithLocked(preset, unitId, runeId, slotOf)
          : lock === 'excluded' && onMonster && mayEngrave ? runesWithout(preset, unitId, runeId, slotOf) : null;
        if (runeIds !== null) {
          if (preset.kind === 'own') {
            const own = ownPresets.find((entry) => entry.id === presetId);
            if (!own) throw new Error('This preset is no longer in your preferences.');
            const engraved = engraveOwnPreset(own, preset, unitId, runeIds);
            ownPresets = ownPresets.map((entry) => entry.id === presetId ? engraved : entry);
            changedOwnPreset = true;
          } else {
            next = engraveImportedGame(next, preset, unitId, runeIds, lock === 'locked' ? [runeId] : []);
          }
        }
        const currentLocks = heldRuneLocks(game.runeLocks ?? noRuneLocks, presets);
        next = withLocks(next, heldRuneLocks(withRuneLock(currentLocks, runeLockScope(preset), unitId, runeId, lock, slotOf),
          readPresets(next.data, ownPresets)));
        if (changedOwnPreset) await commitPair(next, { ...preferences, presets: ownPresets });
        else await commitGame(next);
      } catch (error) {
        failed(error, 'JASWA could not save this lock. Please try again.');
      }
    });
  }

  /* A game preset lives in the import, so a change to one is saved there, as an
     engrave is; live sync would put the game's own back at once, so it refuses.
     A change that also clears what was said about the preset commits both. */
  function changeGamePreset(presetId: string, change: (current: ImportedGame, preset: Preset, scenario: Preset) => ImportedGame,
    preferenceChange?: (current: Preferences) => Preferences): Promise<boolean> {
    return accountWrite(async () => {
      await requireWriter();
      const { game, preferences } = state;
      if (!game || !canEngraveUnder(preferences)) return false;
      const presets = readPresets(game.data, preferences.presets);
      const preset = presets.find((entry) => entry.id === presetId);
      const scenario = presets.find((entry) => entry.kind === 'scenario');
      if (!preset || !scenario) return false;
      try {
        const next = change(game, preset, scenario);
        const changedPreferences = preferenceChange?.(preferences);
        if (changedPreferences && changedPreferences !== preferences) await commitPair(next, changedPreferences);
        else await commitGame(next);
        return true;
      } catch (error) {
        return failed(error, 'JASWA could not save this preset. Please try again.');
      }
    });
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    restore,
    changePreferences,
    replacePreferences,
    importAccount,
    removeAccount,
    engraveBuild,
    lockRune,
    changeGamePreset,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
