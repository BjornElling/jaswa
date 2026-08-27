'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/local-store';
import { blankPreferences, createImportedGame, defaultRunePotentialSettings, fileToText, importPreferencesFile, itemGrades, normalizeImportedGame, validateGameFile } from './lib/imports';
import { monsterPresentation } from './lib/monster-catalog';
import { calculateMonsterTotals } from './lib/monster-stats';
import { activeRuneSets, elementName, runeSetNameList } from './lib/rune-sets';
import {
  createRunePotentialPreset, normalizeRunePotentialPresets, presetStatTargetKeys, presetTargetColumns,
  presetTypes, runeMainStats, withRefreshedMetrics,
} from './lib/rune-potential-presets';
import type { PresetChoice, PresetStatTargets, PresetType, RuneMainStat, RunePotentialPreset } from './lib/rune-potential-presets';
import type { ImportedGame, ItemGrade, MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder } from './lib/types';

type Page = 'home' | 'monsters' | 'optimizer' | 'speed' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'preferences';
type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';
type MonsterRecord = Record<string, unknown>;

type NavigationItem = { id: Page; label: string; glyph: string };

/* The rail is grouped so nine entries read as three short lists rather than
   one undifferentiated column. */
const navigationGroups: Array<{ heading: string; items: NavigationItem[] }> = [
  {
    heading: 'Overview',
    items: [
      { id: 'home', label: 'Home', glyph: '⌂' },
      { id: 'monsters', label: 'Monsters', glyph: '♜' },
    ],
  },
  {
    heading: 'Workspaces',
    items: [
      { id: 'optimizer', label: 'Rune Optimizer', glyph: '◈' },
      { id: 'speed', label: 'Speed Tuning', glyph: '↝' },
      { id: 'potential', label: 'Rune Potential', glyph: '◌' },
      { id: 'artifacts', label: 'Artifacts', glyph: '◇' },
      { id: 'gems', label: 'Gems & Grinds', glyph: '✦' },
      { id: 'relics', label: 'Relics', glyph: '▣' },
    ],
  },
  {
    heading: 'Setup',
    items: [{ id: 'preferences', label: 'Preferences', glyph: '⚙' }],
  },
];

const upcomingWorkspaces: Record<'optimizer' | 'speed' | 'artifacts' | 'gems' | 'relics', { title: string; tagline: string; text: string }> = {
  optimizer: {
    title: 'Rune Optimizer',
    tagline: 'Six slots, thousands of runes, one answer. Let your computer do the arithmetic so you can go back to pretending it was intuition.',
    text: 'Finds rune combinations that meet the requirements you save for each monster.',
  },
  speed: {
    title: 'Speed Tuning',
    tagline: 'Turn order is a solved problem. Getting your own team to respect it is the hard part.',
    text: 'Works out the rune speeds your team needs to take turns in the order you intend.',
  },
  artifacts: {
    title: 'Artifacts',
    tagline: 'That artifact is superb. Just not for the monster wearing it.',
    text: 'Compares artifact effects against the monsters that would gain most from them.',
  },
  gems: {
    title: 'Gems & Grinds',
    tagline: 'You have a box full of upgrades and a shortage of patience. One of those is fixable.',
    text: 'Ranks the gem and grindstone upgrades that move your account furthest.',
  },
  relics: {
    title: 'Relics',
    tagline: 'Judged against the goals you actually saved, not the ones you meant to.',
    text: 'Evaluates relic choices against the goals you have saved.',
  },
};

type NumericSortKey = 'level' | 'hp' | 'atk' | 'def' | 'spd' | 'criticalRate' | 'criticalDamage' | 'resistance' | 'accuracy';
type SortKey = 'index' | 'name' | NumericSortKey;

type MonsterRow = {
  unitId: string;
  name: string;
  secondaryName?: string;
  element?: string;
  imageFilename?: string;
  initial: string;
  sets: Array<{ name: string; abbreviation: string }>;
  level: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  criticalRate: number;
  criticalDamage: number;
  resistance: number;
  accuracy: number;
};

function count(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
function dateTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never';
}
function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [page, setPage] = useState<Page>('home');
  const [game, setGame] = useState<ImportedGame | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(blankPreferences());
  const [pendingGame, setPendingGame] = useState<ImportedGame | null>(null);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<{ category: ReportCategory; details: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadImportedGame(), loadPreferences()]).then(([savedGame, savedPreferences]) => {
      const normalizedGame = savedGame ? normalizeImportedGame(savedGame) : null;
      setGame(normalizedGame);
      if (normalizedGame) void saveImportedGame(normalizedGame);
      setPreferences(savedPreferences
        ? {
            ...savedPreferences,
            runePotential: { ...defaultRunePotentialSettings, ...savedPreferences.runePotential },
            /* Presets saved before this list existed come back as `undefined`,
               which the normalizer answers with the shipped set — the same
               answer a first-time user gets. An empty list is the user having
               deleted them all, and is left empty. */
            runePotentialPresets: normalizeRunePotentialPresets(savedPreferences.runePotentialPresets),
          }
        : blankPreferences());
    }).finally(() => setReady(true));
  }, []);

  const monsters = useMemo(
    () => (Array.isArray(game?.data.unit_list) ? game.data.unit_list : []) as MonsterRecord[],
    [game],
  );

  async function selectGameFile(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await fileToText(file)) as unknown;
      const validation = validateGameFile(raw);
      if (!validation.valid) { setMessage(validation.message); return; }
      setPendingGame(createImportedGame(file.name, raw as Record<string, unknown>, validation));
      setMessage('');
    } catch {
      setMessage('Swaggr could not read this file. Please choose the original JSON file exported from Summoners War.');
    }
  }
  async function replaceImport() {
    if (!pendingGame) return;
    await saveImportedGame(pendingGame);
    setGame(pendingGame); setPendingGame(null);
    setMessage('Your game data was replaced. Your personal preferences were kept.');
  }
  async function removeImport() {
    await clearImportedGame(); setGame(null);
    setMessage('The imported game data was removed. Your preferences are still saved on this computer.');
  }
  async function updateMonsterPreference(unitId: string, update: Partial<MonsterPreference>) {
    const next: Preferences = {
      ...preferences,
      monsterPreferences: {
        ...preferences.monsterPreferences,
        [unitId]: { ...preferences.monsterPreferences[unitId], unitId, ...update },
      },
      updatedAt: new Date().toISOString(),
    };
    setPreferences(next); await savePreferences(next);
  }
  async function updateRunePotentialSettings(update: Partial<RunePotentialSettings>) {
    const next: Preferences = {
      ...preferences,
      runePotential: { ...(preferences.runePotential ?? defaultRunePotentialSettings), ...update },
      updatedAt: new Date().toISOString(),
    };
    setPreferences(next); await savePreferences(next);
  }
  /**
   * Presets are written whole rather than patched: an edit can change every
   * part of one at once, and the editor already holds the finished preset.
   */
  async function writePresets(presets: RunePotentialPreset[]) {
    const next: Preferences = { ...preferences, runePotentialPresets: presets, updatedAt: new Date().toISOString() };
    setPreferences(next); await savePreferences(next);
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    void selectGameFile(event.dataTransfer.files[0]);
  }
  async function handleSettingsImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = await importPreferencesFile(file);
      setPreferences(next); await savePreferences(next);
      setMessage('Your preferences were loaded.');
    } catch {
      setMessage('Swaggr could not read this settings file. Please choose a .sw file exported from Swaggr.');
    } finally { event.target.value = ''; }
  }
  function openReport(category: ReportCategory = 'Other', details = '') { setReport({ category, details }); }
  function sendReport() {
    if (!report) return;
    const importDetails = game ? `\n\nActive import: ${game.fileName}\nImported: ${dateTime(game.importedAt)}` : '';
    const body = `Hello,\n\nI found missing or unrecognized data in Swaggr.\n\nCategory: ${report.category}\n\nDetails:\n${report.details || 'Please describe what Swaggr could not recognize.'}${importDetails}\n\nPlease do not attach your full game JSON file.`;
    window.location.href = `mailto:bj.elling@gmail.com?subject=${encodeURIComponent(`Swaggr missing data: ${report.category}`)}&body=${encodeURIComponent(body)}`;
    setReport(null);
  }

  if (!ready) return <main className="loading-screen">Preparing your local workspace…</main>;

  const exportPreferences = () => download('swaggr-preferences.sw', JSON.stringify(preferences, null, 2));

  return <main className="app-shell">
    <nav className="rail" aria-label="Swaggr sections">
      <div className="rail-brand">
        <span className="rail-mark" aria-hidden="true">S</span>
        <b>Swaggr</b>
      </div>
      {navigationGroups.map((group) => <div className="rail-group" key={group.heading}>
        <p className="rail-heading">{group.heading}</p>
        {group.items.map((item) => <button
          key={item.id}
          className={page === item.id ? 'rail-item active' : 'rail-item'}
          onClick={() => setPage(item.id)}
          aria-current={page === item.id ? 'page' : undefined}
        >
          <span className="glyph" aria-hidden="true">{item.glyph}</span>
          {item.label}
        </button>)}
      </div>)}
      <div className="rail-spacer" />
      <button className="rail-item" onClick={() => openReport()}>
        <span className="glyph" aria-hidden="true">!</span>
        Report missing data
      </button>
    </nav>

    <section className="workspace">
      {/* The section is named by its own PageHeader, so the topbar carries
          only the state of the import. */}
      <header className="topbar">
        <div className="topbar-spacer" />
        {game && <span className="topbar-count">
          {monsters.length.toLocaleString('en')} monsters · {count(game.data.runes).toLocaleString('en')} runes
        </span>}
        <span className={game ? 'status-pill live' : 'status-pill'}>
          {game ? `imported ${dateTime(game.importedAt)}` : 'no game data'}
        </span>
      </header>

      {page === 'home' && <HomeSection
        game={game}
        message={message}
        dragging={dragging}
        onPickFile={() => gameInput.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onRemove={() => void removeImport()}
        onReport={openReport}
        onExportPreferences={exportPreferences}
        onImportPreferences={() => settingsInput.current?.click()}
      />}

      {page === 'monsters' && <MonsterOverview monsters={monsters} preferences={preferences} />}

      {page === 'potential' && <RunePotentialSection
        settings={preferences.runePotential ?? defaultRunePotentialSettings}
        presets={preferences.runePotentialPresets ?? []}
        onUpdate={updateRunePotentialSettings}
        onWritePresets={writePresets}
      />}

      {page === 'preferences' && <PreferencesSection
        monsters={monsters}
        preferences={preferences}
        onUpdate={updateMonsterPreference}
        onExport={exportPreferences}
        onImport={() => settingsInput.current?.click()}
      />}

      {(page === 'optimizer' || page === 'speed' || page === 'artifacts' || page === 'gems' || page === 'relics') && <div className="section-body">
        <PageHeader
          title={upcomingWorkspaces[page].title}
          tagline={upcomingWorkspaces[page].tagline} />
        <section className="empty-state">
          <h2>{upcomingWorkspaces[page].text}</h2>
          <p className="next-step">{game
            ? 'Your current import is ready for this workspace. The calculation rules are being written next.'
            : 'Import your game data first. Your preferences can be prepared at any time.'}</p>
        </section>
      </div>}
    </section>

    <input ref={gameInput} type="file" accept="application/json,.json" hidden
      onChange={(event) => { void selectGameFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={settingsInput} type="file" accept=".sw,application/json" hidden
      onChange={(event) => void handleSettingsImport(event)} />

    {pendingGame && <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title">
        <p className="eyebrow">Replace game data</p>
        <h2 id="replace-title">Replace the current import?</h2>
        <p>This removes all current game data and replaces it with <strong>{pendingGame.fileName}</strong>. Your saved names, goals and preferences remain.</p>
        {pendingGame.report.unknownMonsterIds.length > 0 && <p className="notice warning">
          {pendingGame.report.unknownMonsterIds.length} monster type{pendingGame.report.unknownMonsterIds.length === 1 ? '' : 's'} {pendingGame.report.unknownMonsterIds.length === 1 ? 'is' : 'are'} newer than Swaggr’s name list. {pendingGame.report.unknownMonsterIds.join(', ')} will still be imported, shown by game ID until the list is updated.{' '}
          <button className="notice-link" onClick={() => openReport('Monster', `Swaggr could not find name information for monster type(s): ${pendingGame.report.unknownMonsterIds.join(', ')}.\n\nJSON file: ${pendingGame.fileName}`)}>Report this</button>
        </p>}
        <div className="dialog-actions">
          <button className="button" onClick={() => setPendingGame(null)}>Cancel</button>
          <button className="button primary" onClick={() => void replaceImport()}>Replace data</button>
        </div>
      </section>
    </div>}

    {report && <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <p className="eyebrow">Send a report</p>
        <h2 id="report-title">Report missing data</h2>
        <p>Your mail program opens with this report filled in. Review it, then send it to the developer.</p>
        <label className="field"><span>Data type</span>
          <select value={report.category} onChange={(event) => setReport({ ...report, category: event.target.value as ReportCategory })}>
            {(['Monster', 'Rune', 'Gem', 'Grindstone', 'Artifact', 'Relic', 'Other'] as ReportCategory[]).map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="field"><span>What is missing or unrecognized?</span>
          <textarea value={report.details} onChange={(event) => setReport({ ...report, details: event.target.value })}
            placeholder="Include the name, game ID, or anything else shown by Swaggr." />
        </label>
        <p className="notice">Swaggr does not attach your game data to the e-mail.</p>
        <div className="dialog-actions">
          <button className="button" onClick={() => setReport(null)}>Cancel</button>
          <button className="button primary" onClick={sendReport}>Open e-mail</button>
        </div>
      </section>
    </div>}
  </main>;
}

/* ------------------------------------------------------------------ home */

function HomeSection({ game, message, dragging, onPickFile, onDragOver, onDragLeave, onDrop, onRemove, onReport, onExportPreferences, onImportPreferences }: {
  game: ImportedGame | null;
  message: string;
  dragging: boolean;
  onPickFile: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  onReport: (category: ReportCategory, details: string) => void;
  onExportPreferences: () => void;
  onImportPreferences: () => void;
}) {
  const unknownMonsterIds = game?.report.unknownMonsterIds ?? [];
  return <div className="section-body">
    <PageHeader
      title="Your account, minus the guesswork"
      tagline="Drop in a JSON file, set goals for individual monsters, and use each workspace as it opens. Nothing leaves this computer — not even the embarrassing runes." />

    <section className="panel">
      <h3 className="block-title">Game data</h3>
      <div className="stack">
        <div
          className={dragging ? 'drop-zone dragging' : 'drop-zone'}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onPickFile}
          role="button" tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPickFile(); } }}
        >
          <span className="glyph" aria-hidden="true">↓</span>
          <strong>Drop your Summoners War JSON file here</strong>
          <span>or choose a file from your computer</span>
        </div>

        {message && <p className="notice" role="status">{message}</p>}

        {game && <>
          <dl className="kv-list">
            {([
              ['Monsters', count(game.data.unit_list)],
              ['Runes', count(game.data.runes)],
              ['Artifacts', count(game.data.artifacts)],
              ['Relics', count(game.data.relics)],
              ['Gems & grinds', count(game.data.rune_craft_item_list)],
            ] as Array<[string, number]>).map(([label, value]) => <div key={label}>
              <dt>{label}</dt><dd>{value.toLocaleString('en')}</dd>
            </div>)}
          </dl>

          <p className="meta-line">{game.fileName} · imported {dateTime(game.importedAt)}</p>

          {unknownMonsterIds.length > 0 && <p className="notice warning">
            Name information is missing for monster type{unknownMonsterIds.length === 1 ? '' : 's'} {unknownMonsterIds.join(', ')}.{' '}
            <button className="notice-link" onClick={() => onReport('Monster', `Swaggr could not find name information for monster type(s): ${unknownMonsterIds.join(', ')}.`)}>Report this</button>
          </p>}

          <div className="button-row">
            <button className="button danger" onClick={onRemove}>Remove game data</button>
          </div>
        </>}
      </div>
    </section>

    <section className="panel">
      <h3 className="block-title">Your preferences</h3>
      <div className="stack">
        <p className="lead">Personal names, monster goals and rune requirements are stored separately from the game import, so replacing your data keeps them.</p>
        <div className="button-row">
          <button className="button" onClick={onExportPreferences}>Download .sw file</button>
          <button className="button" onClick={onImportPreferences}>Load .sw file</button>
        </div>
      </div>
    </section>
  </div>;
}

/* -------------------------------------------------------------- monsters */

/**
 * The monster's own artwork where it is bundled locally, and its initial as a
 * placeholder otherwise. The element is deliberately not shown here.
 */
function MonsterPortrait({ imageFilename, initial, name }: { imageFilename?: string; initial: string; name: string }) {
  if (imageFilename) return <span
    className="monster-portrait"
    role="img"
    aria-label={name}
    style={{ backgroundImage: `url(/monster-images/${imageFilename})` }}
  />;
  return <span className="monster-portrait placeholder" aria-hidden="true">{initial}</span>;
}

function numberedMonsterNames(monsters: MonsterRecord[]): Record<string, string> {
  const entries = monsters.map((monster, index) => ({
    unitId: String(monster.unit_id ?? `unknown-${index}`),
    name: monsterPresentation(monster.unit_master_id).name,
  }));
  const totals = entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.name]: (result[entry.name] ?? 0) + 1 }), {});
  const seen: Record<string, number> = {};
  return Object.fromEntries(entries.map((entry) => {
    const number = (seen[entry.name] = (seen[entry.name] ?? 0) + 1);
    return [entry.unitId, totals[entry.name] > 1 ? `${entry.name} #${number}` : entry.name];
  }));
}

function MonsterOverview({ monsters, preferences }: { monsters: MonsterRecord[]; preferences: Preferences }) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'index', ascending: true });
  const [search, setSearch] = useState('');
  const [element, setElement] = useState<string | null>(null);

  const rows = useMemo<MonsterRow[]>(() => {
    const defaultNames = numberedMonsterNames(monsters);
    return monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const display = monsterPresentation(monster.unit_master_id);
      const totals = calculateMonsterTotals(monster);
      const preference = preferences.monsterPreferences[unitId];
      return {
        unitId,
        name: preference?.label || defaultNames[unitId],
        secondaryName: preference?.label ? defaultNames[unitId] : display.secondaryName,
        element: elementName(monster.attribute),
        imageFilename: display.imageFilename,
        initial: display.shortName,
        sets: activeRuneSets(monster),
        level: numeric(monster.unit_level),
        hp: totals.hp, atk: totals.atk, def: totals.def, spd: totals.spd,
        criticalRate: totals.criticalRate, criticalDamage: totals.criticalDamage,
        resistance: totals.resistance, accuracy: totals.accuracy,
      };
    });
  }, [monsters, preferences]);

  const elements = useMemo(
    () => [...new Set(rows.map((row) => row.element).filter((value): value is string => Boolean(value)))],
    [rows],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (element && row.element !== element) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term)
        || row.secondaryName?.toLowerCase().includes(term)
        || row.sets.some((set) => set.name.toLowerCase().includes(term));
    });
    const { key, ascending } = sort;
    if (key === 'index') return filtered;
    const direction = ascending ? 1 : -1;
    if (key === 'name') return [...filtered].sort((left, right) => left.name.localeCompare(right.name) * direction);
    return [...filtered].sort((left, right) => (left[key] - right[key]) * direction);
  }, [rows, search, element, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      : { key, ascending: key === 'name' });
  }

  if (!monsters.length) return <div className="section-body">
    <PageHeader
      title="Your roster, told straight"
      tagline="Every monster you own, with the stats it actually has on right now — runes included." />
    <section className="empty-state">
      <h2>Nothing to show until a game file is imported.</h2>
      <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
    </section>
  </div>;

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: 'level', label: 'LVL' }, { key: 'hp', label: 'HP' }, { key: 'atk', label: 'ATK' },
    { key: 'def', label: 'DEF' }, { key: 'spd', label: 'SPD' }, { key: 'criticalRate', label: 'CR%' },
    { key: 'criticalDamage', label: 'CD%' }, { key: 'resistance', label: 'RES%' }, { key: 'accuracy', label: 'ACC%' },
  ];

  return <>
    <div className="filter-strip">
      <div className="filter-group">
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter monsters" aria-label="Filter monsters by name or set" />
          {search && <button className="filter-button" onClick={() => setSearch('')} aria-label="Clear filter">✕</button>}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Element</span>
        {elements.map((name) => <button
          key={name}
          className={element === name ? 'filter-button active' : 'filter-button'}
          onClick={() => setElement(element === name ? null : name)}
          aria-pressed={element === name}
        >{name.slice(0, 3).toUpperCase()}</button>)}
      </div>
    </div>

    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="align-left">#</th>
            <th className={sort.key === 'name' ? `align-left sortable sorted${sort.ascending ? ' ascending' : ''}` : 'align-left sortable'}
              onClick={() => toggleSort('name')}>Monster</th>
            <th className="align-left">Sets</th>
            {columns.map((column) => <th
              key={column.key}
              className={sort.key === column.key ? `sortable sorted${sort.ascending ? ' ascending' : ''}` : 'sortable'}
              onClick={() => toggleSort(column.key)}
            >{column.label}</th>)}
            <th className="reserved" title="Available once the rune efficiency calculation is in place">EFF</th>
            <th className="reserved" title="Available once monster goals can be compared">GOAL</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => <tr key={row.unitId}>
            <td className="align-left row-index">{String(index + 1).padStart(2, '0')}</td>
            <td className="align-left">
              <div className="monster-cell">
                <MonsterPortrait imageFilename={row.imageFilename} initial={row.initial} name={row.name} />
                <span className="monster-name">
                  {row.name}
                  {row.secondaryName && <small>{row.secondaryName}</small>}
                </span>
              </div>
            </td>
            <td className="align-left">
              {row.sets.length
                ? row.sets.map((set) => <span className="set-mark" key={set.name} title={set.name}>{set.abbreviation}</span>)
                : <span className="set-none">—</span>}
            </td>
            <td className="dim">{row.level}</td>
            <td>{row.hp.toLocaleString('en')}</td>
            <td>{row.atk.toLocaleString('en')}</td>
            <td>{row.def.toLocaleString('en')}</td>
            <td>{row.spd.toLocaleString('en')}</td>
            <td className={row.criticalRate ? undefined : 'muted'}>{row.criticalRate}</td>
            <td className={row.criticalDamage ? undefined : 'muted'}>{row.criticalDamage}</td>
            <td className={row.resistance ? undefined : 'muted'}>{row.resistance}</td>
            <td className={row.accuracy ? undefined : 'muted'}>{row.accuracy}</td>
            <td className="pending"><span className="awaiting" aria-label="Not calculated yet" /></td>
            <td className="pending"><span className="awaiting" aria-label="Not calculated yet" /></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="grid-footer">
      <span><b>{visible.length}</b> of {rows.length} shown</span>
      {element && <><span>·</span><span><b>{element}</b></span></>}
      {search && <><span>·</span><span>matching <b>{search}</b></span></>}
      <span className="spacer" />
      <span>EFF and GOAL await the calculation rules</span>
    </div>
  </>;
}

/* ------------------------------------------------------ shared furniture */

/**
 * The masthead a workspace opens with. The section name is stated here at
 * display size rather than only in the topbar, so a page announces itself.
 */
function PageHeader({ eyebrow, title, tagline }: { eyebrow?: string; title: string; tagline: string }) {
  return <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2 className="page-title">{title}</h2>
    <p className="page-tagline">{tagline}</p>
  </header>;
}

/**
 * A full-width bar that opens to reveal its contents. Uses <details> so the
 * open state, keyboard behaviour and find-in-page all come from the browser
 * rather than from state we would have to keep ourselves.
 */
function Disclosure({ title, defaultOpen = false, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return <details className="bar" open={defaultOpen}>
    <summary className="bar-head">
      <span className="bar-chevron" aria-hidden="true">›</span>
      <b>{title}</b>
    </summary>
    <div className="bar-body">{children}</div>
  </details>;
}

/* -------------------------------------------------------- rune potential */

/**
 * What each step on a setting actually means, in the reader's terms. The
 * chosen one is shown under its slider, so these carry the explanation that
 * a bare "3 / 5" never could.
 */
const potentialStepLabels = {
  powerUpPolicy: [
    'Full YOLO — anything with potential gets a roll',
    'Adventurous — a hint of promise is enough',
    'Balanced — rolls the runes worth rolling',
    'Picky — wants the odds on its side first',
    'No loose ends — practically a slam dunk or nothing',
  ],
  runeQuality: [
    'Rough diamonds — every underdog gets a look',
    'Promising — some upside is enough to start',
    'Good stuff — solid runes only',
    'Top shelf — near the best its slot can hold',
    'Hall of famers — the ones you would frame',
  ],
  /* Four steps up the same scale: nothing further, an ordinary roll, a good
     one, the best the grade allows. These describe what Swaggr assumes you
     would still apply — whatever a rune already carries stays with it either
     way — and the slider label already says which item is meant. */
  enchantedGems: [
    'None — takes each rune as it stands today',
    'Average — an ordinary roll, nothing special',
    'Three quarters — a good roll, short of perfect',
    'Maximum — the best the grade allows',
  ],
  grindstones: [
    'None — takes each rune as it stands today',
    'Average — an ordinary roll, nothing special',
    'Three quarters — a good roll, short of perfect',
    'Maximum — the best the grade allows',
  ],
} as const;

function RunePotentialSection({ settings, presets, onUpdate, onWritePresets }: {
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
  onUpdate: (update: Partial<RunePotentialSettings>) => Promise<void>;
  onWritePresets: (presets: RunePotentialPreset[]) => Promise<void>;
}) {
  const sortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
  /* The preset being edited, held as a draft so a cancelled edit changes
     nothing, and `isNew` so cancelling a just-added preset does not leave an
     empty one behind. */
  const [editing, setEditing] = useState<{ draft: RunePotentialPreset; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<RunePotentialPreset | null>(null);

  async function savePreset(preset: RunePotentialPreset) {
    const saved = withRefreshedMetrics(preset);
    const index = presets.findIndex((entry) => entry.id === saved.id);
    await onWritePresets(index === -1
      ? [...presets, saved]
      : presets.map((entry) => (entry.id === saved.id ? saved : entry)));
    setEditing(null);
  }
  async function deletePreset(id: string) {
    await onWritePresets(presets.filter((entry) => entry.id !== id));
    setDeleting(null);
  }

  return <div className="section-body">
    <PageHeader
      title="Rune Potential"
      tagline="Which runes deserve your mana. Set your tolerance for disappointment below." />

    <Disclosure title="Settings" defaultOpen>
      <div className="stack">
        {/* Two fixed columns so the gem and grindstone settings share the
            second line, and the space beside them becomes the aside. */}
        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="power-up-policy" label="Power-up policy" value={settings.powerUpPolicy}
              description="How willing are you to roll runes with potential?"
              stepLabels={potentialStepLabels.powerUpPolicy}
              onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
            <PotentialSlider id="rune-quality" label="Rune quality floor" value={settings.runeQuality}
              description="How high must a rune's best case be before it earns a roll?"
              stepLabels={potentialStepLabels.runeQuality}
              onChange={(value) => void onUpdate({ runeQuality: value })} />
            <PotentialSlider id="enchanted-gems" label="Enchanted gems" value={settings.enchantedGems}
              description="How much of a gem roll to count toward potential."
              stepLabels={potentialStepLabels.enchantedGems}
              onChange={(value) => void onUpdate({ enchantedGems: value })} />
            <PotentialSlider id="grindstones" label="Grindstones" value={settings.grindstones}
              description="How much of a grindstone roll to count toward potential."
              stepLabels={potentialStepLabels.grindstones}
              onChange={(value) => void onUpdate({ grindstones: value })} />
          </div>

          <div className="settings-rule" role="presentation" />

          <aside className="settings-aside">
            <div className="grade-fields">
              <label className="field"><span>Gem grade</span>
                <select value={settings.gemGrade}
                  onChange={(event) => void onUpdate({ gemGrade: event.target.value as ItemGrade })}>
                  {itemGrades.map((grade) => <option key={grade}>{grade}</option>)}
                </select>
              </label>
              <label className="field"><span>Grindstone grade</span>
                <select value={settings.grindstoneGrade}
                  onChange={(event) => void onUpdate({ grindstoneGrade: event.target.value as ItemGrade })}>
                  {itemGrades.map((grade) => <option key={grade}>{grade}</option>)}
                </select>
              </label>
            </div>

            {/* TODO: both figures are placeholders. They become real once the
                potential calculation lands and can read the settings above. */}
            <section className="statistics" aria-live="polite">
              <h4>Statistics</h4>
              <p className="statistics-lead">Current settings will give you…</p>
              <dl>
                <div>
                  <dt>Percent to roll</dt>
                  <dd>18<span className="unit">%</span></dd>
                </div>
                <div>
                  <dt>Percent to keep</dt>
                  <dd>62<span className="unit">%</span></dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        <div className="bar-divide" />

        <div className="filter-columns">
          <div className="stack tight">
            <p className="field-legend">Runes to include</p>
            <CheckboxRow label="Include runes at Lv. 12 and above" checked={settings.includeLevel12Runes}
              onChange={(checked) => void onUpdate({ includeLevel12Runes: checked })} />
            <CheckboxRow label="Include runes equipped on monsters" checked={settings.includeEquippedRunes}
              onChange={(checked) => void onUpdate({ includeEquippedRunes: checked })} />
          </div>
          <label className="field field-narrow field-lead"><span>Sort order</span>
            <select value={settings.sortOrder} onChange={(event) => void onUpdate({ sortOrder: event.target.value as RunePotentialSortOrder })}>
              {sortOrders.map((order) => <option key={order}>{order}</option>)}
            </select>
          </label>
        </div>

      </div>
    </Disclosure>

    <Disclosure title="Presets">
      <div className="stack">
        {/* The one action that makes a new thing sits above the list, where it
            is found before the list has been read rather than after. */}
        <div className="list-actions">
          <p className="list-count">
            {presets.length === 0 ? 'No presets' : <><b>{presets.length}</b> preset{presets.length === 1 ? '' : 's'}</>}
          </p>
          <button className="button primary" onClick={() => setEditing({ draft: createRunePotentialPreset(), isNew: true })}>
            <span className="button-glyph" aria-hidden="true">+</span>
            Add preset
          </button>
        </div>

        {presets.length === 0
          ? <p className="notice">Every preset is gone, including the ones Swaggr started you with. Add one to say what a rune should be judged against.</p>
          : <div className="preset-list">
            {presets.map((preset) => <PresetCard
              key={preset.id}
              preset={preset}
              onEdit={() => setEditing({ draft: preset, isNew: false })}
              onDelete={() => setDeleting(preset)}
            />)}
          </div>}
      </div>
    </Disclosure>

    {editing && <PresetEditor
      draft={editing.draft}
      isNew={editing.isNew}
      onCancel={() => setEditing(null)}
      onSave={(preset) => void savePreset(preset)}
    />}

    {deleting && <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-preset-title">
        <p className="eyebrow">Delete preset</p>
        <h2 id="delete-preset-title">Delete “{deleting.name}”?</h2>
        <p>This preset is removed from this computer. Runes stop being judged against it, and nothing else changes.</p>
        <div className="dialog-actions">
          <button className="button" onClick={() => setDeleting(null)}>Keep it</button>
          <button className="button danger" onClick={() => void deletePreset(deleting.id)}>Delete preset</button>
        </div>
      </section>
    </div>}
  </div>;
}

/**
 * One setting on a 1..n scale. The chosen step names itself underneath the
 * track — the number alone said nothing, and a pair of fixed end labels made
 * the reader work out where they had landed between them.
 */
function PotentialSlider({ id, label, value, description, stepLabels, onChange }: {
  id: string; label: string; value: number;
  description: string;
  stepLabels: readonly string[];
  onChange: (value: number) => void;
}) {
  const steps = stepLabels.length;
  return <div className="slider">
    <label className="slider-label" htmlFor={id}>{label}</label>
    <p className="slider-note">{description}</p>
    <input id={id} type="range" min={1} max={steps} step={1} value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-describedby={`${id}-choice`} />
    <p id={`${id}-choice`} className="slider-choice" aria-live="polite">
      {stepLabels[value - 1]}
    </p>
  </div>;
}

/* ------------------------------------------------------ preset cards */

/**
 * Preferred entries in full ink, acceptable ones dimmed behind them. The two
 * groups run on one line: the distinction is carried by weight and colour, so
 * a second row would only add height for something already legible.
 */
function ChoiceLine({ choice }: { choice: PresetChoice<string> }) {
  if (!choice.preferred.length && !choice.acceptable.length) return <span className="choice-none">—</span>;
  return <span className="choice-line">
    {choice.preferred.map((value) => <span className="choice preferred" key={value}>{value}</span>)}
    {choice.acceptable.map((value) => <span className="choice acceptable" key={value}>{value}</span>)}
  </span>;
}

/** A labelled row inside a preset card. The label column is shared by all rows. */
function PresetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="preset-row">
    <span className="preset-row-label">{label}</span>
    <div className="preset-row-value">{children}</div>
  </div>;
}

/**
 * One preset, read as a small record rather than as a table row: the name at
 * the top, then the sets it wants, the three slots that carry a choice, which
 * artifact primaries suit it, and the stat targets it aims at.
 */
function PresetCard({ preset, onEdit, onDelete }: {
  preset: RunePotentialPreset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const artifacts: Array<[string, boolean]> = [['ATK', preset.artifacts.atk], ['DEF', preset.artifacts.def], ['HP', preset.artifacts.hp]];

  return <article className="preset-card">
    {/* The name and its two actions share the top line: the actions belong to
        this preset, so they sit on the line that names it rather than in a
        footer the reader has to associate back. */}
    <header className="preset-head">
      <div className="preset-title">
        <h4 className="preset-name">{preset.name}</h4>
        <p className="preset-type">{preset.type}</p>
      </div>
      <div className="preset-actions">
        <button className="icon-button" onClick={onEdit} title={`Edit ${preset.name}`} aria-label={`Edit ${preset.name}`}>
          <PencilIcon />
        </button>
        <button className="icon-button danger" onClick={onDelete} title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`}>
          <TrashIcon />
        </button>
      </div>
    </header>

    <div className="preset-rows">
      <PresetRow label="Runes"><ChoiceLine choice={preset.sets} /></PresetRow>
      {/* The three slots read across rather than down: each holds only two or
          three main stats, so a row apiece spent height on nothing, and side by
          side they invite the comparison between slots that matters. */}
      <PresetRow label="Rune slots">
        <div className="slot-group">
          {([['Slot 2', preset.slots.slot2], ['Slot 4', preset.slots.slot4], ['Slot 6', preset.slots.slot6]] as const)
            .map(([label, choice]) => <div className="slot" key={label}>
              <span className="slot-label">{label}</span>
              <ChoiceLine choice={choice} />
            </div>)}
        </div>
      </PresetRow>
      <PresetRow label="Artifacts">
        <span className="flag-line">
          {artifacts.map(([label, wanted]) => <span className={wanted ? 'flag yes' : 'flag no'} key={label}>
            {label}<b>{wanted ? 'Yes' : 'No'}</b>
          </span>)}
        </span>
      </PresetRow>
      <PresetRow label="Desired stats">
        <dl className="target-line">
          {presetTargetColumns.map((column) => {
            const value = preset.targets[column.key];
            return <div className={value === undefined ? 'target empty' : 'target'} key={column.key}>
              <dt>{column.label}</dt>
              <dd>{value === undefined ? '—' : <>{value.toLocaleString('en')}{column.unit && <span className="unit">{column.unit}</span>}</>}</dd>
            </div>;
          })}
        </dl>
      </PresetRow>
    </div>
  </article>;
}

/* Line art rather than a glyph from the type: at 14px an emoji pencil renders
   at a different weight in every browser, where a stroked path matches the
   chevrons and the select arrow already drawn this way. */
function PencilIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11.2 2.3a1.4 1.4 0 0 1 2 2L5.6 11.9l-2.8.8.8-2.8Z" />
    <path d="M10 3.5 12.5 6" />
  </svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.8 4.4h10.4" />
    <path d="M6.2 4.4V2.9h3.6v1.5" />
    <path d="M4.2 4.4l.6 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.1" />
    <path d="M6.7 7v4M9.3 7v4" />
  </svg>;
}

/* ---------------------------------------------------------- preset editor */

/**
 * The editor for one preset, over the page rather than in place: a preset
 * states six different kinds of thing, which needs more room than the card it
 * replaces and would otherwise push the rest of the list out of view.
 *
 * The draft is held here and returned whole on save, so a cancelled edit
 * leaves the saved preset untouched.
 */
function PresetEditor({ draft, isNew, onCancel, onSave }: {
  draft: RunePotentialPreset;
  isNew: boolean;
  onCancel: () => void;
  onSave: (preset: RunePotentialPreset) => void;
}) {
  const [preset, setPreset] = useState<RunePotentialPreset>(draft);
  const nameField = useRef<HTMLInputElement>(null);

  /* Escape closes it, as it does any overlay, and the name takes focus on
     open so a new preset can be named without reaching for the mouse. */
  useEffect(() => {
    nameField.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const named = preset.name.trim().length > 0;
  function update(change: Partial<RunePotentialPreset>) { setPreset((current) => ({ ...current, ...change })); }
  function updateSlot(slot: keyof RunePotentialPreset['slots'], choice: PresetChoice<RuneMainStat>) {
    setPreset((current) => ({ ...current, slots: { ...current.slots, [slot]: choice } }));
  }
  function updateTarget(key: keyof PresetStatTargets, value: number | undefined) {
    setPreset((current) => {
      const targets = { ...current.targets };
      if (value === undefined) delete targets[key]; else targets[key] = value;
      return { ...current, targets };
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!named) return;
    onSave({ ...preset, name: preset.name.trim() });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="dialog editor" role="dialog" aria-modal="true" aria-labelledby="preset-editor-title" onSubmit={submit}>
      <header className="editor-head">
        <p className="eyebrow">{isNew ? 'Add preset' : 'Edit preset'}</p>
        <h2 id="preset-editor-title">{isNew ? 'A new preset' : preset.name.trim() || 'This preset'}</h2>
      </header>

      <div className="editor-body">
        <div className="editor-pair">
          <label className="field"><span>Name</span>
            <input ref={nameField} value={preset.name} placeholder="e.g. Fast DD"
              onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label className="field"><span>Type</span>
            <select value={preset.type} onChange={(event) => update({ type: event.target.value as PresetType })}>
              {presetTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>

        <EditorBlock title="Rune sets" note="Preferred is what the role is built around. Acceptable still works when the box does not oblige.">
          <ChoiceEditor choice={preset.sets} options={runeSetNameList} columns
            onChange={(sets) => update({ sets })} />
        </EditorBlock>

        <EditorBlock title="Rune slots" note="Slots 1, 3 and 5 carry a fixed main stat, so only these three are stated.">
          <div className="editor-slots">
            {([['slot2', 'Slot 2'], ['slot4', 'Slot 4'], ['slot6', 'Slot 6']] as const).map(([key, label]) => <div className="editor-slot" key={key}>
              <p className="editor-slot-label">{label}</p>
              <ChoiceEditor choice={preset.slots[key]} options={runeMainStats}
                onChange={(choice) => updateSlot(key, choice)} />
            </div>)}
          </div>
        </EditorBlock>

        <EditorBlock title="Artifacts" note="Which artifact primary stats suit this role.">
          <div className="editor-flags">
            {([['atk', 'ATK'], ['def', 'DEF'], ['hp', 'HP']] as const).map(([key, label]) => <CheckboxRow
              key={key}
              label={label}
              checked={preset.artifacts[key]}
              onChange={(checked) => update({ artifacts: { ...preset.artifacts, [key]: checked } })} />)}
          </div>
        </EditorBlock>

        <EditorBlock title="Desired stats" note="Leave a stat empty for one this role does not aim at. DMG, E.HP and E.HP D follow from these and are not entered.">
          <div className="editor-targets">
            {presetStatTargetKeys.map((key) => {
              const column = presetTargetColumns.find((entry) => entry.key === key);
              const value = preset.targets[key];
              return <label className="field field-compact" key={key}>
                <span>{column?.label ?? key}{column?.unit}</span>
                <input type="number" min={0} step={1} inputMode="numeric"
                  value={value === undefined ? '' : value}
                  placeholder="—"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const parsed = Number(raw);
                    updateTarget(key, raw === '' || !Number.isFinite(parsed) ? undefined : Math.max(0, Math.round(parsed)));
                  }} />
              </label>;
            })}
          </div>
        </EditorBlock>
      </div>

      <div className="dialog-actions">
        <button type="button" className="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={!named}>
          {isNew ? 'Add preset' : 'Save changes'}
        </button>
      </div>
    </form>
  </div>;
}

/** A titled group inside the editor, so the six kinds of thing stay separated. */
function EditorBlock({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="editor-block">
    <h3 className="editor-block-title">{title}</h3>
    {note && <p className="editor-note">{note}</p>}
    {children}
  </section>;
}

/**
 * One preferred/acceptable choice, as a row of three-state chips: unchosen,
 * preferred, acceptable. A chip cycles on click, so both halves of the choice
 * are set from one list rather than from two lists the reader has to keep in
 * step — and a value cannot end up in both, which the data forbids.
 */
function ChoiceEditor<T extends string>({ choice, options, columns = false, onChange }: {
  choice: PresetChoice<T>;
  options: readonly T[];
  columns?: boolean;
  onChange: (choice: PresetChoice<T>) => void;
}) {
  function state(option: T): 'preferred' | 'acceptable' | 'none' {
    if (choice.preferred.includes(option)) return 'preferred';
    if (choice.acceptable.includes(option)) return 'acceptable';
    return 'none';
  }
  function cycle(option: T) {
    const without = {
      preferred: choice.preferred.filter((entry) => entry !== option),
      acceptable: choice.acceptable.filter((entry) => entry !== option),
    };
    /* none → preferred → acceptable → none, in the order the card reads them. */
    if (state(option) === 'none') return onChange({ ...without, preferred: [...without.preferred, option] });
    if (state(option) === 'preferred') return onChange({ ...without, acceptable: [...without.acceptable, option] });
    onChange(without);
  }

  return <div className={columns ? 'choice-editor columns' : 'choice-editor'}>
    {options.map((option) => {
      const current = state(option);
      return <button
        type="button"
        key={option}
        className={`choice-chip ${current}`}
        onClick={() => cycle(option)}
        aria-pressed={current !== 'none'}
        title={current === 'none' ? `${option}: not wanted — click to prefer` : current === 'preferred' ? `${option}: preferred — click to accept` : `${option}: acceptable — click to clear`}
      >
        <span className="choice-chip-mark" aria-hidden="true" />
        {option}
        <span className="choice-chip-state">{current === 'preferred' ? 'Preferred' : current === 'acceptable' ? 'Acceptable' : ''}</span>
      </button>;
    })}
  </div>;
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>;
}

/* ------------------------------------------------------------ preferences */

function PreferencesSection({ monsters, preferences, onUpdate, onExport, onImport }: {
  monsters: MonsterRecord[];
  preferences: Preferences;
  onUpdate: (unitId: string, update: Partial<MonsterPreference>) => Promise<void>;
  onExport: () => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState('');

  if (!monsters.length) return <div className="section-body">
    <PageHeader
      title="Call them what you call them"
      tagline="Give each monster the name you actually use and the goals you actually have. Kept separate from the import, so replacing your data keeps them." />
    <section className="empty-state">
      <h2>Nothing to name until a game file is imported.</h2>
      <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
    </section>
  </div>;

  const defaultNames = numberedMonsterNames(monsters);
  const term = search.trim().toLowerCase();
  const visible = monsters.filter((monster, index) => {
    if (!term) return true;
    const unitId = String(monster.unit_id ?? `unknown-${index}`);
    const preference = preferences.monsterPreferences[unitId];
    return (preference?.label || defaultNames[unitId]).toLowerCase().includes(term);
  });

  return <>
    <div className="filter-strip">
      <div className="filter-group">
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter monsters" aria-label="Filter monsters by name" />
          {search && <button className="filter-button" onClick={() => setSearch('')} aria-label="Clear filter">✕</button>}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Preferences file</span>
        <button className="filter-button" onClick={onExport}>Download .sw</button>
        <button className="filter-button" onClick={onImport}>Load .sw</button>
      </div>
    </div>

    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="align-left">#</th>
            <th className="align-left">Monster</th>
            <th className="align-left">Personal name</th>
            <th className="align-left">Rune requirements</th>
            <th className="align-left">Stat goals</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((monster, index) => {
            const unitId = String(monster.unit_id ?? `unknown-${index}`);
            const current = preferences.monsterPreferences[unitId] ?? { unitId, label: '', runeSets: '', statGoals: '' };
            const display = monsterPresentation(monster.unit_master_id);
            return <tr key={unitId}>
              <td className="align-left row-index">{String(index + 1).padStart(2, '0')}</td>
              <td className="align-left">
                <div className="monster-cell">
                  <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={defaultNames[unitId]} />
                  <span className="monster-name">{defaultNames[unitId]}</span>
                </div>
              </td>
              <td className="align-left"><PreferenceInput key={`label:${current.label}`} value={current.label} placeholder="e.g. DB12 Verdehile"
                onCommit={(value) => void onUpdate(unitId, { label: value })} /></td>
              <td className="align-left"><PreferenceInput key={`sets:${current.runeSets}`} value={current.runeSets} placeholder="To be defined"
                onCommit={(value) => void onUpdate(unitId, { runeSets: value })} /></td>
              <td className="align-left"><PreferenceInput key={`goals:${current.statGoals}`} value={current.statGoals} placeholder="To be defined"
                onCommit={(value) => void onUpdate(unitId, { statGoals: value })} /></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <div className="grid-footer">
      <span><b>{visible.length}</b> of {monsters.length} shown</span>
      <span className="spacer" />
      <span>saved on this computer</span>
    </div>
  </>;
}

/**
 * Preference fields write to IndexedDB on every change, so the value is held
 * locally while typing and committed when the field is left. This keeps a long
 * roster responsive without losing an edit.
 */
function PreferenceInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <input
    className="cell-input"
    value={draft}
    placeholder={placeholder}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
  />;
}
