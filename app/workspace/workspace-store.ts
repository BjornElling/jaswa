import type { ImportedGame, Preferences } from '../domain/model';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import { accountItems, monsterInPreset, readPresets, runesInPreset, teammateSetsInPreset } from '../domain/placements/presets';
import type { OwnPreset, Preset } from '../domain/placements/presets';
import { checkRuneBuild, engraveImportedGame, engraveOwnPreset, runesWithLocked, runesWithout } from '../domain/placements/engrave-rune-build';
import { carriedRuneLocks, heldRuneLocks, noRuneLocks, runeLockScope, runeLocksFor, withRuneLock } from '../domain/placements/rune-locks';
import { presetPriorityOf } from '../domain/profiles/monster-priority';
import { withheldRunes } from '../domain/placements/rune-sources';
import type { BuildEngraving } from '../domain/runes/optimization/rune-optimization-refresh';
import type { RuneLock, RuneLocks } from '../domain/placements/rune-locks';
import { alwaysSynchronizedReason } from '../domain/placements/always-synchronized';
import { restoreWorkspace } from './restore';
import { createSerializedWriter } from './serialized-writes';
import { clearAccountJobMemory } from './jobs/account-job-memory';
import { engravingQuestionKey } from './engraving-question';
import { PreferenceMirrorUnavailable, PreferenceStoreUnreadable, WorkspaceReadOnly } from './ports';
import type { WorkspaceRepository, WriterCoordination, WriterRole } from './ports';
import { storedGame, withAccountSnapshot } from '../ingest/game-export';

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
  /** A saved import was read but refused by the current import contract. */
  gameRejected: boolean;
  /** `null` until this tab knows whether it may write. */
  writer: WriterRole | null;
};

const mirrorWarning: StorageNotice = { tone: 'warn', message: 'Your preferences were saved, but their quick recovery copy could not be saved.' };
const unreadNotice: StorageNotice = { tone: 'bad', message: 'Reload to read your saved preferences before changing them.' };
const readOnlyNotice: StorageNotice = { tone: 'warn', message: 'JASWA is open in another tab. This tab shows your workspace and takes over when that tab closes.' };
const rolePendingNotice: StorageNotice = { tone: 'warn', message: 'JASWA is checking whether this tab may change the workspace.' };
const uncoordinatedNotice: StorageNotice = { tone: 'warn', message: 'This browser cannot coordinate JASWA tabs. Your workspace is read-only; use a browser with Web Locks to save changes.' };

/* JASWA changes the account only while no live sync would put the game's own back. */
export const canEngraveUnder = (preferences: Preferences) => preferences.importRoute === 'file' || preferences.directImportMode === 'on-load';

/**
 * Live sync replaces the import on every change in the game, and Lock and
 * Exclude are the user's word to the search, not the game's to undo: within one
 * account they carry to the next revision (`carriedRuneLocks`). Another account
 * starts with none.
 */
function withLiveRuneLocks(next: ImportedGame, previous: ImportedGame | null, ownPresets: readonly OwnPreset[]): ImportedGame {
  const account = previous?.snapshot.accountId ?? null;
  if (!previous?.runeLocks || account === null || account !== next.snapshot.accountId) return next;
  const runeIds = new Set(next.snapshot.runes.map((rune) => rune.id));
  const locks = carriedRuneLocks(previous.runeLocks, runeIds, readPresets(next.data, ownPresets));
  return Object.keys(locks).length > 0 ? { ...next, runeLocks: locks } : next;
}

/* No locks is no field: the stored game then has no `runeLocks` key at all. */
const withLocks = (game: ImportedGame, locks: RuneLocks): ImportedGame => {
  const rest = { ...game };
  delete rest.runeLocks;
  return Object.keys(locks).length > 0 ? { ...rest, runeLocks: locks } : rest;
};

/**
 * The preferences without what was stated for one preset: its priority list. A
 * deleted preset is gone in the game too. Its speed tuning stays: that belongs
 * to the team — its content and its monsters — and holds for the next preset
 * built of them.
 */
export function withoutPreset(preferences: Preferences, presetId: string): Preferences {
  if (!(presetId in preferences.presetPriority)) return preferences;
  return {
    ...preferences,
    presetPriority: Object.fromEntries(Object.entries(preferences.presetPriority).filter(([id]) => id !== presetId)),
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
    ready: false, game: null, preferences: blankPreferences(), storageNotice: null, restoreFailed: [], gameRejected: false, writer: null,
  };
  const listeners = new Set<() => void>();
  const accountWrite = createSerializedWriter();
  let restoreGeneration = 0;
  let activeImport: AbortController | null = null;
  const preferenceLoads: Array<{ edits: Array<(current: Preferences) => Preferences> }> = [];

  function set(update: Partial<WorkspaceState>) {
    if (update.preferences && (update.preferences.importRoute !== state.preferences.importRoute
      || update.preferences.directImportMode !== state.preferences.directImportMode)) activeImport?.abort();
    const previous = state.game;
    state = { ...state, ...update };
    const sameSourceSession = previous?.helperSession && update.game?.helperSession
      && previous.helperSession.instanceId === update.game.helperSession.instanceId
      && previous.helperSession.sessionId === update.game.helperSession.sessionId;
    const sameUnidentifiedRoster = previous && update.game && !previous.helperSession && !update.game.helperSession
      && previous.snapshot.accountId === null && update.game.snapshot.accountId === null
      && JSON.stringify(previous.snapshot.monsters.map((copy) => [copy.id, copy.speciesId]).sort())
        === JSON.stringify(update.game.snapshot.monsters.map((copy) => [copy.id, copy.speciesId]).sort());
    if (update.game !== undefined && previous !== update.game
      && (update.game === null || previous === null || previous.snapshot.accountId !== update.game.snapshot.accountId
        || (update.game.snapshot.accountId === null && !sameSourceSession && !sameUnidentifiedRoster
          && previous.observation !== update.game.observation))) clearAccountJobMemory();
    listeners.forEach((listener) => listener());
  }

  /* What this tab may do, said once for every route that learns its role. It is
     also what stands once a save succeeds, so a lasting condition — an unread
     database, tabs this browser cannot coordinate — is never cleared by a click. */
  const roleNotice = (role: WriterRole): StorageNotice | null =>
    !coordination.isCoordinated() ? uncoordinatedNotice
      : role === 'reader' ? readOnlyNotice
      : !repository.canSavePreferences() ? unreadNotice
      : null;

  async function restore(roleOverride?: WriterRole) {
    const generation = ++restoreGeneration;
    const [restored, role] = await Promise.all([
      restoreWorkspace(repository).catch(() => null),
      roleOverride ? Promise.resolve(roleOverride) : coordination.ready(),
    ]);
    if (generation !== restoreGeneration) return;
    /* A takeover while this read ran is the newer word about the role. */
    const current = coordination.getRole() ?? role;
    set(restored === null ? {
      ready: true, game: null, preferences: blankPreferences(), restoreFailed: ['game', 'preferences'], gameRejected: false, writer: current, storageNotice: roleNotice(current),
    } : {
      ready: true, writer: current, game: restored.game, preferences: restored.preferences, restoreFailed: restored.failed, gameRejected: restored.gameRejected,
      storageNotice: roleNotice(current),
    });
  }

  /* A reader shows what the writer committed; when it becomes the writer it reads
     once more, so it starts from the other tab's last word rather than its own. */
  coordination.onRoleChange((role) => {
    restoreGeneration += 1;
    set({ writer: role === 'writer' ? null : role, storageNotice: role === 'writer' ? rolePendingNotice : roleNotice(role) });
    if (role === 'writer') void accountWrite(() => restore(role));
    else void restore(role);
  });
  coordination.onRemoteCommit(() => {
    if (state.writer === 'reader') void restore();
  });
  void coordination.ready().then((role) => {
    if (state.writer === null) set({ writer: role, storageNotice: roleNotice(role) });
  });

  async function requireWriter() {
    const role = coordination.getRole() ?? await coordination.ready();
    if (role !== 'writer' || state.writer !== 'writer' || !state.ready || !coordination.isCoordinated()) {
      set({ storageNotice: coordination.isCoordinated() ? readOnlyNotice : uncoordinatedNotice });
      throw new WorkspaceReadOnly(coordination.isCoordinated() ? undefined : uncoordinatedNotice.message);
    }
  }

  function publishPreferences(preferences: Preferences, notice: StorageNotice | null) {
    set({ preferences, storageNotice: notice });
  }

  /* The one route from a committed preference choice to state and storage. The
     change applies to the latest choices, so rapid consecutive changes build on
     each other before any render; storage mirrors each one synchronously. */
  function queuePreferenceChange(change: (current: Preferences) => Preferences): Promise<boolean> {
    if (state.writer !== 'writer' || !state.ready || !coordination.isCoordinated()) {
      set({ storageNotice: !coordination.isCoordinated() ? uncoordinatedNotice : state.writer === 'reader' ? readOnlyNotice : rolePendingNotice });
      return Promise.resolve(false);
    }
    let next: Preferences;
    try {
      next = { ...change(state.preferences), updatedAt: new Date().toISOString() };
    } catch (error) {
      set({ storageNotice: { tone: 'bad', message: error instanceof Error ? error.message : 'JASWA could not apply that preference.' } });
      return Promise.resolve(false);
    }
    let writing: Promise<void>;
    try {
      writing = repository.savePreferences(next, change);
    } catch (error) {
      set({ storageNotice: { tone: 'bad', message: error instanceof Error ? error.message : 'JASWA could not save your preferences.' } });
      return Promise.resolve(false);
    }
    set({ preferences: next });
    void writing.then(() => {
      set({ storageNotice: roleNotice('writer') });
      coordination.announceCommit();
    }).catch((error: unknown) => {
      set({ storageNotice: error instanceof PreferenceMirrorUnavailable ? mirrorWarning
        : error instanceof PreferenceStoreUnreadable ? unreadNotice
        : { tone: 'bad', message: 'JASWA could not save your preferences. Your latest choice is still on screen.' } });
      if (error instanceof PreferenceMirrorUnavailable) coordination.announceCommit();
    });
    /* A missing recovery copy is a weaker save, not a failed one: the database holds the choice. */
    return writing.then(() => true, (error: unknown) => error instanceof PreferenceMirrorUnavailable);
  }

  function changePreferences(change: (current: Preferences) => Preferences): boolean {
    if (state.writer !== 'writer' || !state.ready || !coordination.isCoordinated()) {
      set({ storageNotice: !coordination.isCoordinated() ? uncoordinatedNotice : state.writer === 'reader' ? readOnlyNotice : rolePendingNotice });
      return false;
    }
    const pendingLoad = preferenceLoads.at(-1);
    if (pendingLoad) { pendingLoad.edits.push(change); return true; }
    void queuePreferenceChange(change);
    return true;
  }

  /** A whole preference document from a `.sw` file, stored before it is shown. */
  function replacePreferences(next: Preferences): Promise<{ mirrorSaved: boolean }> {
    const pending = { edits: [] as Array<(current: Preferences) => Preferences> };
    preferenceLoads.push(pending);
    return accountWrite(async () => {
      let mirrorSaved = true;
      try {
        await requireWriter();
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
        publishPreferences(next, mirrorSaved ? roleNotice('writer') : mirrorWarning);
        coordination.announceCommit();
        return { mirrorSaved };
      } finally {
        /* Clicks belong after the last replacement requested before them. Each
           load keeps its own tail even when another file is already queued. */
        preferenceLoads.splice(preferenceLoads.indexOf(pending), 1);
        for (const edit of pending.edits) await queuePreferenceChange(edit);
      }
    });
  }

  /* A shared read is a document replacement too: clicks made during its round
     trip belong afterwards, and paired account writes cannot pass it. */
  function synchronizePreferences(exchange: (current: Preferences, game: ImportedGame | null) => Promise<{
    preferences: Preferences; save: () => Promise<void>;
  } | null>): Promise<void> {
    const pending = { edits: [] as Array<(current: Preferences) => Preferences> };
    preferenceLoads.push(pending);
    return accountWrite(async () => {
      try {
        await requireWriter();
        if (!repository.canSavePreferences()) throw new PreferenceStoreUnreadable();
        const result = await exchange(state.preferences, state.game);
        if (!result) return;
        let notice = roleNotice('writer');
        try { await result.save(); }
        catch (error) {
          if (!(error instanceof PreferenceMirrorUnavailable)) throw error;
          notice = mirrorWarning;
        }
        publishPreferences(result.preferences, notice);
        coordination.announceCommit();
      } finally {
        preferenceLoads.splice(preferenceLoads.indexOf(pending), 1);
        for (const edit of pending.edits) await queuePreferenceChange(edit);
      }
    });
  }

  /**
   * Store an accepted account, then show it. A helper snapshot arriving after the
   * route left direct import is dropped. Under live sync the same account's locks
   * carry to the new revision.
   */
  function importAccount(imported: ImportedGame, options: { carryLiveLocks?: boolean; signal?: AbortSignal } = {}): Promise<ImportedGame | null> {
    if (!state.ready || state.writer !== 'writer') return Promise.reject(new WorkspaceReadOnly());
    return accountWrite(async () => {
      await requireWriter();
      const { preferences, game } = state;
      if (options.signal?.aborted || (imported.helperSession && preferences.importRoute !== 'direct')) return null;
      const next = options.carryLiveLocks && preferences.directImportMode === 'live'
        ? withLiveRuneLocks(imported, game, preferences.presets) : imported;
      const accepted = withAccountSnapshot(next);
      const lifetime = new AbortController();
      const abort = () => lifetime.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (imported.helperSession) activeImport = lifetime;
      try {
        await repository.saveGame(storedGame(accepted), lifetime.signal);
        if (lifetime.signal.aborted) {
          /* A repository must abort its transaction. This also keeps alternate
             adapters coherent if cancellation arrives at their commit boundary. */
          if (game) await repository.saveGame(storedGame(game));
          else await repository.clearGame();
          return null;
        }
      } catch (error) {
        if (lifetime.signal.aborted) return null;
        throw error;
      } finally {
        options.signal?.removeEventListener('abort', abort);
        if (activeImport === lifetime) activeImport = null;
      }
      set({ game: accepted });
      coordination.announceCommit();
      return accepted;
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
  function rebasePreferenceChange(before: Preferences, proposed: Preferences, current: Preferences): Preferences {
    const rebased = { ...proposed } as Preferences;
    for (const key of Object.keys(before) as Array<keyof Preferences>) {
      if (key === 'updatedAt') continue;
      if (current[key] !== before[key] && proposed[key] === before[key]) rebased[key] = current[key] as never;
    }
    return { ...rebased, updatedAt: new Date().toISOString() };
  }

  async function commitPair(game: ImportedGame, before: Preferences, proposed: Preferences) {
    const current = state.preferences;
    const after = rebasePreferenceChange(before, proposed, current);
    const accepted = withAccountSnapshot(game);
    const result = await repository.saveGamePair(storedGame(accepted), current, after);
    set({ game: accepted, preferences: result.preferences, storageNotice: result.mirrorSaved ? roleNotice('writer') : mirrorWarning });
    coordination.announceCommit();
  }

  async function commitGame(game: ImportedGame) {
    const accepted = withAccountSnapshot(game);
    await repository.saveGame(storedGame(accepted));
    set({ game: accepted, storageNotice: roleNotice('writer') });
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
  function engraveBuild(presetId: string, unitId: string, candidate: BuildEngraving): Promise<void> {
    return accountWrite(async () => {
      await requireWriter();
      const { buildFollowable, currentBuilds } = await import('../domain/runes/optimization/rune-optimization-refresh');
      const { game, preferences } = state;
      const presets = readPresets(game?.data, preferences.presets);
      const preset = presets.find((entry) => entry.id === presetId);
      if (!game || !preset || candidate.accountId !== game.snapshot.accountId) throw new Error('This build no longer belongs to the current account or preset.');
      if (candidate.questionKey !== engravingQuestionKey(preferences, presets, presetId, unitId)) {
        throw new Error('The profile or team changed while this build was waiting. Open it again before engraving.');
      }
      const runeIds = candidate.build.runes.map((rune) => rune.runeId);
      if (runeIds.length !== 6) throw new Error('A build must contain one rune for each of the six slots.');
      checkRuneBuild(game.data, unitId, runeIds);
      const monster = game.snapshot.monsters.find((entry) => entry.id === unitId);
      if (!monster || !preset.members.includes(unitId)) throw new Error('This monster is no longer in the selected preset.');
      const locks = heldRuneLocks(game.runeLocks ?? noRuneLocks, presets);
      const priority = presetPriorityOf(preset, preferences.monsterPriority, preferences.presetPriority);
      const current = currentBuilds([candidate.build], {
        unitId, monster: monsterInPreset(monster.record, preset, accountItems(game.data)),
        requirements: { ...candidate.requirements, buildings: game.snapshot.buildings,
          teammateSets: teammateSetsInPreset(preset, unitId, accountItems(game.data)) }, settings: preferences.runeOptimization,
        craftCredit: preferences.runePotential.craftCredit,
        before: candidate.before,
        withheld: withheldRunes(preset, unitId, priority, preferences.runeOptimization, locks),
        now: { runes: new Map(runesInPreset(game.snapshot.runes, preset).map((rune) => [rune.id, rune])),
          items: new Map(game.snapshot.craftItems.map((item) => [item.id, item])), locks: runeLocksFor(locks, runeLockScope(preset), unitId) },
      })[0];
      if (!buildFollowable(current)) throw new Error('This build can no longer be followed. Check its runes and craft items before engraving.');
      if (preset?.kind === 'own') {
        const own = preferences.presets.find((entry) => entry.id === presetId);
        if (!own) throw new Error('This preset is no longer in your preferences.');
        const next = engraveOwnPreset(own, preset, unitId, runeIds);
        const ownPresets = preferences.presets.map((entry) => entry.id === presetId ? next : entry);
        /* A lock the build moved away is over here too, as in a game preset: the
           preset and the locks that no longer hold are committed together. */
        const locks = game ? heldRuneLocks(game.runeLocks ?? noRuneLocks, readPresets(game.data, ownPresets)) : noRuneLocks;
        await commitPair(withLocks(game, locks), preferences, { ...preferences, presets: ownPresets });
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
      const slots = new Map(game.snapshot.runes.map((rune) => [rune.id, rune.slot]));
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
        if (changedOwnPreset) await commitPair(next, preferences, { ...preferences, presets: ownPresets });
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
        if (changedPreferences && changedPreferences !== preferences) await commitPair(next, preferences, changedPreferences);
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
    synchronizePreferences,
    importAccount,
    removeAccount,
    engraveBuild,
    lockRune,
    changeGamePreset,
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
