import { lazy, Suspense, type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppRail } from './components/app-rail';
import { HomeSection } from './components/home-section';
import { ImportBadge } from './components/import-badge';
import { DirectImportModeDialog, LoadPreferencesDialog, RemoveGameDataDialog, ReplaceImportDialog, ReportDialog } from './components/import-dialogs';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/browser-storage';
import { blankPreferences, createImportedGame, fileToText, importPreferencesFile, isValidImportedGame, restoredPreferences, validateGameFile } from './lib/file-imports';
import { checkHelperConnection, readHelperProfile } from './lib/helper-client';
import type { HelperConnection } from './lib/helper-client';
import { downloadJson, formatDateTime } from './lib/formatting';
import { accountCounts } from './lib/account-counts';
import { canChooseSaveFolder, chooseSaveFolder, forgetSaveFolder, loadSaveFolder, writeToSaveFolder } from './lib/save-location';
import type { DirectoryHandle } from './lib/save-location';
import type { GameRecord } from './lib/game-data';
import type { ArtifactSettings, DirectImportMode, GeneralSettings, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from './lib/types';
import type { RunePotentialPreset } from './lib/rune-potential-presets';
import { useSessionStorageState } from './lib/session-storage-state';
import { type Page, type ReportCategory, upcomingWorkspaces } from './lib/workspace-config';

const pageChoices: readonly Page[] = ['home', 'monsters', 'artifact-list', 'optimizer', 'speed', 'potential', 'artifacts', 'gems', 'relics', 'settings'];
const isPage = (value: unknown): value is Page => typeof value === 'string' && pageChoices.includes(value as Page);
const ArtifactList = lazy(() => import('./components/artifact-list').then(({ ArtifactList: component }) => ({ default: component })));
const ArtifactsSection = lazy(() => import('./components/artifacts-section').then(({ ArtifactsSection: component }) => ({ default: component })));
const MonsterOverview = lazy(() => import('./components/monster-overview').then(({ MonsterOverview: component }) => ({ default: component })));
const RunePotentialSection = lazy(() => import('./components/rune-potential-section').then(({ RunePotentialSection: component }) => ({ default: component })));
const SettingsSection = lazy(() => import('./components/settings-section').then(({ SettingsSection: component }) => ({ default: component })));
const UpcomingWorkspace = lazy(() => import('./components/upcoming-workspace').then(({ UpcomingWorkspace: component }) => ({ default: component })));

function WorkspaceLoading() {
  return <section className="panel" aria-busy="true"><p className="lead">Opening workspace…</p></section>;
}

export default function Home() {
  const [page, setPage] = useSessionStorageState<Page>('jaswa.navigation.page', 'home', isPage);
  const [game, setGame] = useState<ImportedGame | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(blankPreferences());
  const [pendingGame, setPendingGame] = useState<ImportedGame | null>(null);
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
  const preferencesRef = useRef(preferences);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);
  const appliedHelperRevision = useRef<number | null>(null);
  const appliedHelperSession = useRef<string | null>(null);
  /* Which helper snapshot JASWA has already refused, so a two-second poll
     reports an unreadable account once rather than on every pass. */
  const reportedHelperRejection = useRef<string | null>(null);
  /* The current import, readable from the polling interval's callback. That
     callback outlives the render that created it, so `game` inside it is
     whatever was loaded when the interval started. */
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    Promise.all([loadImportedGame(), loadPreferences()]).then(([savedGame, savedPreferences]) => {
      const savedCurrentGame = savedGame && isValidImportedGame(savedGame) ? savedGame : null;
      setGame(savedCurrentGame);
      if (savedCurrentGame?.helperSession) appliedHelperSession.current = `${savedCurrentGame.helperSession.instanceId}:${savedCurrentGame.helperSession.sessionId}`;
      const savedCurrentPreferences = restoredPreferences(savedPreferences, savedCurrentGame);
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
    if (!ready || preferences.importRoute !== 'direct') return;
    let disposed = false;
    let refreshing = false;
    async function refreshHelper() {
      if (refreshing) return;
      refreshing = true;
      try {
        const connection = await checkHelperConnection();
        if (disposed) return;
        setHelperConnection(connection);
        if (!connection.profileReady) return;
        const needsImport = preferences.directImportMode === 'live'
          ? appliedHelperRevision.current !== connection.revision || appliedHelperSession.current !== `${connection.instanceId}:${connection.sessionId}`
          : appliedHelperSession.current !== `${connection.instanceId}:${connection.sessionId}`;
        if (!needsImport) return;
        const result = await readHelperProfile();
        if (disposed) return;
        if (result.state === 'unavailable') {
          setMessage(`${result.reason} JASWA is keeping the last saved import.`);
          setHelperConnection({ ...connection, state: 'unavailable', profileReady: false, detail: result.reason });
          return;
        }
        if (result.state === 'unreadable') {
          setHelperConnection({ ...connection, state: 'unavailable', profileReady: false, detail: result.reason });
          /* The helper is connected and sending, and JASWA cannot read what it
             sent. Say so in the same words the file route uses — but once per
             snapshot, because the poll would otherwise repeat it every two
             seconds, and never re-import the same rejected revision. */
          const { instanceId, sessionId, revision } = result.identity;
          const rejected = `${instanceId}:${sessionId}:${revision}`;
          if (reportedHelperRejection.current !== rejected) {
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
        if (!await applyImport(createImportedGame('JASWA Helper — Steam', profile.data, validation, { instanceId: profile.instanceId, sessionId: profile.sessionId }))) return;
        reportedHelperRejection.current = null;
        appliedHelperRevision.current = profile.revision;
        appliedHelperSession.current = `${profile.instanceId}:${profile.sessionId}`;
      } catch {
        if (!disposed) setMessage('JASWA could not save the helper import. Please try again.');
      } finally {
        refreshing = false;
      }
    }
    void refreshHelper();
    const interval = window.setInterval(() => void refreshHelper(), 2000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [preferences.directImportMode, preferences.importRoute, ready]);

  const monsters = useMemo(
    () => (Array.isArray(game?.data?.unit_list) ? game.data.unit_list : []) as GameRecord[],
    [game],
  );

  async function selectGameFile(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await fileToText(file)) as unknown;
      const validation = validateGameFile(raw);
      if (!validation.valid) { setMessage(validation.message); return; }
      const imported = createImportedGame(file.name, raw as Record<string, unknown>, validation);
      /* An empty workspace has no existing data to protect. The confirmation
         only belongs to replacing a real import. */
      if (!game) { await applyImport(imported); return; }
      setPendingGame(imported);
      setMessage('');
    } catch {
      setMessage('JASWA could not read this file. Please choose the original JSON file exported from Summoners War.');
    }
  }

  async function applyImport(imported: ImportedGame) {
    try {
      await saveImportedGame(imported);
    } catch {
      setMessage('JASWA could not save this import. Please try again.');
      return false;
    }
    setGame(imported);
    setPendingGame(null);
    setMessage('');
    return true;
  }

  async function removeImport() {
    try {
      await clearImportedGame();
    } catch {
      setMessage('JASWA could not remove the saved import. Please try again.');
      return;
    }
    setGame(null);
    setMessage('');
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
    changePreferences((current) => ({ ...current, importRoute: route }));
  }

  function confirmImportRoute() {
    if (!pendingImportRoute) return;
    const route = pendingImportRoute;
    setPendingImportRoute(null);
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

  function updateArtifactSettings(update: Partial<ArtifactSettings>) {
    changePreferences((current) => ({
      ...current,
      artifacts: { ...current.artifacts, ...update },
    }));
  }

  function writePresets(change: (current: RunePotentialPreset[]) => RunePotentialPreset[]) {
    changePreferences((current) => ({ ...current, runePotentialPresets: change(current.runePotentialPresets) }));
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

  return <main className="app-shell">
    <AppRail page={page} onNavigate={setPage} onReport={() => openReport()} />

    <section className="workspace">
      {game && <ImportBadge game={game} general={preferences.general} />}

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

      {page === 'monsters' && <Suspense fallback={<WorkspaceLoading />}><MonsterOverview monsters={monsters} gameData={game?.data ?? {}} preferences={preferences} /></Suspense>}

      {page === 'artifact-list' && <Suspense fallback={<WorkspaceLoading />}><ArtifactList game={game} monsters={monsters} preferences={preferences} /></Suspense>}

      {page === 'potential' && <Suspense fallback={<WorkspaceLoading />}><RunePotentialSection
        settings={preferences.runePotential}
        presets={preferences.runePotentialPresets}
        onUpdate={updateRunePotentialSettings}
        onWritePresets={writePresets}
      /></Suspense>}

      {page === 'artifacts' && <Suspense fallback={<WorkspaceLoading />}><ArtifactsSection
        settings={preferences.artifacts}
        data={game?.data}
        monsters={monsters}
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

      {(page === 'optimizer' || page === 'speed' || page === 'gems' || page === 'relics') && <Suspense fallback={<WorkspaceLoading />}><UpcomingWorkspace
        {...upcomingWorkspaces[page]}
        hasGame={Boolean(game)}
      /></Suspense>}
    </section>

    <input ref={gameInput} type="file" accept="application/json,.json" hidden
      onChange={(event) => { void selectGameFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={settingsInput} type="file" accept=".sw,application/json" hidden
      onChange={(event) => void handleSettingsImport(event)} />

    {pendingGame && <ReplaceImportDialog
      pendingGame={pendingGame}
      onCancel={() => setPendingGame(null)}
      onReplace={() => void applyImport(pendingGame)}
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

    {report && <ReportDialog
      report={report}
      onChange={setReport}
      onCancel={() => setReport(null)}
      onSend={sendReport}
    />}
  </main>;
}
