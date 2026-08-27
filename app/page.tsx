'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/local-store';
import { blankPreferences, createImportedGame, defaultRunePotentialSettings, fileToText, importPreferencesFile, normalizeImportedGame, validateGameFile } from './lib/imports';
import { monsterPresentation } from './lib/monster-catalog';
import { calculateMonsterTotals } from './lib/monster-stats';
import { activeRuneSets, elementName } from './lib/rune-sets';
import { runePotentialPresets } from './lib/rune-potential-presets';
import type { ImportedGame, MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder } from './lib/types';

type Page = 'home' | 'monsters' | 'optimizer' | 'speed' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'preferences';
type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';
type MonsterRecord = Record<string, unknown>;

const navigation: Array<{ id: Page; label: string; glyph: string }> = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'monsters', label: 'Monsters', glyph: '♜' },
  { id: 'optimizer', label: 'Rune Optimizer', glyph: '◈' },
  { id: 'speed', label: 'Speed Tuning', glyph: '↝' },
  { id: 'potential', label: 'Rune Potential', glyph: '◌' },
  { id: 'artifacts', label: 'Artifacts', glyph: '◇' },
  { id: 'gems', label: 'Gems & Grinds', glyph: '✦' },
  { id: 'relics', label: 'Relics', glyph: '▣' },
  { id: 'preferences', label: 'Preferences', glyph: '⚙' },
];

const upcomingWorkspaces: Record<'optimizer' | 'speed' | 'artifacts' | 'gems' | 'relics', { title: string; text: string }> = {
  optimizer: { title: 'Rune Optimizer', text: 'Finds rune combinations that meet the requirements you save for each monster.' },
  speed: { title: 'Speed Tuning', text: 'Works out the rune speeds your team needs to take turns in the order you intend.' },
  artifacts: { title: 'Artifacts', text: 'Compares artifact effects against the monsters that would gain most from them.' },
  gems: { title: 'Gems & Grinds', text: 'Ranks the gem and grindstone upgrades that move your account furthest.' },
  relics: { title: 'Relics', text: 'Evaluates relic choices against the goals you have saved.' },
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
        ? { ...savedPreferences, runePotential: { ...defaultRunePotentialSettings, ...savedPreferences.runePotential } }
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

  const active = navigation.find((item) => item.id === page);
  const exportPreferences = () => download('swaggr-preferences.sw', JSON.stringify(preferences, null, 2));

  return <main className="app-shell">
    <nav className="rail" aria-label="Swaggr sections">
      <div className="rail-mark" aria-hidden="true">S</div>
      {navigation.map((item) => <button
        key={item.id}
        className={page === item.id ? 'rail-item active' : 'rail-item'}
        onClick={() => setPage(item.id)}
        title={item.label}
        aria-label={item.label}
        aria-current={page === item.id ? 'page' : undefined}
      ><span aria-hidden="true">{item.glyph}</span></button>)}
      <div className="rail-spacer" />
      <button className="rail-item" onClick={() => openReport()} title="Report missing data" aria-label="Report missing data">
        <span aria-hidden="true">!</span>
      </button>
    </nav>

    <section className="workspace">
      <header className="topbar">
        <h1>{active?.label}{game && <em>{monsters.length.toLocaleString('en')} monsters · {count(game.data.runes).toLocaleString('en')} runes</em>}</h1>
        <div className="topbar-spacer" />
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
        onUpdate={updateRunePotentialSettings}
      />}

      {page === 'preferences' && <PreferencesSection
        monsters={monsters}
        preferences={preferences}
        onUpdate={updateMonsterPreference}
        onExport={exportPreferences}
        onImport={() => settingsInput.current?.click()}
      />}

      {(page === 'optimizer' || page === 'speed' || page === 'artifacts' || page === 'gems' || page === 'relics') && <div className="section-body">
        <section className="empty-state">
          <p className="eyebrow">Foundation ready</p>
          <h2>{upcomingWorkspaces[page].title}</h2>
          <p>{upcomingWorkspaces[page].text}</p>
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
    <div className="section-intro">
      <p className="eyebrow">Local-only workspace</p>
      <h2>Your Summoners War decisions, in one place</h2>
      <p>Import a JSON file, set goals for individual monsters, and use each workspace as it becomes available. Your game data never leaves this computer.</p>
    </div>

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

    {message && <p className="notice" role="status" style={{ marginTop: 16 }}>{message}</p>}

    {game && <>
      <div className="section-intro" style={{ marginTop: 28 }}>
        <h2>Imported game data</h2>
        <p>{game.fileName} · imported {dateTime(game.importedAt)}</p>
      </div>
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

      {unknownMonsterIds.length > 0 && <p className="notice warning" style={{ marginTop: 16 }}>
        Name information is missing for monster type{unknownMonsterIds.length === 1 ? '' : 's'} {unknownMonsterIds.join(', ')}.{' '}
        <button className="notice-link" onClick={() => onReport('Monster', `Swaggr could not find name information for monster type(s): ${unknownMonsterIds.join(', ')}.`)}>Report this</button>
      </p>}

      <div className="button-row" style={{ marginTop: 20 }}>
        <button className="button danger" onClick={onRemove}>Remove game data</button>
      </div>
    </>}

    <div className="section-intro" style={{ marginTop: 32 }}>
      <h2>Your preferences</h2>
      <p>Personal names, monster goals and rune requirements are stored separately from the game import, so replacing your data keeps them.</p>
    </div>
    <div className="button-row">
      <button className="button" onClick={onExportPreferences}>Download .sw file</button>
      <button className="button" onClick={onImportPreferences}>Load .sw file</button>
    </div>
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
    <section className="empty-state">
      <p className="eyebrow">Monsters</p>
      <h2>Start with a game import</h2>
      <p>After importing your JSON file, every monster and its current stats appear here.</p>
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

/* -------------------------------------------------------- rune potential */

function RunePotentialSection({ settings, onUpdate }: {
  settings: RunePotentialSettings;
  onUpdate: (update: Partial<RunePotentialSettings>) => Promise<void>;
}) {
  const sortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
  return <div className="section-body">
    <div className="section-intro">
      <p className="eyebrow">Before you spend mana</p>
      <h2>Set your RNG personality</h2>
      <p>Tell Swaggr how optimistic to be before a rune is worth powering up. These settings are saved with your preferences.</p>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, maxWidth: 900 }}>
      <PotentialSlider id="power-up-policy" label="Power-up policy" value={settings.powerUpPolicy} steps={5}
        description="How willing are you to roll runes with potential?"
        lowLabel="Every contender" highLabel="Slam dunks only"
        onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
      <PotentialSlider id="rune-quality" label="Rune quality floor" value={settings.runeQuality} steps={5}
        description="How high must a rune's best case be before it earns a roll?"
        lowLabel="Rough diamonds" highLabel="Hall of famers"
        onChange={(value) => void onUpdate({ runeQuality: value })} />
      <PotentialSlider id="enchanted-gems" label="Enchanted gems" value={settings.enchantedGems} steps={4}
        description="How generously should gem upgrades count toward potential?"
        lowLabel="Leave them out" highLabel="Maximum value"
        onChange={(value) => void onUpdate({ enchantedGems: value })} />
      <PotentialSlider id="grindstones" label="Grindstones" value={settings.grindstones} steps={4}
        description="How generously should grindstone upgrades count toward potential?"
        lowLabel="Leave them out" highLabel="Maximum value"
        onChange={(value) => void onUpdate({ grindstones: value })} />
    </div>

    <div className="section-intro" style={{ marginTop: 30 }}>
      <h2>Overview filters</h2>
    </div>
    <div style={{ display: 'grid', gap: 9, maxWidth: 440 }}>
      <CheckboxRow label="Include runes at Lv. 12 and above" checked={settings.includeLevel12Runes}
        onChange={(checked) => void onUpdate({ includeLevel12Runes: checked })} />
      <CheckboxRow label="Include runes equipped on monsters" checked={settings.includeEquippedRunes}
        onChange={(checked) => void onUpdate({ includeEquippedRunes: checked })} />
      <label className="field" style={{ marginTop: 8 }}><span>Sort order</span>
        <select value={settings.sortOrder} onChange={(event) => void onUpdate({ sortOrder: event.target.value as RunePotentialSortOrder })}>
          {sortOrders.map((order) => <option key={order}>{order}</option>)}
        </select>
      </label>
    </div>

    <div className="section-intro" style={{ marginTop: 34 }}>
      <h2>Presets</h2>
      <p>These source-controlled presets pair the rune sets and target stats that suit each role. They are read-only until the preset editor arrives.</p>
    </div>
    <div className="table-wrap" style={{ maxWidth: 900, border: '1px solid var(--line)', borderRadius: 8 }}>
      <table className="grid-table">
        <thead>
          <tr>
            <th className="align-left">Preset</th>
            <th className="align-left">Desired sets</th>
            <th className="align-left">Target stats</th>
          </tr>
        </thead>
        <tbody>
          {runePotentialPresets.map((preset) => <tr key={preset.id}>
            <td className="align-left">
              <span className="monster-name">{preset.name}<small>{preset.description}</small></span>
            </td>
            <td className="align-left">
              {preset.desirableSets.map((set) => <span className="set-mark" key={set}>{set}</span>)}
            </td>
            <td className="align-left">
              {preset.desirableStats.map((stat) => <span className="set-mark" key={stat}>{stat}</span>)}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function PotentialSlider({ id, label, value, steps, description, lowLabel, highLabel, onChange }: {
  id: string; label: string; value: number; steps: number;
  description: string; lowLabel: string; highLabel: string;
  onChange: (value: number) => void;
}) {
  return <div>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--gold)', background: 'var(--gold-deep)', border: '1px solid var(--gold-edge)', borderRadius: 4, padding: '1px 6px' }}>
        {value} / {steps}
      </span>
    </div>
    <p style={{ margin: '5px 0 10px', color: 'var(--dim)', fontSize: 11.5, lineHeight: 1.45 }}>{description}</p>
    <input id={id} type="range" min={1} max={steps} step={1} value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-describedby={`${id}-ends`}
      style={{ width: '100%', accentColor: 'var(--gold)', margin: 0 }} />
    <p id={`${id}-ends`} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, margin: '6px 0 0', color: 'var(--faint)', fontSize: 10 }}>
      <span>{lowLabel}</span><span style={{ textAlign: 'right' }}>{highLabel}</span>
    </p>
  </div>;
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--dim)', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}
      style={{ width: 14, height: 14, margin: 0, accentColor: 'var(--gold)' }} />
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
    <section className="empty-state">
      <p className="eyebrow">Preferences</p>
      <h2>Start with a game import</h2>
      <p>After importing your JSON file, you can give each monster a personal name and save its goals here.</p>
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
    value={draft}
    placeholder={placeholder}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    style={{
      width: '100%', background: 'transparent', color: 'var(--ink)',
      border: '1px solid transparent', borderRadius: 4, padding: '3px 6px', fontSize: 12,
    }}
    onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--line-strong)'; event.currentTarget.style.background = 'var(--sunk)'; }}
    onBlurCapture={(event) => { event.currentTarget.style.borderColor = 'transparent'; event.currentTarget.style.background = 'transparent'; }}
  />;
}
