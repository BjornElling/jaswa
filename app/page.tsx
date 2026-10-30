import { lazy, Suspense, type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppRail } from './components/app-rail';
import { HomeSection } from './components/home-section';
import { CornerNotices, ImportBadge } from './components/import-badge';
import { DirectImportModeDialog, LoadPreferencesDialog, RemoveGameDataDialog, ReplaceImportDialog, ReportDialog } from './components/import-dialogs';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/browser-storage';
import { blankPreferences, createImportedGame, fileToText, importPreferencesFile, isValidImportedGame, readPreferences, validateGameFile } from './lib/file-imports';
import { checkHelperConnection, helperStatusMessage, readHelperProfile } from './lib/helper-client';
import type { HelperConnection } from './lib/helper-client';
import { downloadJson, formatDateTime } from './lib/formatting';
import { accountCounts } from './lib/account-counts';
import { canChooseSaveFolder, chooseSaveFolder, forgetSaveFolder, loadSaveFolder, writeToSaveFolder } from './lib/save-location';
import type { DirectoryHandle } from './lib/save-location';
import type { GameRecord } from './lib/game-data';
import type { ArtifactSettings, DirectImportMode, GeneralSettings, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from './lib/types';
import type { RuneRole } from './lib/rune-roles';
import type { RuneOptimizationSettings } from './lib/rune-optimization-settings';
import { runeOptimizationMonsterKey } from './lib/rune-optimization-settings';
import type { SpeedTuningPreferences } from './lib/speed-tuning-preferences';
import { readRunes } from './lib/runes';
import { createRuneCleanupSession } from './lib/rune-cleanup-session';
import { engraveImportedGame, engraveOwnPreset, readLoadedPlacements, runesWithLocked, runesWithout } from './lib/engrave-rune-build';
import { addToGamePreset, deleteGamePreset, leadGamePreset, removeFromGamePreset } from './lib/game-preset-edits';
import { usePageHistory } from './lib/page-history';
import type { MonsterCopyPreferences } from './lib/monster-preferences';
import type { MonsterProfileScope } from './lib/monster-profile-scope';
import type { MonsterPriority } from './lib/monster-priority';
import { scenarioPresetId, engravings, readPresets, selectedPresetKey } from './lib/presets';
import { PresetsContext } from './lib/presets-context';
import { summarizeRunePlacement } from './lib/rune-placement';
import type { OwnPreset } from './lib/presets';
import type { PresetWrites } from './components/presets-section';
import { profilesIn, withProfile } from './lib/monster-preferences';
import type { RuneHold } from './lib/rune-holds';
import { runeHoldVerdict } from './lib/rune-holds';
import type { CraftIgnore, CraftIgnoreView } from './lib/craft-ignores';
import { withCraftIgnore } from './lib/craft-ignores';
import { heldRuneLocks, lockedRuneIds, noRuneLocks, readRuneLocks, runeLockOf, runeLockScope, withRuneLock } from './lib/rune-locks';
import type { RuneLock, RuneLocks } from './lib/rune-locks';
import type { MonsterReference, OpenMonsterOverlay } from './components/monster-link';
import type { OpenRuneOverlay, RuneOverlayTarget } from './components/rune-link';
import type { OpenSpeedTeamOverlay } from './components/preset-speed-team-overlay';
import type { OpenMonsterStatistics } from './components/game-statistics-button';
import { useSessionStorageState, writeSessionValue } from './lib/session-storage-state';
import { pageChoices, type Page, type ReportCategory } from './lib/workspace-config';

const isPage = (value: unknown): value is Page => typeof value === 'string' && pageChoices.includes(value as Page);
const isString = (value: unknown): value is string => typeof value === 'string';
const ArtifactList = lazy(() => import('./components/artifact-list').then(({ ArtifactList: component }) => ({ default: component })));
const ArtifactsSection = lazy(() => import('./components/artifacts-section').then(({ ArtifactsSection: component }) => ({ default: component })));
const GemsSection = lazy(() => import('./components/gems-section').then(({ GemsSection: component }) => ({ default: component })));
const MonsterStats = lazy(() => import('./components/monster-stats').then(({ MonsterStats: component }) => ({ default: component })));
const MonsterNumbers = lazy(() => import('./components/monster-numbers').then(({ MonsterNumbers: component }) => ({ default: component })));
const RelicList = lazy(() => import('./components/relic-list').then(({ RelicList: component }) => ({ default: component })));
const RunePotentialSection = lazy(() => import('./components/rune-potential-section').then(({ RunePotentialSection: component }) => ({ default: component })));
const RuneSetupSection = lazy(() => import('./components/rune-potential-section').then(({ RuneSetupSection: component }) => ({ default: component })));
const SettingsSection = lazy(() => import('./components/settings-section').then(({ SettingsSection: component }) => ({ default: component })));
const TheMathSection = lazy(() => import('./components/the-math-section').then(({ TheMathSection: component }) => ({ default: component })));
const RuneSimulatorSection = import.meta.env.DEV ? lazy(() => import('./components/rune-simulator-section').then(({ RuneSimulatorSection: component }) => ({ default: component }))) : null;
const SpeedTuningSection = lazy(() => import('./components/speed-tuning-section').then(({ SpeedTuningSection: component }) => ({ default: component })));
const PresetsSection = lazy(() => import('./components/presets-section').then(({ PresetsSection: component }) => ({ default: component })));
const RuneOptimizationSection = lazy(() => import('./components/rune-optimization-section').then(({ RuneOptimizationSection: component }) => ({ default: component })));
const MonsterOverlay = lazy(() => import('./components/monster-overlay').then(({ MonsterOverlay: component }) => ({ default: component })));
const RuneOverlay = lazy(() => import('./components/rune-overlay').then(({ RuneOverlay: component }) => ({ default: component })));
const MonsterStatisticsOverlay = lazy(() => import('./components/monster-statistics-overlay').then(({ MonsterStatisticsOverlay: component }) => ({ default: component })));
const PresetSpeedTeamOverlay = lazy(() => import('./components/preset-speed-team-overlay').then(({ PresetSpeedTeamOverlay: component }) => ({ default: component })));

type OverlayTarget =
  | { kind: 'monster'; target: MonsterReference; presetId?: string }
  | { kind: 'rune'; target: RuneOverlayTarget };

function WorkspaceLoading() {
  return <section className="panel" aria-busy="true"><p className="lead">Opening workspace…</p></section>;
}

/**
 * The preferences without what was stated for one preset: its
 * speed tuning and its priority list. A deleted preset is gone in the game too,
 * and what was said about its team is said about nothing.
 */
function withoutPreset(preferences: Preferences, presetId: string): Preferences {
  const rest = <T,>(map: Readonly<Record<string, T>>) => Object.fromEntries(Object.entries(map).filter(([id]) => id !== presetId));
  return {
    ...preferences,
    presetPriority: rest(preferences.presetPriority),
    speedTuning: { ...preferences.speedTuning, presets: rest(preferences.speedTuning.presets) },
  };
}

export default function Home() {
  const [page, setStoredPage] = useSessionStorageState<Page>('jaswa.navigation.page', 'home', isPage);
  const [game, setGame] = useState<ImportedGame | null>(null);
  const runeCleanupAccount = game === null ? null : String(game.data?.wizard_id ?? '');
  const runeCleanupSession = useMemo(() => createRuneCleanupSession(runeCleanupAccount), [runeCleanupAccount]);
  const [preferences, setPreferences] = useState<Preferences>(blankPreferences());
  const [pendingGame, setPendingGame] = useState<ImportedGame | null>(null);
  const [importConfirmation, setImportConfirmation] = useState<{ game: ImportedGame; manual: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<{ category: ReportCategory; details: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removeGameDataPrompt, setRemoveGameDataPrompt] = useState(false);
  const [loadPreferencesPrompt, setLoadPreferencesPrompt] = useState(false);
  const [pendingDirectImportMode, setPendingDirectImportMode] = useState<DirectImportMode | null>(null);
  const [pendingImportRoute, setPendingImportRoute] = useState<ImportRoute | null>(null);
  const [helperConnection, setHelperConnection] = useState<HelperConnection>({ state: 'checking', detail: 'Run the helper. Then roll for initiative.', version: null, updateAvailable: false, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, instanceId: '', revision: 0, sessionId: 0 });
  const [saveFolder, setSaveFolder] = useState<DirectoryHandle | null>(null);
  const [overlay, setOverlay] = useState<OverlayTarget | null>(null);
  const [optimizerVisit, setOptimizerVisit] = useState(0);
  /* The preset whose team is open over the page. It is its own state rather
     than a kind of `overlay` because a monster opened from the team stacks on
     top of it, and closing that monster must leave the team standing. */
  const [speedTeam, setSpeedTeam] = useState<string | null>(null);
  /* The species whose game statistics are open. Its own state for the speed
     team's reason: it stacks on the monster profile that opened it. */
  const [statisticsMonster, setStatisticsMonster] = useState<string | null>(null);
  const statisticsOpener = useRef<HTMLElement | null>(null);
  /* The control that opened the overlay, so focus returns to the exact row the
     reader came from. It is held here rather than in the overlay because it has
     to outlive the overlay's own unmount. */
  const overlayOpener = useRef<HTMLElement | null>(null);
  const speedTeamOpener = useRef<HTMLElement | null>(null);
  /* A step back closes an overlay too: it was opened over the page being left. */
  const setPage = usePageHistory(page, setStoredPage, isPage, closeEveryOverlay);
  const preferencesRef = useRef(preferences);
  /* The import badge's own box, so the confirmation that opens in the same
     corner can measure what it has to clear rather than assume a height. */
  const importBadge = useRef<HTMLElement | null>(null);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);
  const appliedHelperRevision = useRef<number | null>(null);
  const appliedHelperSession = useRef<string | null>(null);
  const reloadHelper = useRef<((force: boolean) => Promise<void>) | null>(null);
  const [reloadingHelper, setReloadingHelper] = useState(false);
  const [helperReloadError, setHelperReloadError] = useState<string | null>(null);
  /* Which helper snapshot JASWA has already refused, so a two-second poll
     reports an unreadable account once rather than on every pass. */
  const reportedHelperRejection = useRef<string | null>(null);
  /* Why the helper's newest snapshot was not imported, while that stands. The
     refusal was once said on Home alone, so on every other page the import
     simply stopped moving: decks saved in the game never arrived, and nothing
     said why. */
  const [liveImportStopped, setLiveImportStopped] = useState<string | null>(null);
  /* The current import, readable from the polling interval's callback. That
     callback outlives the render that created it, so `game` inside it is
     whatever was loaded when the interval started. */
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    Promise.all([loadImportedGame(), loadPreferences()]).then(([savedGame, savedPreferences]) => {
      const validGame = savedGame && isValidImportedGame(savedGame) ? savedGame : null;
      /* The engrave record is read on its own, so a malformed one loses the
         record and keeps the import. */
      const loadedPlacements = readLoadedPlacements(validGame?.loadedPlacements);
      const runeLocks = readRuneLocks(validGame?.runeLocks);
      const savedCurrentGame = validGame === null ? null : { ...validGame, loadedPlacements, runeLocks };
      setGame(savedCurrentGame);
      if (savedCurrentGame?.helperSession) appliedHelperSession.current = `${savedCurrentGame.helperSession.instanceId}:${savedCurrentGame.helperSession.sessionId}`;
      const savedCurrentPreferences = readPreferences(savedPreferences, savedCurrentGame);
      preferencesRef.current = savedCurrentPreferences;
      setPreferences(savedCurrentPreferences);
    }).catch(() => {
      const emptyPreferences = blankPreferences();
      preferencesRef.current = emptyPreferences;
      setPreferences(emptyPreferences);
    }).finally(() => setReady(true));
    /* The folder is a live handle rather than a path, so it is read from its
       own record instead of travelling in the preferences document. */
    void loadSaveFolder().then(setSaveFolder);
  }, []);

  useEffect(() => {
    if (!importConfirmation) return undefined;
    const timeout = window.setTimeout(() => setImportConfirmation(null), 4_100);
    return () => window.clearTimeout(timeout);
  }, [importConfirmation]);

  useEffect(() => {
    if (!ready || preferences.importRoute !== 'direct') return;
    let disposed = false;
    let refreshing = false;
    let reloadPending = false;
    async function refreshHelper(force = false) {
      if (force) { setReloadingHelper(true); setHelperReloadError(null); }
      if (refreshing) {
        reloadPending ||= force;
        return;
      }
      refreshing = true;
      try {
        const connection = await checkHelperConnection();
        if (disposed) return;
        setHelperConnection(connection);
        if (!connection.profileReady) {
          // A capture gap makes the helper withhold its snapshot entirely.
          // The reader below never runs, so this refusal must be said here too.
          if (gameRef.current && preferences.directImportMode === 'live' && connection.state === 'unavailable') {
            setLiveImportStopped(connection.detail);
          }
          if (force) setHelperReloadError(helperStatusMessage(connection));
          return;
        }
        const needsImport = preferences.directImportMode === 'live'
          ? appliedHelperRevision.current !== connection.revision || appliedHelperSession.current !== `${connection.instanceId}:${connection.sessionId}`
          : appliedHelperSession.current !== `${connection.instanceId}:${connection.sessionId}`;
        if (!force && !needsImport) {
          // A healthy, already accepted revision can clear a connection failure
          // without re-importing it or hiding a different rejected revision.
          if (appliedHelperRevision.current === connection.revision
            && appliedHelperSession.current === `${connection.instanceId}:${connection.sessionId}`) {
            setLiveImportStopped(null);
          }
          return;
        }
        const result = await readHelperProfile();
        if (disposed) return;
        if (result.state === 'unavailable') {
          if (force) setHelperReloadError('Game data could not be loaded. Check the helper on Home.');
          else setMessage('Game data could not be loaded. JASWA is keeping the last saved import. Check the helper.');
          setLiveImportStopped(result.reason);
          setHelperConnection({ ...connection, state: 'unavailable', profileReady: false, detail: result.reason });
          return;
        }
        if (result.state === 'unreadable') {
          if (force) setHelperReloadError('Game data could not be read. Check the helper on Home.');
          setLiveImportStopped(result.reason);
          setHelperConnection({ ...connection, state: 'unavailable', profileReady: false, detail: result.reason });
          /* The helper is connected and sending, and JASWA cannot read what it
             sent. Say so in the same words the file route uses — but once per
             snapshot, because the poll would otherwise repeat it every two
             seconds, and never re-import the same rejected revision. */
          const { instanceId, sessionId, revision } = result.identity;
          const rejected = `${instanceId}:${sessionId}:${revision}`;
          if (!force && reportedHelperRejection.current !== rejected) {
            reportedHelperRejection.current = rejected;
            /* What the user loses differs, and guessing wrong is worse than
               saying less: with an earlier import the workspace is merely
               stale, without one there is nothing to work from at all. The ref
               carries it because `game` in this closure belongs to the render
               that started the interval. */
            setMessage(`${result.reason} Use Report Issue to send the details.${gameRef.current ? ' JASWA is still showing your last good import.' : ' JASWA has not loaded this account.'}`);
          }
          return;
        }
        const { profile } = result;
        const validation = validateGameFile(profile.data);
        if (!validation.valid) return;
        if (!await applyImport(createImportedGame('JASWA Helper — Steam', profile.data, validation, { instanceId: profile.instanceId, sessionId: profile.sessionId }), force)) return;
        reportedHelperRejection.current = null;
        setLiveImportStopped(null);
        setHelperReloadError(null);
        appliedHelperRevision.current = profile.revision;
        appliedHelperSession.current = `${profile.instanceId}:${profile.sessionId}`;
      } catch {
        if (!disposed) {
          if (force) setHelperReloadError('Game data could not be loaded. Please try again.');
          else setMessage('JASWA could not save the helper import. Please try again.');
        }
      } finally {
        refreshing = false;
        if (force && !disposed) setReloadingHelper(false);
        if (reloadPending && !disposed) {
          reloadPending = false;
          void refreshHelper(true);
        }
      }
    }
    reloadHelper.current = refreshHelper;
    void refreshHelper();
    const interval = window.setInterval(() => void refreshHelper(), 2000);
    return () => { disposed = true; reloadHelper.current = null; setReloadingHelper(false); setLiveImportStopped(null); window.clearInterval(interval); };
  }, [preferences.directImportMode, preferences.importRoute, ready]);

  /* The poll stops when the route leaves direct import, and the last answer it
     gave stays in state. Read alone, that answer kept the update warning up on
     the file route, where no helper is being asked anything. */
  const helperUpdateDue = preferences.importRoute === 'direct' && helperConnection.updateAvailable;

  const monsters = useMemo(
    () => (Array.isArray(game?.data?.unit_list) ? game.data.unit_list : []) as GameRecord[],
    [game],
  );
  /* Scenario and every preset, resolved once for every page that reads one
     (`DECK-PRESETS.md` §4). */
  const presets = useMemo(() => readPresets(game?.data, preferences.presets), [game, preferences.presets]);
  const presetsReading = useMemo(() => {
    const reading = engravings(presets);
    const runes = new Map([...reading.runes].map(([id, places]) => [id, summarizeRunePlacement(places)]));
    return { presets, runes, artifacts: reading.artifacts };
  }, [presets]);
  /* JASWA changes the account only while no live sync would put the game's own back. */
  const canEngrave = preferences.importRoute === 'file' || preferences.directImportMode === 'on-load';
  /* The locks every page reads: none while synchronized, and only those that still
     hold against the placement on screen (`heldRuneLocks`). */
  const runeLocks = useMemo(() => (canEngrave && game?.runeLocks ? heldRuneLocks(game.runeLocks, presets) : noRuneLocks),
    [canEngrave, game, presets]);
  const lockedRunes = useMemo(() => lockedRuneIds(runeLocks), [runeLocks]);
  const [selectedPreset, setSelectedPreset] = useSessionStorageState<string>(selectedPresetKey, '', isString);

  /* The overlay's rune is the same object for as long as the overlay and the import
     stand. Read afresh in render, it was a new rune on every render of this page —
     the helper's poll alone renders it every two seconds — and the overlay took
     each one for a different rune and calculated its Improvements again. */
  const overlayRune = useMemo(() => {
    if (overlay?.kind !== 'rune') return undefined;
    const runeTarget = overlay.target;
    return runeTarget.kind === 'account'
      ? (game?.data ? readRunes(game.data).find((entry) => entry.id === runeTarget.runeId) : undefined)
      : runeTarget.rune;
  }, [overlay, game]);

  async function selectGameFile(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await fileToText(file)) as unknown;
      const validation = validateGameFile(raw);
      if (!validation.valid) { setMessage(validation.message); return; }
      const imported = createImportedGame(file.name, raw as Record<string, unknown>, validation);
      /* An empty workspace has no existing data to protect. The confirmation
         only belongs to replacing a real import. */
      if (!game) { await applyFileImport(imported); return; }
      setPendingGame(imported);
      setMessage('');
    } catch {
      setMessage('JASWA could not read this file. Please choose the original JSON file exported from Summoners War.');
    }
  }

  /* The applied revision and session describe the helper snapshot the shown
     game came from, and nothing else. Once a file import, a removal or a switch
     of source replaces that game, they must be forgotten — kept, they told the
     poll the helper's data was already on screen, so returning to the direct
     route left the file's data standing until the game itself changed. */
  function forgetAppliedHelperImport() {
    appliedHelperRevision.current = null;
    appliedHelperSession.current = null;
  }

  async function applyImport(imported: ImportedGame, manual = false) {
    try {
      await saveImportedGame(imported);
    } catch {
      if (manual) setHelperReloadError('JASWA could not save game data. Please try again.');
      else setMessage('JASWA could not save this import. Please try again.');
      return false;
    }
    setGame(imported);
    setImportConfirmation({ game: imported, manual });
    setPendingGame(null);
    setMessage('');
    return true;
  }

  async function applyFileImport(imported: ImportedGame) {
    if (await applyImport(imported)) forgetAppliedHelperImport();
  }

  async function removeImport() {
    try {
      await clearImportedGame();
    } catch {
      setMessage('JASWA could not remove the saved import. Please try again.');
      return;
    }
    forgetAppliedHelperImport();
    setGame(null);
    setMessage('');
  }

  /* A build is engraved in one preset and nowhere else. A preset built in JASWA
     lives in the preferences, which no sync overwrites; Scenario and the game's
     presets live in the import, which live sync would put back. */
  async function engraveBuild(presetId: string, unitId: string, runeIds: readonly string[]): Promise<void> {
    const preset = presets.find((entry) => entry.id === presetId);
    if (preset?.kind === 'own') {
      const own = preferences.presets.find((entry) => entry.id === presetId);
      if (!own) throw new Error('This preset is no longer in your preferences.');
      const next = engraveOwnPreset(own, preset, unitId, runeIds);
      changePreferences((current) => ({ ...current, presets: current.presets.map((entry) => entry.id === presetId ? next : entry) }));
      return;
    }
    if (!game || !preset || !canEngrave) {
      throw new Error('This build cannot be engraved in the current import mode.');
    }
    try {
      const engraved = engraveImportedGame(game, preset, unitId, runeIds);
      /* A lock whose rune the build moved away is over, and is not stored to come back if the rune ever does. */
      const locks = heldRuneLocks(engraved.runeLocks ?? noRuneLocks, readPresets(engraved.data, preferences.presets));
      const next = { ...engraved, runeLocks: Object.keys(locks).length > 0 ? locks : undefined };
      await saveImportedGame(next);
      setGame(next);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JASWA could not save this build. Please try again.');
      throw error;
    }
  }

  /**
   * The one route from a Lock or Exclude control to storage, wherever it sits.
   * A lock engraves the rune on the monster first where it is not there yet, so
   * a lock always names a rune its monster carries, and an exclusion takes a rune
   * the monster carries off it. The locks are written with the import — never
   * the preferences — and only those still holding are kept.
   */
  async function lockRune(presetId: string, unitId: string, runeId: string, lock: RuneLock | null): Promise<void> {
    const preset = presets.find((entry) => entry.id === presetId);
    if (!game || !preset || !canEngrave) throw new Error('Runes cannot be locked or excluded while JASWA is synchronized with the game.');
    const slots = new Map(readRunes(game.data).map((rune) => [rune.id, rune.slot]));
    const slotOf = (id: string) => slots.get(id);
    try {
      let next = game;
      let ownPresets = preferences.presets;
      /* Locking a rune engraves it here; excluding one the monster carries takes it off (`runeLockLabels`). */
      const onMonster = preset.runeOwner.get(runeId) === unitId;
      const runeIds = lock === 'locked' && !onMonster ? runesWithLocked(preset, unitId, runeId, slotOf)
        : lock === 'excluded' && onMonster ? runesWithout(preset, unitId, runeId, slotOf) : null;
      if (runeIds !== null) {
        if (preset.kind === 'own') {
          const own = ownPresets.find((entry) => entry.id === presetId);
          if (!own) throw new Error('This preset is no longer in your preferences.');
          const engraved = engraveOwnPreset(own, preset, unitId, runeIds);
          ownPresets = ownPresets.map((entry) => entry.id === presetId ? engraved : entry);
          changePreferences((current) => ({ ...current, presets: current.presets.map((entry) => entry.id === presetId ? engraved : entry) }));
        } else {
          next = engraveImportedGame(next, preset, unitId, runeIds, lock === 'locked' ? [runeId] : []);
        }
      }
      const locks: RuneLocks = heldRuneLocks(withRuneLock(runeLocks, runeLockScope(preset), unitId, runeId, lock, slotOf),
        readPresets(next.data, ownPresets));
      next = { ...next, runeLocks: Object.keys(locks).length > 0 ? locks : undefined };
      await saveImportedGame(next);
      setGame(next);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JASWA could not save this lock. Please try again.');
      throw error;
    }
  }

  /* This is the sole route from a committed preference choice to both React and
     persistent storage. The ref makes rapid, consecutive changes build on the
     latest choice before React has rendered; browser-storage writes them in the
     same order and mirrors each one synchronously. */
  function changePreferences(change: (current: Preferences) => Preferences) {
    const next = { ...change(preferencesRef.current), updatedAt: new Date().toISOString() };
    const writing = savePreferences(next);
    preferencesRef.current = next;
    setPreferences(next);
    void writing.catch(() => {
      setMessage('JASWA could not save your preferences. Your latest choice is still on screen.');
    });
  }

  /* The preset the opener is about is the overlay's own, and leaves the one
     chosen across the program alone: looking at a monster of Arena Attack 1
     from Speed Tuning is not a decision to read every page in Arena Attack 1.
     A place about no preset — the Monsters page, an artifact, a relic — shows
     Scenario, so the overlay opens there too, never on whatever preset another
     page last chose: that would put an edit into a profile the opener never
     showed. */
  const openMonsterOverlay: OpenMonsterOverlay = (target, opener, presetId) => {
    overlayOpener.current = opener;
    setOverlay({ kind: 'monster', target, presetId });
  };

  const openRuneOverlay: OpenRuneOverlay = (target, opener) => {
    overlayOpener.current = opener;
    setOverlay({ kind: 'rune', target });
  };

  /* A team opens over the page that asked for it, never by going to Speed
     Tuning first: every button that opens an overlay opens it where the user
     is. Only the rail and Optimize change the page, and both close it. */
  const openSpeedTeam: OpenSpeedTeamOverlay = (presetId, opener) => {
    speedTeamOpener.current = opener;
    setSpeedTeam(presetId);  };

  const openMonsterStatistics: OpenMonsterStatistics = (masterId, opener) => {
    statisticsOpener.current = opener;
    setStatisticsMonster(masterId);
  };

  function closeMonsterStatistics() {
    setStatisticsMonster(null);
    const opener = statisticsOpener.current;
    statisticsOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }

  function closeSpeedTeam() {
    setSpeedTeam(null);
    const opener = speedTeamOpener.current;
    speedTeamOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }

  /* Leaving the page leaves what was opened over it. */
  function closeEveryOverlay() {
    overlayOpener.current = null;
    setOverlay(null);
    speedTeamOpener.current = null;
    setSpeedTeam(null);
    statisticsOpener.current = null;
    setStatisticsMonster(null);
  }

  function closeOverlay() {
    setOverlay(null);
    /* The row may have been filtered away while the overlay was open, in which
       case there is nothing to return to and the browser's own fallback is
       better than focusing something the reader is not looking at. */
    const opener = overlayOpener.current;
    overlayOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }

  /**
   * The one route from a monster overlay's choice to storage — a named wrapper
   * over `changePreferences`, never a second route. It writes one copy's profile
   * in one context and touches no other (`monster-preferences.ts`).
   *
   * A record that ends up saying nothing is removed rather than kept as a husk,
   * so the map holds copies the user has actually decided something about and a
   * count of records is a count of decisions. A record holding only cleared
   * preferences still says something and stays.
   */
  function updateMonsterPreferences(scope: MonsterProfileScope, unitId: string, next: MonsterCopyPreferences) {
    changePreferences((current) => ({ ...current, monsterPreferences: withProfile(current.monsterPreferences, scope, unitId, next) }));
  }

  /* The rune overlay's one route to storage. A rune left holding nothing is
     removed, so the map counts decisions rather than runes once opened. */
  function updateRuneHold(runeId: string, next: RuneHold) {
    changePreferences((current) => {
      const runeHolds = { ...current.runeHolds };
      if (runeHoldVerdict(next) !== null) runeHolds[runeId] = next;
      else delete runeHolds[runeId];
      return { ...current, runeHolds };
    });
  }

  /* Gems & Grinds' one route to storage for Ignore and Reset ignored: `null`
     clears the view's list, an entry adds to it. */
  function updateCraftIgnores(view: CraftIgnoreView, entry: CraftIgnore | null) {
    changePreferences((current) => ({ ...current, craftIgnores: entry === null
      ? { ...current.craftIgnores, [view]: [] }
      : withCraftIgnore(current.craftIgnores, view, entry) }));
  }

  function updateHardwareAcceleration(enabled: boolean) {
    changePreferences((current) => ({ ...current, hardwareAcceleration: enabled }));
  }

  function updateDirectImportMode(mode: DirectImportMode) {
    if (mode === preferences.directImportMode) return;
    setPendingDirectImportMode(mode);
  }

  function confirmDirectImportMode() {
    if (!pendingDirectImportMode) return;
    const mode = pendingDirectImportMode;
    setPendingDirectImportMode(null);
    /* Turning synchronization on promises to overwrite the current game data,
       so the next poll imports even when the helper's snapshot is unchanged. */
    if (mode === 'live') forgetAppliedHelperImport();
    changePreferences((current) => ({ ...current, directImportMode: mode }));
  }

  function updateImportRoute(route: ImportRoute) {
    if (route === preferences.importRoute) return;
    /* Switching a live source while data is loaded can immediately replace
       changes made in JASWA, so let the user approve that source change first. */
    if (game && preferences.directImportMode === 'live') {
      setPendingImportRoute(route);
      return;
    }
    switchImportRoute(route);
  }

  function confirmImportRoute() {
    if (!pendingImportRoute) return;
    const route = pendingImportRoute;
    setPendingImportRoute(null);
    switchImportRoute(route);
  }

  /* Choosing the direct route is choosing the helper's data, in either sync
     mode: whatever the workspace held before is replaced by the next poll. */
  function switchImportRoute(route: ImportRoute) {
    if (route === 'direct') forgetAppliedHelperImport();
    changePreferences((current) => ({ ...current, importRoute: route }));
  }

  function updateGeneralSettings(update: Partial<GeneralSettings>) {
    changePreferences((current) => ({ ...current, general: { ...current.general, ...update } }));
  }

  async function pickSaveFolder() {
    const handle = await chooseSaveFolder();
    /* A dismissed picker returns nothing and must leave the current folder
       alone rather than clearing it. */
    if (handle) setSaveFolder(handle);
  }

  async function dropSaveFolder() {
    try {
      await forgetSaveFolder();
      setSaveFolder(null);
    } catch {
      setMessage('JASWA could not forget this folder. Please try again.');
    }
  }

  /* One writer for both file kinds: it uses the chosen folder when there is
     one and falls back to the browser's download when there is not, so the
     user always ends up with the file. */
  async function saveFile(filename: string, content: string) {
    if (await writeToSaveFolder(saveFolder, filename, content)) {
      setMessage(`Saved ${filename} to ${saveFolder?.name}.`);
      return;
    }
    downloadJson(filename, content);
  }

  function updateRunePotentialSettings(update: Partial<RunePotentialSettings>) {
    changePreferences((current) => ({
      ...current,
      runePotential: { ...current.runePotential, ...update },
    }));
  }

  function updateRuneOptimizationSettings(update: Partial<RuneOptimizationSettings>) {
    changePreferences((current) => ({
      ...current,
      runeOptimization: { ...current.runeOptimization, ...update },
    }));
  }

  function updateArtifactSettings(update: Partial<ArtifactSettings>) {
    changePreferences((current) => ({
      ...current,
      artifacts: { ...current.artifacts, ...update },
    }));
  }

  /* The Speed Tuning page's one route to storage — a named wrapper over
     `changePreferences`, like the monster overlay's. */
  function writeSpeedTuning(change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) {
    changePreferences((current) => ({ ...current, speedTuning: change(current.speedTuning) }));
  }

  /* The Presets page's routes to storage: Scenario's list, a game preset's
     order, and the presets built in JASWA. */
  const presetWrites: PresetWrites = {
    monsterPriority(change: (current: MonsterPriority) => MonsterPriority) {
      changePreferences((current) => ({ ...current, monsterPriority: change(current.monsterPriority) }));
    },
    presetOrder(presetId: string, order: readonly string[]) {
      changePreferences((current) => ({ ...current, presetPriority: { ...current.presetPriority, [presetId]: [...order] } }));
    },
    ownPresets(change: (current: OwnPreset[]) => OwnPreset[]) {
      changePreferences((current) => {
        const next = change(current.presets);
        const kept = new Map(next.map((entry) => [entry.id, entry]));
        let read: Preferences = { ...current, presets: next };
        for (const entry of current.presets) {
          if (!kept.has(entry.id)) read = withoutPreset(read, entry.id);
        }
        return read;
      });
    },
    async deleteGamePreset(presetId: string) {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) return;
      if (await changeGamePreset((current) => deleteGamePreset(current, preset))) {
        changePreferences((current) => withoutPreset(current, presetId));
      }
    },
    async leadGamePreset(presetId: string, unitId: string | null) {
      const preset = presets.find((entry) => entry.id === presetId);
      if (preset) await changeGamePreset((current) => leadGamePreset(current, preset, unitId));
    },
    async addToGamePreset(presetId: string, unitId: string) {
      const preset = presets.find((entry) => entry.id === presetId);
      const fallback = presets.find((entry) => entry.kind === 'scenario');
      if (preset && fallback) await changeGamePreset((current) => addToGamePreset(current, preset, fallback, unitId));
    },
    /* Removing a team member leaves its area profile intact. */
    async removeFromGamePreset(presetId: string, unitId: string) {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset || !await changeGamePreset((current) => removeFromGamePreset(current, preset, unitId))) return;
      changePreferences((current) => ({
        ...current,
        presetPriority: current.presetPriority[presetId] === undefined ? current.presetPriority
          : { ...current.presetPriority, [presetId]: current.presetPriority[presetId].filter((entry) => entry !== unitId) },
      }));
    },
  };

  /* A leader chosen outside the Presets page, through the same routes as its crown. */
  async function leadPreset(presetId: string, unitId: string | null) {
    const preset = presets.find((entry) => entry.id === presetId);
    if (preset?.kind === 'own') {
      presetWrites.ownPresets((current) => current.map((entry) => (entry.id === presetId ? { ...entry, leaderUnitId: unitId } : entry)));
    } else if (preset?.kind === 'game') await presetWrites.leadGamePreset(presetId, unitId);
  }

  /* A game preset lives in the import, so a change to one is saved there, as an
     engrave is; live sync would put the game's own back at once, so it refuses. */
  async function changeGamePreset(change: (current: ImportedGame) => ImportedGame): Promise<boolean> {
    if (!game || !canEngrave) return false;
    try {
      const next = change(game);
      await saveImportedGame(next);
      setGame(next);
      setMessage('');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JASWA could not save this preset. Please try again.');
      return false;
    }
  }

  /* Remount the search when this route starts inside Rune Optimization too:
     a build and its monster overlay can both be open over the current search.
     The preset travels with the monster: a build is always for one preset. */
  function optimizeMonster(unitId: string, presetId?: string) {
    if (presetId !== undefined) setSelectedPreset(presetId);
    writeSessionValue(runeOptimizationMonsterKey, unitId);
    closeEveryOverlay();
    setOptimizerVisit((visit) => visit + 1);
    setPage('optimizer');
  }

  function writeRoles(change: (current: RuneRole[]) => RuneRole[]) {
    changePreferences((current) => ({ ...current, runeRoles: change(current.runeRoles) }));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void selectGameFile(event.dataTransfer.files[0]);
  }

  async function handleSettingsImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = await importPreferencesFile(file);
      try {
        await savePreferences(next);
      } catch {
        setMessage('JASWA could not save these preferences. Please try again.');
        return;
      }
      preferencesRef.current = next;
      setPreferences(next);
      setMessage('Your preferences were loaded.');
    } catch {
      setMessage('JASWA could not read this settings file. Please choose a .sw file exported from JASWA.');
    } finally {
      event.target.value = '';
    }
  }

  function openReport(category: ReportCategory = 'Other', details = '') {
    setReport({ category, details });
  }

  function sendReport() {
    if (!report) return;
    const counts = game ? accountCounts(game.data) : null;
    const diagnostics = [
      `Page: ${page}`,
      `Import route: ${preferences.importRoute}`,
      `Direct import mode: ${preferences.directImportMode}`,
      `Hardware acceleration: ${preferences.hardwareAcceleration ? 'enabled' : 'disabled'}`,
      `Helper state: ${helperConnection.state}`,
      `Helper version: ${helperConnection.version ?? 'unknown'}`,
      `Helper update available: ${helperConnection.updateAvailable ? 'yes' : 'no'}`,
      `Helper session: ${helperConnection.instanceId || 'none'} / ${helperConnection.sessionId}`,
      `Helper detail: ${helperConnection.detail}`,
      `Browser: ${navigator.userAgent}`,
      game ? `Active import: ${game.fileName} (imported ${formatDateTime(game.importedAt, preferences.general)})` : 'Active import: none',
      counts ? `Account counts: monsters ${counts.monsters}, runes ${counts.runes}, gems and grinds ${counts.gemsAndGrinds}, artifacts ${counts.artifacts}, relics ${counts.relics}` : 'Account counts: none',
      game ? `Unknown monster types: ${game.report.unknownMonsterIds.length ? game.report.unknownMonsterIds.join(', ') : 'none'}` : 'Unknown monster types: none',
      message ? `Latest app message: ${message}` : 'Latest app message: none',
    ].join('\n');
    const body = `Hello,\n\nI found an issue in JASWA.\n\nIssue type: ${report.category}\n\nWhat happened:\n${report.details || 'Please describe what JASWA did and what you expected.'}\n\nJASWA diagnostics:\n${diagnostics}\n\nJASWA does not attach the full game data to this e-mail.`;
    window.location.href = `mailto:bj.elling@gmail.com?subject=${encodeURIComponent(`JASWA issue: ${report.category}`)}&body=${encodeURIComponent(body)}`;
    setReport(null);
  }

  if (!ready) return <main className="loading-screen">Preparing your local workspace…</main>;

  return <PresetsContext.Provider value={presetsReading}><main className="app-shell">
    <AppRail page={page} onNavigate={(next) => { closeEveryOverlay(); setPage(next); }} onReport={() => openReport()} />

    <section className="workspace">
      {game && <ImportBadge ref={importBadge} game={game} general={preferences.general} />}
      <CornerNotices badge={importBadge} badgeShown={game !== null}
        reload={preferences.importRoute === 'direct' && preferences.directImportMode === 'on-load'}
        reloadError={helperReloadError}
        reloading={reloadingHelper} onReload={() => void reloadHelper.current?.(true)}
        helperUpdate={helperUpdateDue}
        importStopped={game ? liveImportStopped : null}
        confirmation={importConfirmation && (page === 'home' || importConfirmation.manual) ? importConfirmation.game : null} general={preferences.general} />

      {page === 'home' && <HomeSection
        game={game}
        message={message}
        dragging={dragging}
        onPickFile={() => gameInput.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onRemove={() => setRemoveGameDataPrompt(true)}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onHardwareAcceleration={updateHardwareAcceleration}
        directImportMode={preferences.directImportMode}
        onDirectImportMode={updateDirectImportMode}
        importRoute={preferences.importRoute}
        onImportRoute={updateImportRoute}
        helperConnection={helperConnection}
        general={preferences.general}
      />}

      {page === 'monster-stats' && <Suspense fallback={<WorkspaceLoading />}><MonsterStats monsters={monsters} gameData={game?.data ?? {}} presets={presets} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}
      {page === 'monster-numbers' && <Suspense fallback={<WorkspaceLoading />}><MonsterNumbers monsters={monsters} gameData={game?.data ?? {}} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}

      {page === 'artifact-list' && <Suspense fallback={<WorkspaceLoading />}><ArtifactList game={game} monsters={monsters} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}

      {page === 'rune-setup' && <Suspense fallback={<WorkspaceLoading />}><RuneSetupSection
        game={game}
        settings={preferences.runePotential}
        roles={preferences.runeRoles}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onUpdate={updateRunePotentialSettings}
        onWriteRoles={writeRoles}
      /></Suspense>}

      {page === 'potential' && <Suspense fallback={<WorkspaceLoading />}><RunePotentialSection
        key={String(runeCleanupAccount)}
        session={runeCleanupSession}
        onUpdate={updateRunePotentialSettings}
        game={game}
        profiles={preferences.monsterPreferences}
        runeHolds={preferences.runeHolds}
        lockedRunes={lockedRunes}
        settings={preferences.runePotential}
        roles={preferences.runeRoles}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onOpenRune={openRuneOverlay}
      /></Suspense>}

      {page === 'artifacts' && <Suspense fallback={<WorkspaceLoading />}><ArtifactsSection
        settings={preferences.artifacts}
        data={game?.data}
        monsters={monsters}
        scenarioProfiles={profilesIn(preferences.monsterPreferences, scenarioPresetId)}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onUpdate={updateArtifactSettings}
      /></Suspense>}

      {page === 'settings' && <Suspense fallback={<WorkspaceLoading />}><SettingsSection
        general={preferences.general}
        saveFolder={saveFolder?.name ?? null}
        canChooseFolder={canChooseSaveFolder()}
        onGeneralChange={updateGeneralSettings}
        onChooseFolder={() => void pickSaveFolder()}
        onForgetFolder={() => void dropSaveFolder()}
        onExport={() => void saveFile('jaswa-preferences.sw', JSON.stringify(preferences, null, 2))}
        onImport={() => setLoadPreferencesPrompt(true)}
      /></Suspense>}

      {page === 'the-math' && <Suspense fallback={<WorkspaceLoading />}><TheMathSection /></Suspense>}

      {RuneSimulatorSection && page === 'rune-simulator' && <Suspense fallback={<WorkspaceLoading />}><RuneSimulatorSection
        game={game}
        settings={preferences.runePotential}
        roles={preferences.runeRoles}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onOpenRune={openRuneOverlay}
      /></Suspense>}

      {page === 'relics' && <Suspense fallback={<WorkspaceLoading />}><RelicList game={game} monsters={monsters} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}

      {page === 'gems' && <Suspense fallback={<WorkspaceLoading />}><GemsSection
        game={game}
        roles={preferences.runeRoles}
        preferences={preferences}
        onOpenRune={openRuneOverlay}
        onIgnoreCraft={updateCraftIgnores}
      /></Suspense>}

      {page === 'speed' && <Suspense fallback={<WorkspaceLoading />}><SpeedTuningSection
        game={game}
        monsters={monsters}
        preferences={preferences}
        presets={presets}
        onWrite={writeSpeedTuning}
        onOpenTeam={openSpeedTeam}
      /></Suspense>}

      {page === 'presets' && <Suspense fallback={<WorkspaceLoading />}><PresetsSection
        game={game}
        monsters={monsters}
        preferences={preferences}
        presets={presets}
        selectedId={selectedPreset}
        canCreate={canEngrave}
        onSelect={setSelectedPreset}
        onWrite={presetWrites}
        onOpenMonster={openMonsterOverlay}
        onOptimize={(presetId, unitId) => optimizeMonster(unitId, presetId)}
        onTuneSpeed={openSpeedTeam}
      /></Suspense>}

      {page === 'optimizer' && <Suspense fallback={<WorkspaceLoading />}><RuneOptimizationSection
        key={optimizerVisit}
        game={game}
        monsters={monsters}
        preferences={preferences}
        presets={presets}
        presetId={selectedPreset}
        onSelectPreset={setSelectedPreset}
        onUpdate={updateRuneOptimizationSettings}
        canEngrave={canEngrave}
        onEngrave={engraveBuild}
        runeLocks={runeLocks}
        onLock={lockRune}
        onOpenMonster={openMonsterOverlay}
        onOpenStatistics={openMonsterStatistics}
        onOpenRune={openRuneOverlay}
        onTuneSpeed={openSpeedTeam}
      /></Suspense>}
    </section>

    <input ref={gameInput} type="file" accept="application/json,.json" hidden
      onChange={(event) => { void selectGameFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={settingsInput} type="file" accept=".sw,application/json" hidden
      onChange={(event) => void handleSettingsImport(event)} />

    {pendingGame && <ReplaceImportDialog
      pendingGame={pendingGame}
      onCancel={() => setPendingGame(null)}
      onReplace={() => void applyFileImport(pendingGame)}
    />}

    {pendingDirectImportMode && <DirectImportModeDialog
      mode={pendingDirectImportMode}
      onCancel={() => setPendingDirectImportMode(null)}
      onConfirm={confirmDirectImportMode}
    />}

    {pendingImportRoute && <DirectImportModeDialog
      mode="live"
      onCancel={() => setPendingImportRoute(null)}
      onConfirm={confirmImportRoute}
    />}

    {loadPreferencesPrompt && <LoadPreferencesDialog
      onCancel={() => setLoadPreferencesPrompt(false)}
      onConfirm={() => { setLoadPreferencesPrompt(false); settingsInput.current?.click(); }}
    />}

    {removeGameDataPrompt && <RemoveGameDataDialog
      onCancel={() => setRemoveGameDataPrompt(false)}
      onConfirm={() => { setRemoveGameDataPrompt(false); void removeImport(); }}
    />}

    {/* Before the monster overlay, which a member's name opens on top of it. */}
    {speedTeam !== null && <Suspense fallback={null}><PresetSpeedTeamOverlay
      key={speedTeam}
      presetId={speedTeam}
      game={game}
      monsters={monsters}
      preferences={preferences}
      presets={presets}
      canChangePresets={canEngrave}
      onWrite={writeSpeedTuning}
      onLead={(presetId, unitId) => void leadPreset(presetId, unitId)}
      onClose={closeSpeedTeam}
      onOpenMonster={openMonsterOverlay}
    /></Suspense>}

    {overlay?.kind === 'monster' && <Suspense fallback={null}><MonsterOverlay
      target={overlay.target}
      game={game?.data}
      general={preferences.general}
      profiles={preferences.monsterPreferences}
      onSave={updateMonsterPreferences}
      onClose={closeOverlay}
      presetId={overlay.presetId ?? scenarioPresetId}
      onOptimize={optimizeMonster}
      onOpenStatistics={openMonsterStatistics}
    /></Suspense>}

    {/* After the monster profile, which opens it on top of itself. */}
    {statisticsMonster !== null && <Suspense fallback={null}><MonsterStatisticsOverlay
      key={statisticsMonster}
      masterId={statisticsMonster}
      general={preferences.general}
      onClose={closeMonsterStatistics}
    /></Suspense>}

    {overlayRune && <Suspense fallback={null}><RuneOverlay
      rune={overlayRune}
      game={game?.data}
      profiles={preferences.monsterPreferences}
      general={preferences.general}
      settings={preferences.runePotential}
      roles={preferences.runeRoles}
      hardwareAcceleration={preferences.hardwareAcceleration}
      hold={preferences.runeHolds[overlayRune.id]}
      onHold={overlay?.kind === 'rune' && overlay.target.kind === 'account' ? updateRuneHold : undefined}
      locked={overlayRune.occupiedId !== null
        && runeLockOf(runeLocks, scenarioPresetId, overlayRune.occupiedId, overlayRune.id) === 'locked'}
      canLock={canEngrave}
      onLock={(runeId, unitId, on) => lockRune(scenarioPresetId, unitId, runeId, on ? 'locked' : null)}
      onClose={closeOverlay}
    /></Suspense>}

    {report && <ReportDialog
      report={report}
      onChange={setReport}
      onCancel={() => setReport(null)}
      onSend={sendReport}
    />}
  </main></PresetsContext.Provider>;
}
