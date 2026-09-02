'use client';

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppRail } from './components/app-rail';
import { ArtifactList } from './components/artifact-list';
import { ArtifactsSection } from './components/artifacts-section';
import { HomeSection } from './components/home-section';
import { ImportBadge } from './components/import-badge';
import { MonsterOverview } from './components/monster-overview';
import { SettingsSection } from './components/settings-section';
import { DirectImportModeDialog, LoadPreferencesDialog, RemoveGameDataDialog, ReplaceImportDialog, ReportDialog } from './components/import-dialogs';
import { RunePotentialSection } from './components/rune-potential-section';
import { UpcomingWorkspace } from './components/upcoming-workspace';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/browser-storage';
import { blankPreferences, createImportedGame, fileToText, importPreferencesFile, isValidImportedGame, isValidPreferences, validateGameFile } from './lib/file-imports';
import { checkHelperConnection, readHelperProfile } from './lib/helper-client';
import type { HelperConnection } from './lib/helper-client';
import { downloadJson, formatDateTime } from './lib/formatting';
import { canChooseSaveFolder, chooseSaveFolder, forgetSaveFolder, loadSaveFolder, writeToSaveFolder } from './lib/save-location';
import type { DirectoryHandle } from './lib/save-location';
import type { GameRecord } from './lib/game-data';
import type { ArtifactSettings, DirectImportMode, GeneralSettings, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from './lib/types';
import type { RunePotentialPreset } from './lib/rune-potential-presets';
import { useLocalStorageState } from './lib/local-storage-state';
import { type Page, type ReportCategory, upcomingWorkspaces } from './lib/workspace-config';

const pageChoices: readonly Page[] = ['home', 'monsters', 'artifact-list', 'optimizer', 'speed', 'potential', 'artifacts', 'gems', 'relics', 'settings'];
const isPage = (value: unknown): value is Page => typeof value === 'string' && pageChoices.includes(value as Page);

export default function Home() {
  const [page, setPage] = useLocalStorageState<Page>('jaswa.navigation.page', 'home', isPage);
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
  const [helperConnection, setHelperConnection] = useState<HelperConnection>({ state: 'checking', detail: 'Run the helper. Then roll for initiative.', profileReady: false, restartRequired: false, instanceId: '', revision: 0, sessionId: 0 });
  const [saveFolder, setSaveFolder] = useState<DirectoryHandle | null>(null);
  const preferencesRef = useRef(preferences);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);
  const appliedHelperRevision = useRef<number | null>(null);
  const appliedHelperSession = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([loadImportedGame(), loadPreferences()]).then(([savedGame, savedPreferences]) => {
      const savedCurrentGame = savedGame && isValidImportedGame(savedGame) ? savedGame : null;
      setGame(savedCurrentGame);
      if (savedCurrentGame?.helperSession) appliedHelperSession.current = `${savedCurrentGame.helperSession.instanceId}:${savedCurrentGame.helperSession.sessionId}`;
      const savedCurrentPreferences = savedPreferences && isValidPreferences(savedPreferences) ? savedPreferences : blankPreferences();
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
          ? appliedHelperRevision.current !== connection.revision
          : appliedHelperSession.current !== `${connection.instanceId}:${connection.sessionId}`;
        if (!needsImport) return;
        const profile = await readHelperProfile();
        if (disposed || !profile) return;
        const validation = validateGameFile(profile.data);
        if (!validation.valid) return;
        if (!await applyImport(createImportedGame('JASWA Helper — Steam', profile.data, validation, { instanceId: profile.instanceId, sessionId: profile.sessionId }))) return;
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
    const importDetails = game ? `\n\nActive import: ${game.fileName}\nImported: ${formatDateTime(game.importedAt, preferences.general)}` : '';
    const body = `Hello,\n\nI found missing or unrecognized data in JASWA.\n\nCategory: ${report.category}\n\nDetails:\n${report.details || 'Please describe what JASWA could not recognize.'}${importDetails}\n\nPlease do not attach your full game JSON file.`;
    window.location.href = `mailto:bj.elling@gmail.com?subject=${encodeURIComponent(`JASWA missing data: ${report.category}`)}&body=${encodeURIComponent(body)}`;
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
        onReport={openReport}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onHardwareAcceleration={updateHardwareAcceleration}
        directImportMode={preferences.directImportMode}
        onDirectImportMode={updateDirectImportMode}
        importRoute={preferences.importRoute}
        onImportRoute={updateImportRoute}
        helperConnection={helperConnection}
        general={preferences.general}
      />}

      {page === 'monsters' && <MonsterOverview monsters={monsters} preferences={preferences} />}

      {page === 'artifact-list' && <ArtifactList game={game} monsters={monsters} preferences={preferences} />}

      {page === 'potential' && <RunePotentialSection
        settings={preferences.runePotential}
        presets={preferences.runePotentialPresets}
        onUpdate={updateRunePotentialSettings}
        onWritePresets={writePresets}
      />}

      {page === 'artifacts' && <ArtifactsSection
        settings={preferences.artifacts}
        data={game?.data}
        monsters={monsters}
        general={preferences.general}
        hardwareAcceleration={preferences.hardwareAcceleration}
        onUpdate={updateArtifactSettings}
      />}

      {page === 'settings' && <SettingsSection
        general={preferences.general}
        saveFolder={saveFolder?.name ?? null}
        canChooseFolder={canChooseSaveFolder()}
        onGeneralChange={updateGeneralSettings}
        onChooseFolder={() => void pickSaveFolder()}
        onForgetFolder={() => void dropSaveFolder()}
        onExport={() => void saveFile('jaswa-preferences.sw', JSON.stringify(preferences, null, 2))}
        onImport={() => setLoadPreferencesPrompt(true)}
      />}

      {(page === 'optimizer' || page === 'speed' || page === 'gems' || page === 'relics') && <UpcomingWorkspace
        {...upcomingWorkspaces[page]}
        hasGame={Boolean(game)}
      />}
    </section>

    <input ref={gameInput} type="file" accept="application/json,.json" hidden
      onChange={(event) => { void selectGameFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={settingsInput} type="file" accept=".sw,application/json" hidden
      onChange={(event) => void handleSettingsImport(event)} />

    {pendingGame && <ReplaceImportDialog
      pendingGame={pendingGame}
      onCancel={() => setPendingGame(null)}
      onReplace={() => void applyImport(pendingGame)}
      onReport={openReport}
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
