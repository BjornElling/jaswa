import { lazy, Suspense, type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppRail } from './app-rail';
import { HomeSection } from '../features/home/home-section';
import { CornerNotices, ImportBadge } from '../features/home/import-badge';
import { DirectImportModeDialog, LoadPreferencesDialog, RemoveGameDataDialog, ReplaceImportDialog, ReportDialog } from '../features/home/import-dialogs';
import { browserWorkspaceRepository } from '../platform/browser-storage';
import { createWriterCoordination } from '../platform/writer-coordination';
import { helperPreferenceSharing } from '../platform/shared-preferences';
import { createPreferenceSharing } from '../workspace/shared-preferences';
import { PreferenceSharingSettings } from '../features/settings/preference-sharing-settings';
import { PreferenceStoreUnreadable } from '../workspace/ports';
import { createImportedGame, validateGameFile } from '../ingest/game-export';
import { downloadJson, fileToText } from '../platform/files';
import { readPreferencesFile } from '../ingest/preferences';
import { canEngraveUnder, createWorkspaceStore, withoutPreset } from '../workspace/workspace-store';
import { checkHelperConnection, readHelperProfile, silentHelper } from '../platform/helper-client';
import { helperStatusMessage } from '../workspace/helper-status';
import { detectGraphicsCard } from '../platform/hardware-acceleration';
import { formatDateTime } from '../domain/shared/formatting';
import { canChooseSaveFolder, chooseSaveFolder, forgetSaveFolder, loadSaveFolder, writeToSaveFolder } from '../platform/save-location';
import type { DirectoryHandle } from '../platform/save-location';
import type { ArtifactSettings, DirectImportMode, GeneralSettings, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from '../domain/model';
import type { RuneRole } from '../domain/profiles/rune-roles';
import type { RuneOptimizationSettings } from '../domain/profiles/rune-optimization-settings';
import { runeOptimizationMonsterKey } from '../domain/profiles/rune-optimization-settings';
import type { SpeedTuningPreferences } from '../domain/profiles/speed-tuning-preferences';
import { createRuneCleanupSession } from '../features/rune-cleanup/rune-cleanup-session';
import { addToGamePreset, deleteGamePreset, leadGamePreset, removeFromGamePreset } from '../domain/placements/game-preset-edits';
import { usePageHistory } from './page-history';
import type { MonsterCopyPreferences } from '../domain/profiles/monster-preferences';
import type { MonsterProfileScope } from '../domain/profiles/monster-profile-scope';
import type { MonsterPriority } from '../domain/profiles/monster-priority';
import { scenarioPresetId, engravings, readPresets, selectedPresetKey } from '../domain/placements/presets';
import { PresetsContext } from '../ui/presets-context';
import { summarizeRunePlacement } from '../domain/placements/rune-placement';
import type { OwnPreset, Preset } from '../domain/placements/presets';
import type { PresetWrites } from '../features/presets/presets-section';
import { profilesIn, withProfile } from '../domain/profiles/monster-preferences';
import type { RelicSynergyChoices } from '../domain/relics/relic-synergy';
import type { RelicInvestmentSelectivity } from '../domain/relics/relic-advice';
import type { RuneHold } from '../domain/profiles/rune-holds';
import { runeHoldVerdict } from '../domain/profiles/rune-holds';
import type { CraftIgnore } from '../domain/profiles/craft-ignores';
import { withCraftIgnore } from '../domain/profiles/craft-ignores';
import type { CraftViewChoice, CraftViewMode } from '../domain/profiles/craft-view-choices';
import { heldRuneLocks, lockedRuneIds, noRuneLocks, runeLockOf } from '../domain/placements/rune-locks';
import type { RuneLock } from '../domain/placements/rune-locks';
import type { MonsterReference, OpenMonsterOverlay } from '../ui/gear/monster-link';
import type { OpenRuneOverlay, RuneOverlayTarget } from '../ui/gear/rune-link';
import type { OpenSpeedTeamOverlay } from '../features/presets/preset-speed-team-overlay';
import type { OpenMonsterStatistics } from '../features/monsters/game-statistics-button';
import { useSessionStorageState, writeSessionValue } from '../ui/session-state';
import { pageChoices, type Page, type ReportCategory } from '../workspace/workspace-config';
import { createDirectImportController } from '../workspace/direct-import-controller';
import { provideRuneSimulatorFactory, provideWorkerFactories } from '../workspace/jobs/worker-factories';
import { featureWorkerFactories } from '../platform/feature-workers';

/* The composition root: the one place workspace ports meet their browser adapters. */
provideWorkerFactories(featureWorkerFactories);
/* Loaded only in development, so the simulator's worker never enters a production build. */
if (import.meta.env.DEV) void import('../platform/rune-simulator-factory').then(({ createRuneSimulatorWorker }) => provideRuneSimulatorFactory(createRuneSimulatorWorker));
const workspaceStore = createWorkspaceStore(browserWorkspaceRepository, createWriterCoordination());
const preferenceSharing = createPreferenceSharing(workspaceStore, helperPreferenceSharing);
const directImportController = createDirectImportController(silentHelper);

const isPage = (value: unknown): value is Page => typeof value === 'string' && pageChoices.includes(value as Page);
const isString = (value: unknown): value is string => typeof value === 'string';
const ArtifactList = lazy(() => import('../features/artifacts/artifact-list').then(({ ArtifactList: component }) => ({ default: component })));
const ArtifactsSection = lazy(() => import('../features/artifacts/artifacts-section').then(({ ArtifactsSection: component }) => ({ default: component })));
const GemsSection = lazy(() => import('../features/craft-advice/gems-section').then(({ GemsSection: component }) => ({ default: component })));
const MonsterStats = lazy(() => import('../features/monsters/monster-stats').then(({ MonsterStats: component }) => ({ default: component })));
const MonsterNumbers = lazy(() => import('../features/monsters/monster-numbers').then(({ MonsterNumbers: component }) => ({ default: component })));
const RelicList = lazy(() => import('../features/relics/relic-list').then(({ RelicList: component }) => ({ default: component })));
const RunePotentialSection = lazy(() => import('../features/rune-cleanup/rune-potential-section').then(({ RunePotentialSection: component }) => ({ default: component })));
const SettingsSection = lazy(() => import('../features/settings/settings-section').then(({ SettingsSection: component }) => ({ default: component })));
const TheMathSection = lazy(() => import('../features/the-math/the-math-section').then(({ TheMathSection: component }) => ({ default: component })));
const RuneSimulatorSection = import.meta.env.DEV ? lazy(() => import('../features/rune-simulator/rune-simulator-section').then(({ RuneSimulatorSection: component }) => ({ default: component }))) : null;
const SpeedTuningSection = lazy(() => import('../features/speed-tuning/speed-tuning-section').then(({ SpeedTuningSection: component }) => ({ default: component })));
const PresetsSection = lazy(() => import('../features/presets/presets-section').then(({ PresetsSection: component }) => ({ default: component })));
const RuneOptimizationSection = lazy(() => import('../features/rune-optimization/rune-optimization-section').then(({ RuneOptimizationSection: component }) => ({ default: component })));
const MonsterOverlay = lazy(() => import('../features/monsters/monster-overlay').then(({ MonsterOverlay: component }) => ({ default: component })));
const RuneOverlay = lazy(() => import('../features/runes/rune-overlay').then(({ RuneOverlay: component }) => ({ default: component })));
const MonsterStatisticsOverlay = lazy(() => import('../features/monsters/monster-statistics-overlay').then(({ MonsterStatisticsOverlay: component }) => ({ default: component })));
const PresetSpeedTeamOverlay = lazy(() => import('../features/presets/preset-speed-team-overlay').then(({ PresetSpeedTeamOverlay: component }) => ({ default: component })));

type OverlayTarget =
  | { kind: 'monster'; target: MonsterReference; presetId?: string }
  | { kind: 'rune'; target: RuneOverlayTarget };

function WorkspaceLoading() {
  return <section className="panel" aria-busy="true"><p className="lead">Opening workspace…</p></section>;
}

export default function Home() {
  const [page, setStoredPage] = useSessionStorageState<Page>('jaswa.navigation.page', 'home', isPage);
  const workspace = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, workspaceStore.getSnapshot);
  const { game, preferences, ready } = workspace;
  const sharing = useSyncExternalStore(preferenceSharing.subscribe, preferenceSharing.getSnapshot, preferenceSharing.getSnapshot);
  const storageNotice = workspace.storageNotice ?? (sharing.state === 'conflict'
    ? { tone: 'warn' as const, message: 'Your local and shared personalization have conflicting choices. Open Settings to choose which copy to keep.' } : null);
  useEffect(() => {
    const poll = () => { void preferenceSharing.synchronize(); };
    poll();
    const timer = window.setInterval(poll, 2_000);
    return () => window.clearInterval(timer);
  }, [ready]);
  const runeCleanupAccount = game?.snapshot.accountId ?? null;
  const runeCleanupSession = useMemo(() => createRuneCleanupSession(runeCleanupAccount), [runeCleanupAccount]);
  const [pendingGame, setPendingGame] = useState<ImportedGame | null>(null);
  const [importConfirmation, setImportConfirmation] = useState<{ game: ImportedGame; manual: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<{ category: ReportCategory; details: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removeGameDataPrompt, setRemoveGameDataPrompt] = useState(false);
  const [loadPreferencesPrompt, setLoadPreferencesPrompt] = useState(false);
  const [pendingDirectImportMode, setPendingDirectImportMode] = useState<DirectImportMode | null>(null);
  const [pendingImportRoute, setPendingImportRoute] = useState<ImportRoute | null>(null);
  const directImport = useSyncExternalStore(directImportController.subscribe, directImportController.getSnapshot, directImportController.getSnapshot);
  const { connection: helperConnection, reloading: reloadingHelper, reloadError: helperReloadError, importStopped: liveImportStopped } = directImport;
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
  /* The import badge's own box, so the confirmation that opens in the same
     corner can measure what it has to clear rather than assume a height. */
  const importBadge = useRef<HTMLElement | null>(null);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void workspaceStore.restore().then(() => {
      const restored = workspaceStore.getSnapshot();
      if (restored.restoreFailed.length) setMessage('JASWA could not read part of the saved workspace. Reload to try again.');
      else if (restored.gameRejected) setMessage('Your saved import no longer passes JASWA’s import checks, so it is not shown. Import your account again.');
    });
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
    if (!ready || preferences.importRoute !== 'direct') {
      directImportController.stop();
      return;
    }
    directImportController.start({
      route: preferences.importRoute,
      mode: preferences.directImportMode,
      getGame: () => workspaceStore.getSnapshot().game,
      checkConnection: checkHelperConnection,
      readProfile: readHelperProfile,
      helperStatusMessage,
      createImportedGame: (profile, connection) => createImportedGame('JASWA Helper — Steam', profile.data,
        validateGameFile(profile.data), { instanceId: profile.instanceId, sessionId: profile.sessionId }, {
          complete: connection.missedChanges.length === 0,
          misses: connection.missedChanges.map(({ command, cause }) => ({ command, cause })),
        }),
      importAccount: (imported, options) => workspaceStore.importAccount(imported, options),
      onAccepted: (imported, manual) => {
        setImportConfirmation({ game: imported, manual });
        setPendingGame(null);
        setMessage('');
      },
      onMessage: setMessage,
    });
    return () => directImportController.stop();
  }, [preferences.directImportMode, preferences.importRoute, ready]);

  /* The poll stops when the route leaves direct import, and the last answer it
     gave stays in state. Read alone, that answer kept the update warning up on
     the file route, where no helper is being asked anything. */
  const helperUpdateDue = preferences.importRoute === 'direct' && helperConnection.updateAvailable;

  const monsters = useMemo(
    () => game ? game.snapshot.monsters.map((monster) => monster.record) : [],
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
  const canEngrave = canEngraveUnder(preferences);
  /* The locks every page reads: only those that still hold against the placement
     on screen (`heldRuneLocks`). Live sync keeps them too — they shape the
     search, and the game is never asked to obey them. */
  const runeLocks = useMemo(() => (game?.runeLocks ? heldRuneLocks(game.runeLocks, presets) : noRuneLocks),
    [game, presets]);
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
      ? game?.snapshot.runes.find((entry) => entry.id === runeTarget.runeId)
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
    directImportController.resetObservation();
  }

  async function applyFileImport(imported: ImportedGame) {
    try {
      const next = await workspaceStore.importAccount(imported);
      if (next === null) return;
      setImportConfirmation({ game: next, manual: false });
      setPendingGame(null);
      setMessage('');
      forgetAppliedHelperImport();
    } catch {
      setMessage('JASWA could not save this import. Please try again.');
    }
  }

  async function removeImport() {
    try {
      await workspaceStore.removeAccount();
      forgetAppliedHelperImport();
      setMessage('');
    } catch {
      setMessage('JASWA could not remove the saved import. Please try again.');
    }
  }

  /* The store's commands decide; the shell only says where the user acted. */
  async function engraveBuild(presetId: string, unitId: string, candidate: import('../domain/runes/optimization/rune-optimization-refresh').BuildEngraving): Promise<void> {
    try {
      await workspaceStore.engraveBuild(presetId, unitId, candidate);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JASWA could not save this build. Please try again.');
      throw error;
    }
  }

  async function lockRune(presetId: string, unitId: string, runeId: string, lock: RuneLock | null): Promise<void> {
    try {
      await workspaceStore.lockRune(presetId, unitId, runeId, lock);
      setMessage('');
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'JASWA could not save this lock. Please try again.';
      setMessage(failure);
      throw error;
    }
  }

  /* Every preference choice goes through the store's one route, which applies it
     to the latest choices and says on its own notice when this tab may not write. */
  function changePreferences(change: (current: Preferences) => Preferences) {
    workspaceStore.changePreferences(change);
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
     is. Only the rail, Optimize, a team's Edit preset and Rune Optimization's Preset change the page, and
     each closes it. */
  const openSpeedTeam: OpenSpeedTeamOverlay = (presetId, opener) => {
    speedTeamOpener.current = opener;
    setSpeedTeam(presetId);
  };

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
   * count of records is a count of decisions. A record holding only a cleared
   * rune list still says something and stays; emptied gear answers say nothing.
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

  /* Every Gems & Grinds view writes the same choices; reset clears them all. */
  function updateCraftIgnores(entry: CraftIgnore | null) {
    changePreferences((current) => ({ ...current, craftIgnores: entry === null
      ? [] : withCraftIgnore(current.craftIgnores, entry) }));
  }

  /* Each view keeps its own question and filters; a change to one never touches another. */
  function updateCraftView(mode: CraftViewMode, update: (current: CraftViewChoice) => CraftViewChoice) {
    changePreferences((current) => ({ ...current, craftViews: { ...current.craftViews, [mode]: update(current.craftViews[mode]) } }));
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

  /* The synergy editor's one route to storage. It saves the cells that differ
     from the shipped judgement, so Reset to defaults saves an empty record. */
  function updateRelicSynergy(relicSynergy: RelicSynergyChoices) {
    changePreferences((current) => ({ ...current, relicSynergy }));
  }

  function updateRelicPowerUpThreshold(relicPowerUpThreshold: RelicInvestmentSelectivity) {
    changePreferences((current) => ({ ...current, relicPowerUpThreshold }));
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
      await changeGamePreset(presetId, (current, preset) => deleteGamePreset(current, preset),
        (current) => withoutPreset(current, presetId));
    },
    async leadGamePreset(presetId: string, unitId: string | null) {
      await changeGamePreset(presetId, (current, preset) => leadGamePreset(current, preset, unitId));
    },
    async addToGamePreset(presetId: string, unitId: string) {
      await changeGamePreset(presetId, (current, preset, fallback) => addToGamePreset(current, preset, fallback, unitId));
    },
    /* Removing a team member leaves its area profile intact. */
    async removeFromGamePreset(presetId: string, unitId: string) {
      await changeGamePreset(presetId, (current, preset) => removeFromGamePreset(current, preset, unitId), (current) => {
        const order = current.presetPriority[presetId];
        return !order?.includes(unitId) ? current : {
          ...current, presetPriority: { ...current.presetPriority, [presetId]: order.filter((entry) => entry !== unitId) },
        };
      });
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
  async function changeGamePreset(presetId: string, change: (current: ImportedGame, preset: Preset, scenario: Preset) => ImportedGame,
    preferenceChange?: (current: Preferences) => Preferences): Promise<boolean> {
    try {
      const changed = await workspaceStore.changeGamePreset(presetId, change, preferenceChange);
      if (changed) setMessage('');
      return changed;
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

  /* A control naming a page: it leaves the team for Presets, with its preset chosen. */
  function editPreset(presetId: string) {
    setSelectedPreset(presetId);
    closeEveryOverlay();
    setPage('presets');
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
      const next = readPreferencesFile(await fileToText(file), workspaceStore.getSnapshot().game);
      try {
        const result = await workspaceStore.replacePreferences(next);
        setMessage(result.mirrorSaved
          ? 'Your preferences were loaded.'
          : 'Your preferences were loaded, but their quick recovery copy could not be saved.');
      } catch (error) {
        setMessage(error instanceof PreferenceStoreUnreadable
          ? 'Reload to read your saved preferences before changing them.'
          : 'JASWA could not save these preferences. Please try again.');
      }
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
    const counts = game?.snapshot.counts ?? null;
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
        reloading={reloadingHelper} onReload={() => void directImportController.refresh(true)}
        helperUpdate={helperUpdateDue}
        importStopped={game ? liveImportStopped : null}
        connectionError={preferences.importRoute === 'direct' && (helperConnection.state === 'unavailable' || helperConnection.restartRequired) ? helperStatusMessage(helperConnection) : null}
        missedChanges={game && preferences.importRoute === 'direct' && helperConnection.state === 'ready' ? helperConnection.missedChanges : []}
        confirmation={importConfirmation && (page === 'home' || importConfirmation.manual) ? importConfirmation.game : null} general={preferences.general} storageNotice={storageNotice} />

      {page === 'home' && <HomeSection
        game={game}
        message={message}
        dragging={dragging}
        onPickFile={() => gameInput.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onRemove={() => setRemoveGameDataPrompt(true)}
        directImportMode={preferences.directImportMode}
        onDirectImportMode={updateDirectImportMode}
        importRoute={preferences.importRoute}
        onImportRoute={updateImportRoute}
        helperConnection={helperConnection}
        general={preferences.general}
      />}

      {page === 'monster-stats' && <Suspense fallback={<WorkspaceLoading />}><MonsterStats monsters={monsters} gameData={game?.data ?? {}} snapshot={game?.snapshot} presets={presets} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}
      {page === 'monster-numbers' && <Suspense fallback={<WorkspaceLoading />}><MonsterNumbers monsters={monsters} snapshot={game?.snapshot} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}

      {page === 'artifact-list' && <Suspense fallback={<WorkspaceLoading />}><ArtifactList game={game} monsters={monsters} preferences={preferences} onOpenMonster={openMonsterOverlay} /></Suspense>}

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
        snapshot={game?.snapshot}
        monsters={monsters}
        scenarioProfiles={profilesIn(preferences.monsterPreferences, scenarioPresetId)}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
      /></Suspense>}

      {page === 'settings' && <Suspense fallback={<WorkspaceLoading />}><SettingsSection
        sharing={<PreferenceSharingSettings status={sharing}
          disabled={workspace.writer !== 'writer'}
          onChoose={(copy) => { void preferenceSharing.synchronize(copy); }} />}
        preferences={preferences}
        game={game}
        saveFolder={saveFolder?.name ?? null}
        canChooseFolder={canChooseSaveFolder()}
        detectGraphicsCard={detectGraphicsCard}
        onGeneralChange={updateGeneralSettings}
        onRunePotentialChange={updateRunePotentialSettings}
        onWriteRoles={writeRoles}
        onArtifactChange={updateArtifactSettings}
        onRelicSynergyChange={updateRelicSynergy}
        onRelicPowerUpThresholdChange={updateRelicPowerUpThreshold}
        onHardwareAcceleration={updateHardwareAcceleration}
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
        onCraftViewChange={updateCraftView}
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
        canChangeGamePresets={canEngrave}
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
        onEditPreset={editPreset}
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
      onEditPreset={editPreset}
    /></Suspense>}

    {overlay?.kind === 'monster' && <Suspense fallback={null}><MonsterOverlay
      target={overlay.target}
      game={game?.data}
      snapshot={game?.snapshot}
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
      snapshot={game?.snapshot}
      profiles={preferences.monsterPreferences}
      general={preferences.general}
      settings={preferences.runePotential}
      roles={preferences.runeRoles}
      hardwareAcceleration={preferences.hardwareAcceleration}
      hold={preferences.runeHolds[overlayRune.id]}
      onHold={overlay?.kind === 'rune' && overlay.target.kind === 'account' ? updateRuneHold : undefined}
      locked={overlayRune.occupiedId !== null
        && runeLockOf(runeLocks, scenarioPresetId, overlayRune.occupiedId, overlayRune.id) === 'locked'}
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
