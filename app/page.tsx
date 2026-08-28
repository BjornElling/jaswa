'use client';

import { ChangeEvent, DragEvent, FormEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { WorkspacePage } from './components/workspace-page';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/local-store';
import { blankPreferences, createImportedGame, defaultRunePotentialSettings, fileToText, importPreferencesFile, itemGrades, normalizeImportedGame, normalizePreferences, validateGameFile } from './lib/imports';
import { detectGraphicsCard, disabledStatus } from './lib/hardware-acceleration';
import type { AccelerationState, AccelerationStatus } from './lib/hardware-acceleration';
import { monsterPresentation } from './lib/monster-catalog';
import type { MonsterArchetype } from './lib/monster-catalog';
import { calculateMonsterTotals } from './lib/monster-stats';
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from './lib/rune-potential-metrics';
import { activeRuneSets, elementName, presetRuneSetNameList } from './lib/rune-sets';
import {
  createRunePotentialPreset, presetNameMaximum, presetStatTargetKeys, presetTargetColumns,
  presetTargetMaximum, presetTypes, runeMainStats, withRefreshedMetrics,
} from './lib/rune-potential-presets';
import type { PresetChoice, PresetStatTargets, PresetType, RuneMainStat, RunePotentialPreset } from './lib/rune-potential-presets';
import type { ImportedGame, ItemGrade, MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder } from './lib/types';

type Page = 'home' | 'monsters' | 'optimizer' | 'speed' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'preferences';
type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';
type MonsterRecord = Record<string, unknown>;
type EquipmentPrimaryType = 'HP' | 'ATK' | 'DEF';
type EquipmentPrimaryTypeSlot = EquipmentPrimaryType | null;
const monsterArchetypeLabels: Record<MonsterArchetype, string> = {
  Attack: 'ATK', Defense: 'DEF', HP: 'HP', Support: 'SUP', Material: 'MAT', none: 'NONE',
};
const monsterFilterArchetypes: MonsterArchetype[] = ['Attack', 'Defense', 'HP', 'Support'];

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

/* One word each, so the verdict reads at a glance and the four are the same
   kind of answer to the same question. */
const accelerationWords: Record<AccelerationState, string> = {
  checking: 'Checking',
  disabled: 'Disabled',
  ready: 'Connected',
  unavailable: 'Unavailable',
};

type NumericSortKey = 'level' | 'hp' | 'atk' | 'def' | 'spd' | 'criticalRate' | 'criticalDamage' | 'resistance' | 'accuracy' | 'ehp' | 'ehpD' | 'dmg';
type EquipmentSortKey = 'artifactTypes' | 'relicTypes';
type SortKey = 'index' | 'name' | 'sets' | EquipmentSortKey | NumericSortKey;
type MonsterGridColumn = { key: SortKey; label: string };

type MonsterRow = {
  unitId: string;
  name: string;
  secondaryName?: string;
  element?: string;
  archetype?: MonsterArchetype;
  imageFilename?: string;
  initial: string;
  sets: Array<{ name: string; abbreviation: string }>;
  artifactTypes: EquipmentPrimaryTypeSlot[];
  relicTypes: EquipmentPrimaryTypeSlot[];
  index: number;
  inStorage: boolean;
  level: number | null;
  hp: number | null;
  atk: number | null;
  def: number | null;
  spd: number | null;
  criticalRate: number | null;
  criticalDamage: number | null;
  resistance: number | null;
  accuracy: number | null;
  ehp: number | null;
  ehpD: number | null;
  dmg: number | null;
};

function MonsterColumnGroup({ columns }: { columns: MonsterGridColumn[] }) {
  return <colgroup>
    <col className="monster-col-index" />
    <col className="monster-col-name" />
    <col className="monster-col-sets" />
    {columns.map((column) => <col key={column.key} className={`monster-col-${column.key}`} />)}
    <col className="monster-col-artifacts" />
    <col className="monster-col-relic" />
    <col className="monster-col-ehp" />
    <col className="monster-col-ehpD" />
    <col className="monster-col-dmg" />
  </colgroup>;
}

function MonsterTableHeader({ columns, sortHeader }: {
  columns: MonsterGridColumn[];
  sortHeader: (key: SortKey, label: string, alignLeft?: boolean, extraClassName?: string) => ReactNode;
}) {
  return <thead>
    <tr>
      {sortHeader('index', '#', true)}
      {sortHeader('name', 'Monster', true)}
      {sortHeader('sets', 'Runes', true)}
      {columns.map((column) => sortHeader(column.key, column.label))}
      {sortHeader('artifactTypes', 'Artifacts', false, 'equipment-start')}
      {sortHeader('relicTypes', 'Relic')}
      {sortHeader('ehp', 'E.HP')}
      {sortHeader('ehpD', 'E.HP D')}
      {sortHeader('dmg', 'DMG')}
    </tr>
  </thead>;
}

function count(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
/* An unparseable timestamp makes Intl throw a RangeError, and this is read from
   the import badge on every render — so a single bad stored date would take the whole
   app down rather than one line of it. An unreadable date is reported as
   unknown, which is all the reader can do anything with anyway. */
function dateTime(value?: string): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'an unknown time';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
function numericOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
/* The game export marks a monster's whereabouts with `building_id`: zero for
   the roster it summons from, the Monster Storage building's own id for
   anything put away. A missing field is read as "not stored", so a file that
   predates the field still shows its whole roster rather than none of it. */
function isStoredMonster(monster: MonsterRecord): boolean {
  const buildingId = numericOrNull(monster.building_id);
  return buildingId !== null && buildingId !== 0;
}
const equipmentPrimaryTypes: Record<number, EquipmentPrimaryType> = { 100: 'HP', 101: 'ATK', 102: 'DEF' };
function primaryEquipmentType(item: unknown): EquipmentPrimaryTypeSlot {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const effect = (item as MonsterRecord).pri_effect;
  if (!Array.isArray(effect) || typeof effect[0] !== 'number' || !Number.isFinite(effect[0])) return null;
  return equipmentPrimaryTypes[effect[0]] ?? null;
}
function equippedEquipmentTypes(monster: MonsterRecord, key: 'artifacts' | 'relics'): EquipmentPrimaryTypeSlot[] {
  if (!Array.isArray(monster[key])) return [];
  return monster[key].map(primaryEquipmentType);
}
function displayArtifactTypes(types: EquipmentPrimaryTypeSlot[]): string {
  if (!types.some((type) => type !== null)) return '—';
  return [types[0] ?? '-', types[1] ?? '-'].join('/');
}
function displayRelicType(types: EquipmentPrimaryTypeSlot[]): string {
  return types.find((type): type is EquipmentPrimaryType => type !== null) ?? '—';
}
function blankMonsterPreference(unitId: string): MonsterPreference { return { unitId, label: '', runeSets: '', statGoals: '' }; }
const monsterNameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const defaultMonsterSortDirections: Record<SortKey, boolean> = {
  index: true, name: true, sets: true,
  artifactTypes: true, relicTypes: true,
  level: false, hp: false, atk: false, def: false, spd: false,
  criticalRate: false, criticalDamage: false, resistance: false, accuracy: false,
  ehp: false, ehpD: false, dmg: false,
};
function displayNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en');
}
function compareNumbersWithBlanks(left: number | null, right: number | null, direction: number): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return (left - right) * direction;
}
function compareTextWithBlanks(left: string | null, right: string | null, direction: number): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return monsterNameCollator.compare(left, right) * direction;
}
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
      /* Everything read back is normalized, not merely spread over the
         defaults. A stored setting of `null`, a string, or a step outside its
         own scale used to reach a slider unaltered, where it showed a thumb at
         one position and a blank description under it. */
      setPreferences(savedPreferences ? normalizePreferences(savedPreferences) : blankPreferences());
    }).catch(() => {
      /* A record too broken to read is not worth taking the app down for: the
         workspace opens empty, which the user can recover from by importing. */
      setPreferences(blankPreferences());
    }).finally(() => setReady(true));
  }, []);

  /* `data` is guarded as well as `game`: a partially written record in
     IndexedDB has no `data` at all, and reaching through it threw during the
     first render, before anything was on screen. */
  const monsters = useMemo(
    () => (Array.isArray(game?.data?.unit_list) ? game.data.unit_list : []) as MonsterRecord[],
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
      setMessage('JASWA could not read this file. Please choose the original JSON file exported from Summoners War.');
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
  /**
   * The one path that changes preferences. The change is applied to whatever
   * state React holds at the moment it runs, not to the value captured when the
   * handler was created: a slider drag and a checkbox toggled in the same
   * moment both used to build from the same stale copy, so the second write
   * silently undid the first.
   */
  function changePreferences(change: (current: Preferences) => Preferences) {
    setPreferences((current) => {
      const next = { ...change(current), updatedAt: new Date().toISOString() };
      void savePreferences(next);
      return next;
    });
  }
  function updateMonsterPreference(unitId: string, update: Partial<MonsterPreference>) {
    changePreferences((current) => ({
      ...current,
      monsterPreferences: {
        ...current.monsterPreferences,
        /* The blank record first, so a preference saved before all three
           fields existed cannot leave one of them undefined and turn its
           input uncontrolled. */
        [unitId]: { ...blankMonsterPreference(unitId), ...current.monsterPreferences[unitId], ...update, unitId },
      },
    }));
  }
  function updateHardwareAcceleration(enabled: boolean) {
    changePreferences((current) => ({ ...current, hardwareAcceleration: enabled }));
  }
  function updateRunePotentialSettings(update: Partial<RunePotentialSettings>) {
    changePreferences((current) => ({
      ...current,
      runePotential: { ...(current.runePotential ?? defaultRunePotentialSettings), ...update },
    }));
  }
  /**
   * Presets are written whole rather than patched: an edit can change every
   * part of one at once, and the editor already holds the finished preset.
   */
  function writePresets(change: (current: RunePotentialPreset[]) => RunePotentialPreset[]) {
    changePreferences((current) => ({ ...current, runePotentialPresets: change(current.runePotentialPresets ?? []) }));
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
      setMessage('JASWA could not read this settings file. Please choose a .sw file exported from JASWA.');
    } finally { event.target.value = ''; }
  }
  function openReport(category: ReportCategory = 'Other', details = '') { setReport({ category, details }); }
  function sendReport() {
    if (!report) return;
    const importDetails = game ? `\n\nActive import: ${game.fileName}\nImported: ${dateTime(game.importedAt)}` : '';
    const body = `Hello,\n\nI found missing or unrecognized data in JASWA.\n\nCategory: ${report.category}\n\nDetails:\n${report.details || 'Please describe what JASWA could not recognize.'}${importDetails}\n\nPlease do not attach your full game JSON file.`;
    window.location.href = `mailto:bj.elling@gmail.com?subject=${encodeURIComponent(`JASWA missing data: ${report.category}`)}&body=${encodeURIComponent(body)}`;
    setReport(null);
  }

  if (!ready) return <main className="loading-screen">Preparing your local workspace…</main>;

  const exportPreferences = () => download('jaswa-preferences.sw', JSON.stringify(preferences, null, 2));

  return <main className="app-shell">
    <nav className="rail" aria-label="jaswa sections">
      <div className="rail-brand">
        <Image className="rail-mark" src="/favicon.svg" alt="" aria-hidden="true" width={34} height={34} priority />
        {/* The two letters the joke turns on are marked in place rather than
           spelled out: the name still reads and copies as one word. */}
        <b>ja<span className="brand-sw">sw</span>a</b>
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
      {/* The section is named by its own PageHeader and the content reaches
          the top of the window, so the state of the import is a small card
          resting in the top-right corner rather than a bar across the page. */}
      <aside className={game ? 'import-badge live' : 'import-badge'} aria-label="Imported game data">
        {game && <>
          <p className="import-badge-count">
            {monsters.length.toLocaleString('en')} monsters · {count(game.data.runes).toLocaleString('en')} runes
          </p>
          {/* The second line carries the collections the workspaces for them are
              still being written against; gems and grindstones arrive in one
              list from the game, so they are counted as one figure here too. */}
          <p className="import-badge-count secondary">
            {count(game.data.rune_craft_item_list).toLocaleString('en')} gems &amp; grinds · {count(game.data.artifacts).toLocaleString('en')} artifacts · {count(game.data.relics).toLocaleString('en')} relics
          </p>
        </>}
        <p className="import-badge-when">
          {game ? `imported ${dateTime(game.importedAt)}` : 'no game data'}
        </p>
      </aside>

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
        hardwareAcceleration={preferences.hardwareAcceleration}
        onHardwareAcceleration={updateHardwareAcceleration}
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

      {(page === 'optimizer' || page === 'speed' || page === 'artifacts' || page === 'gems' || page === 'relics') && <WorkspacePage
        header={<PageHeader
          title={upcomingWorkspaces[page].title}
          tagline={upcomingWorkspaces[page].tagline} />}
      >
        <section className="empty-state">
          <h2>{upcomingWorkspaces[page].text}</h2>
          <p className="next-step">{game
            ? 'Your current import is ready for this workspace. The calculation rules are being written next.'
            : 'Import your game data first. Your preferences can be prepared at any time.'}</p>
        </section>
      </WorkspacePage>}
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
          {pendingGame.report.unknownMonsterIds.length} monster type{pendingGame.report.unknownMonsterIds.length === 1 ? '' : 's'} {pendingGame.report.unknownMonsterIds.length === 1 ? 'is' : 'are'} newer than JASWA’s name list. {pendingGame.report.unknownMonsterIds.join(', ')} will still be imported, shown by game ID until the list is updated.{' '}
          <button className="notice-link" onClick={() => openReport('Monster', `JASWA could not find name information for monster type(s): ${pendingGame.report.unknownMonsterIds.join(', ')}.\n\nJSON file: ${pendingGame.fileName}`)}>Report this</button>
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
            placeholder="Include the name, game ID, or anything else shown by JASWA." />
        </label>
        <p className="notice">JASWA does not attach your game data to the e-mail.</p>
        <div className="dialog-actions">
          <button className="button" onClick={() => setReport(null)}>Cancel</button>
          <button className="button primary" onClick={sendReport}>Open e-mail</button>
        </div>
      </section>
    </div>}
  </main>;
}

/* ------------------------------------------------------------------ home */

/**
 * The verdict, as a mark rather than a word: a tick when the card answered, an
 * exclamation when the user has switched it off, a cross when it is not there.
 * Stroked paths in one 44px box, so the three states are the same size and the
 * box beneath them does not move as the answer changes.
 */
function AccelerationMark({ state }: { state: AccelerationState }) {
  /* An empty ring while the adapter is being asked for: at this moment JASWA
     has no verdict, and any of the three marks would be a claim. */
  const path = state === 'ready' ? 'M13 22.5 19.5 29 31 15'
    : state === 'disabled' ? 'M22 12v13M22 30.5v.5'
      : state === 'unavailable' ? 'M14 14 30 30M30 14 14 30'
        : '';
  return <span className={`acceleration-mark ${state}`} aria-hidden="true">
    <svg viewBox="0 0 44 44" width="44" height="44" fill="none" stroke="currentColor"
      strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="22" cy="22" r="19" strokeWidth="2" opacity=".45" />
      {path && <path d={path} />}
    </svg>
  </span>;
}

function HomeSection({ game, message, dragging, onPickFile, onDragOver, onDragLeave, onDrop, onRemove, onReport, onExportPreferences, onImportPreferences, hardwareAcceleration, onHardwareAcceleration }: {
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
  hardwareAcceleration: boolean;
  onHardwareAcceleration: (enabled: boolean) => void;
}) {
  const unknownMonsterIds = game?.report.unknownMonsterIds ?? [];
  /* What the card answered, kept apart from the setting: switching the setting
     off must not throw away a verdict that is still true, or the box would have
     to ask the browser again every time the box is ticked. */
  const [detected, setDetected] = useState<AccelerationStatus | null>(null);

  useEffect(() => {
    if (!hardwareAcceleration || detected) return;
    let current = true;
    void detectGraphicsCard().then((status) => { if (current) setDetected(status); });
    return () => { current = false; };
  }, [hardwareAcceleration, detected]);

  const status: AccelerationStatus = !hardwareAcceleration ? disabledStatus
    : detected ?? { state: 'checking', adapterName: 'Asking the browser…', detail: 'Looking for a graphics card JASWA can compute on.' };

  /* The home page announces the app rather than the section, so it opens with
     the name spelled out instead of the shared PageHeader. The three lines step
     to the right and the middle one carries the accent: the initials the name is
     built from are what the eye should catch. */
  return <WorkspacePage
    header={<header className="hero">
      <div className="hero-rune" aria-hidden="true">
        <Image src="/favicon.svg" alt="" width={520} height={520} priority />
      </div>
      {/* Announced as one name: read line by line it would be three
          fragments, and the stepped layout is visual rather than semantic. */}
      <h2 className="hero-name" aria-label="Just Another Summoners War App">
        <span aria-hidden="true" className="hero-line one">Just Another</span>
        <span aria-hidden="true" className="hero-line two">Summoners War</span>
        <span aria-hidden="true" className="hero-line three">App</span>
      </h2>
      {/* The game's actual loop, left to stand on its own under the name.
          The last beat is the one that never ends, so it is the one that
          takes the colour. */}
      <p className="hero-quote">Roll. Sell. <span>Repeat.</span></p>
    </header>}
  >
    {/* Above the import, because it decides how everything the import feeds
        will be computed rather than what is computed. The two columns are the
        settings layout the Rune Potential workspace uses: the choice on the
        left, and what came of it reported back on the right. */}
    <section className="panel">
      <h3 className="block-title">Hardware acceleration</h3>
      <div className="settings-layout">
        <div className="stack acceleration-choice">
          <p className="lead">
            Ranking a full rune inventory means running the same short sum
            hundreds of thousands of times. A graphics card runs thousands of
            those at once, where the processor takes them one after another, so
            a search that takes a minute on the processor can finish in seconds
            on the card. JASWA still does all of it on your own computer — the
            card is another part of your machine, not a service somewhere else.
          </p>
          <div className="stack tight">
            <p className="field-legend">Acceleration</p>
            <CheckboxRow label="Use the graphics card for heavy calculations" checked={hardwareAcceleration}
              onChange={onHardwareAcceleration} />
            {/* The way out, said before it is needed. Turning this off is the
                first thing to try if a workspace draws oddly or the machine
                grows hot, and a user who is not told that will reach for the
                browser's own settings instead. */}
            <p className="lead">
              Leave this on unless something looks wrong. JASWA falls back to the
              processor on its own where no card is available, so switching it
              off is only worth doing if a calculation misbehaves.
            </p>
          </div>
        </div>

        <div className="settings-rule" role="presentation" />

        <aside className="settings-aside">
          {/* The whole verdict is one live region rather than the word alone:
              the sentence under it changes with the word and is the part that
              says what to do about it, so announcing one without the other
              would give a listener half the answer. */}
          <section className={`statistics acceleration ${status.state}`} role="status">
            <h4>Connection</h4>
            <div className="acceleration-verdict">
              {/* The mark restates the word beside it, so it is hidden from a
                  reader who is listening rather than read out twice. */}
              <AccelerationMark state={status.state} />
              <p className="acceleration-word">{accelerationWords[status.state]}</p>
            </div>
            <p className="acceleration-detail">{status.detail}</p>
            <dl>
              <div>
                <dt>Graphics card</dt>
                <dd className="acceleration-adapter">{status.adapterName}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </section>

    <section className="panel">
      <h3 className="block-title">Game data</h3>
      <div className="stack">
        {/* Once data is in, the drop target stops being the loudest thing on
            the page: it shrinks to a quiet way back rather than continuing to
            ask for the file the user has already given. */}
        <div
          className={['drop-zone', dragging ? 'dragging' : '', game ? 'settled' : ''].filter(Boolean).join(' ')}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onPickFile}
          role="button" tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPickFile(); } }}
        >
          <span className="glyph" aria-hidden="true">↓</span>
          <strong>{game ? 'Replace with another JSON file' : 'Drop your Summoners War JSON file here'}</strong>
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
            <button className="notice-link" onClick={() => onReport('Monster', `JASWA could not find name information for monster type(s): ${unknownMonsterIds.join(', ')}.`)}>Report this</button>
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
  </WorkspacePage>;
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
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [selectedArchetypes, setSelectedArchetypes] = useState<MonsterArchetype[]>([]);
  /* The roster reads as the whole account by default; storage is a place a
     monster sits, not a reason to hide it. */
  const [showStorage, setShowStorage] = useState(true);
  const stickyHeaderTable = useRef<HTMLTableElement>(null);
  const rosterTable = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const header = stickyHeaderTable.current;
    const table = rosterTable.current;
    if (!header || !table) return;

    const syncHeaderWidth = () => { header.style.width = `${table.offsetWidth}px`; };
    syncHeaderWidth();
    const observer = new ResizeObserver(syncHeaderWidth);
    observer.observe(table);
    return () => observer.disconnect();
  }, [monsters.length]);

  const rows = useMemo<MonsterRow[]>(() => {
    const defaultNames = numberedMonsterNames(monsters);
    return monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const display = monsterPresentation(monster.unit_master_id);
      const totals = calculateMonsterTotals(monster);
      const preference = preferences.monsterPreferences[unitId];
      const baseHp = numericOrNull(monster.con);
      const baseAtk = numericOrNull(monster.atk);
      const baseDef = numericOrNull(monster.def);
      const baseSpd = numericOrNull(monster.spd);
      const hp = baseHp === null ? null : totals.hp;
      const atk = baseAtk === null ? null : totals.atk;
      const def = baseDef === null ? null : totals.def;
      const spd = baseSpd === null ? null : totals.spd;
      const criticalRate = numericOrNull(monster.critical_rate) === null ? null : totals.criticalRate;
      const criticalDamage = numericOrNull(monster.critical_damage) === null ? null : totals.criticalDamage;
      const metrics = calculateRunePotentialMetrics({
        atk: totals.atk, hp: totals.hp, def: totals.def,
        criticalRate: totals.criticalRate, criticalDamage: totals.criticalDamage,
      });
      return {
        unitId,
        name: preference?.label || defaultNames[unitId],
        secondaryName: preference?.label ? defaultNames[unitId] : display.secondaryName,
        element: elementName(monster.attribute),
        archetype: display.archetype,
        imageFilename: display.imageFilename,
        initial: display.shortName,
        sets: activeRuneSets(monster),
        artifactTypes: equippedEquipmentTypes(monster, 'artifacts'),
        relicTypes: equippedEquipmentTypes(monster, 'relics'),
        index,
        inStorage: isStoredMonster(monster),
        level: numericOrNull(monster.unit_level),
        hp, atk, def, spd, criticalRate, criticalDamage,
        resistance: numericOrNull(monster.resist) === null ? null : totals.resistance,
        accuracy: numericOrNull(monster.accuracy) === null ? null : totals.accuracy,
        ehp: hp === null || def === null ? null : displayRunePotentialMetric(metrics.ehp),
        ehpD: hp === null || def === null ? null : displayRunePotentialMetric(metrics.ehpD),
        dmg: atk === null || criticalRate === null || criticalDamage === null ? null : displayRunePotentialMetric(metrics.dmg),
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
      if (!showStorage && row.inStorage) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term)
        || row.secondaryName?.toLowerCase().includes(term)
        || row.sets.some((set) => set.name.toLowerCase().includes(term));
    });
    const { key, ascending } = sort;
    if (key === 'index') return ascending ? filtered : [...filtered].reverse();
    const direction = ascending ? 1 : -1;
    return [...filtered].sort((left, right) => {
      if (key === 'name') return monsterNameCollator.compare(left.name, right.name) * direction || left.index - right.index;
      if (key === 'sets' || key === 'artifactTypes' || key === 'relicTypes') {
        const values = key === 'sets'
          ? (row: MonsterRow) => row.sets.length ? row.sets.map((set) => set.name).join('/') : null
          : key === 'artifactTypes'
            ? (row: MonsterRow) => row.artifactTypes.some((type) => type !== null) ? displayArtifactTypes(row.artifactTypes) : null
            : (row: MonsterRow) => row.relicTypes.some((type) => type !== null) ? displayRelicType(row.relicTypes) : null;
        return compareTextWithBlanks(values(left), values(right), direction) || left.index - right.index;
      }
      return compareNumbersWithBlanks(left[key], right[key], direction) || left.index - right.index;
    });
  }, [rows, search, selectedElements, selectedArchetypes, showStorage, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      : { key, ascending: defaultMonsterSortDirections[key] });
  }

  function toggleElement(name: string) {
    setSelectedElements((current) => current.includes(name)
      ? current.filter((entry) => entry !== name)
      : [...current, name]);
  }

  function toggleArchetype(archetype: MonsterArchetype) {
    setSelectedArchetypes((current) => current.includes(archetype)
      ? current.filter((entry) => entry !== archetype)
      : [...current, archetype]);
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

  const columns: MonsterGridColumn[] = [
    { key: 'level', label: 'LVL' }, { key: 'hp', label: 'HP' }, { key: 'atk', label: 'ATK' },
    { key: 'def', label: 'DEF' }, { key: 'spd', label: 'SPD' }, { key: 'criticalRate', label: 'CR%' },
    { key: 'criticalDamage', label: 'CD%' }, { key: 'resistance', label: 'RES%' }, { key: 'accuracy', label: 'ACC%' },
  ];
  const sortHeader = (key: SortKey, label: string, alignLeft = false, extraClassName = '') => {
    const sorted = sort.key === key;
    const className = [alignLeft ? 'align-left' : '', 'sortable', sorted ? 'sorted' : '', sorted && sort.ascending ? 'ascending' : '', extraClassName]
      .filter(Boolean).join(' ');
    return <th key={key} scope="col" aria-sort={sorted ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>{label}</button>
    </th>;
  };
  return <>
    <div className="filter-strip">
      <div className="filter-group">
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter monsters" aria-label="Filter monsters by name or set" />
          {/* Always present, so the input does not resize on the first keystroke. */}
          <button className="filter-button" onClick={() => setSearch('')}
            hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter by element">
        <span className="filter-label">Element</span>
        {elements.map((name) => <button
          key={name}
          className={selectedElements.includes(name) ? 'filter-button active' : 'filter-button'}
          onClick={() => toggleElement(name)}
          aria-pressed={selectedElements.includes(name)}
        >{name.slice(0, 3).toUpperCase()}</button>)}
      </div>
      <div className="filter-group" role="group" aria-label="Filter by monster type">
        <span className="filter-label">Type</span>
        {monsterFilterArchetypes.map((archetype) => <button
          key={archetype}
          className={selectedArchetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
          onClick={() => toggleArchetype(archetype)}
          aria-pressed={selectedArchetypes.includes(archetype)}
        >{monsterArchetypeLabels[archetype]}</button>)}
      </div>
      <div className="filter-group">
        <span className="filter-label">Storage</span>
        {/* The visible label is the group's, so the box carries its own name
            for anyone who cannot see the two sit together. */}
        <input type="checkbox" className="filter-checkbox" checked={showStorage}
          onChange={(event) => setShowStorage(event.target.checked)}
          aria-label="Show monsters kept in storage" />
      </div>
      <span className="monster-filter-count"><b>{visible.length}</b> of {rows.length} shown</span>
    </div>

    <div className="monster-header-wrap">
      <table ref={stickyHeaderTable} className="grid-table monster-grid" aria-label="Monster roster columns">
        <MonsterColumnGroup columns={columns} />
        <MonsterTableHeader columns={columns} sortHeader={sortHeader} />
      </table>
    </div>
    <div className="table-wrap" onScroll={(event) => {
      if (stickyHeaderTable.current) stickyHeaderTable.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
    }}>
      <table ref={rosterTable} className="grid-table monster-grid" aria-label="Monster roster">
        <MonsterColumnGroup columns={columns} />
        <tbody>
          {visible.map((row) => <tr key={row.unitId}>
            <td className="align-left row-index">{String(row.index + 1).padStart(2, '0')}</td>
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
                ? <span className="set-mark" title={row.sets.map((set) => set.name).join(' / ')}>{row.sets.map((set) => set.abbreviation).join('/')}</span>
                : <span className="set-none">—</span>}
            </td>
            <td className={row.level === null ? 'dim muted' : 'dim'}>{displayNumber(row.level)}</td>
            <td className={row.hp === null ? 'muted' : undefined}>{displayNumber(row.hp)}</td>
            <td className={row.atk === null ? 'muted' : undefined}>{displayNumber(row.atk)}</td>
            <td className={row.def === null ? 'muted' : undefined}>{displayNumber(row.def)}</td>
            <td className={row.spd === null ? 'muted' : undefined}>{displayNumber(row.spd)}</td>
            <td className={row.criticalRate === null ? 'muted' : undefined}>{displayNumber(row.criticalRate)}</td>
            <td className={row.criticalDamage === null ? 'muted' : undefined}>{displayNumber(row.criticalDamage)}</td>
            <td className={row.resistance === null ? 'muted' : undefined}>{displayNumber(row.resistance)}</td>
            <td className={row.accuracy === null ? 'muted' : undefined}>{displayNumber(row.accuracy)}</td>
            <td className={row.artifactTypes.some((type) => type !== null) ? 'equipment-start equipment-types' : 'equipment-start muted'}>
              {displayArtifactTypes(row.artifactTypes)}
            </td>
            <td className={row.relicTypes.some((type) => type !== null) ? 'equipment-types' : 'muted'}>
              {displayRelicType(row.relicTypes)}
            </td>
            <td className={row.ehp === null ? 'muted' : undefined}>{displayNumber(row.ehp)}</td>
            <td className={row.ehpD === null ? 'muted' : undefined}>{displayNumber(row.ehpD)}</td>
            <td className={row.dmg === null ? 'muted' : undefined}>{displayNumber(row.dmg)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

  </>;
}

/* ------------------------------------------------------ shared furniture */

/**
 * The masthead a workspace opens with. The section name is stated here at
 * display size, so a page announces itself.
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
 *
 * A scale keeps one voice down its whole length — the player speaks on some,
 * JASWA describes on others — but no scale may be half one and half the other.
 *
 * Punctuation is the same on every scale, whoever is speaking:
 *
 *   No step ends in a full stop. A step is a label under a slider, not prose,
 *   and the closing stop buys nothing once every step in the column is missing
 *   one. `?` and `!` do close a step, because they carry the reading of it
 *   rather than merely ending it — a question or an exclamation is not the same
 *   sentence without its mark. An ellipsis may trail for the same reason.
 *
 *   It follows that a step is one statement. Two sentences would need a stop
 *   between them, and a step carrying an internal stop but none at the end
 *   reads as an oversight rather than a style — so a step that wants two
 *   clauses joins them with a comma or a dash instead.
 *
 * Anything appended for reference rather than voice — the multipliers on
 * `intangibleRunes` — sits in parentheses after the wording and is not part of
 * the sentence, so it neither takes nor prevents a mark.
 */
const potentialStepLabels = {
  powerUpPolicy: [
    'Full YOLO — anything with potential gets a roll',
    'Adventurous — a hint of promise is enough',
    'Balanced — rolls the runes worth rolling',
    'Picky — I like to play it safe',
    'Take no chances — only roll guaranteed keepers',
  ],
  /* This scale is the player speaking rather than JASWA describing, so the
     steps are said in the first person and place the reader in the game
     instead of grading the runes. */
  runeQuality: [
    'I’m a newbie — everything beats what I’ve got',
    'Been playing for a while, still some way to go',
    'I’ve got good runes, and I want more good runes',
    'G1 baby — they need some quality to stay',
    'I’ve got “you’ve seen my replays” high standards',
  ],
  /* Four steps up the same scale: nothing further, an ordinary roll, a good
     one, the best the grade allows. These describe what JASWA assumes you
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
  /* Loose to strict, like the four above them, so every track on the page reads
     the same way: further right is fussier. */
  acceptedRunes: [
    'I love all my runes equally',
    'Forgiving — if there’s potential, they stay',
    'Quality is quality',
    'Keep the best, 86 the rest',
    'Only want the best of the best of the best',
  ],
  brokenRunes: [
    'I love all things broken',
    'A good rune is a good rune',
    'Occasionally',
    'A very selected few',
    'No',
  ],
  /* A weight rather than a threshold, so each step says how much the rune is
     wanted and carries its multiplier along in parentheses — the figure is what
     the setting does, the wording is why you would pick it. The halves are set
     as fractions rather than 1.5 to keep the column reading as multiples. */
  intangibleRunes: [
    'All runes are created equal (×1)',
    'But they’re sooo pretty…!! (×1½)',
    'I need more. More! (×2)',
    'Got to catch ’em all (×3½)',
    'My precious…!!! (×5)',
  ],
} as const;

function RunePotentialSection({ settings, presets, onUpdate, onWritePresets }: {
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  onWritePresets: (change: (current: RunePotentialPreset[]) => RunePotentialPreset[]) => void;
}) {
  const sortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
  /* The preset being edited, held as a draft so a cancelled edit changes
     nothing, and `isNew` so cancelling a just-added preset does not leave an
     empty one behind. */
  const [editing, setEditing] = useState<{ draft: RunePotentialPreset; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<RunePotentialPreset | null>(null);

  /**
   * An edit replaces the preset it addresses; a new preset is appended. Both
   * read the list as it stands at the moment of the write, so an edit saved
   * after something else changed the list cannot take the rest of it back — and
   * a preset deleted while its editor was open stays deleted rather than being
   * resurrected by the save.
   */
  function savePreset(preset: RunePotentialPreset, isNew: boolean) {
    const saved = withRefreshedMetrics(preset);
    onWritePresets((current) => {
      if (isNew) return [...current, saved];
      const index = current.findIndex((entry) => entry.id === saved.id);
      return index === -1 ? current : current.map((entry) => (entry.id === saved.id ? saved : entry));
    });
    setEditing(null);
  }
  function deletePreset(id: string) {
    onWritePresets((current) => current.filter((entry) => entry.id !== id));
    setDeleting(null);
  }

  return <WorkspacePage
    header={<PageHeader
      title="Rune Potential"
      tagline="Which runes deserve your mana. Set your tolerance for disappointment below." />}
  >

    <Disclosure title="Settings" defaultOpen>
      <div className="stack">
        {/* The four questions about which runes you keep, in one block: two
            about what earns a roll, two about what you'll settle for. Two
            columns, so they read as one group of four rather than a list. */}
        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="power-up-policy" label="Power-up policy" value={settings.powerUpPolicy}
              description="How willing are you to roll runes with potential?"
              stepLabels={potentialStepLabels.powerUpPolicy}
              onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
            <PotentialSlider id="rune-quality" label="Rune quality floor" value={settings.runeQuality}
              description="How high must a rune's potential be before it earns a roll?"
              stepLabels={potentialStepLabels.runeQuality}
              onChange={(value) => void onUpdate({ runeQuality: value })} />
            <PotentialSlider id="accepted-runes" label="Accepted runes" value={settings.acceptedRunes}
              description="Non-preferred, but accepted. How B-tier are your standards?"
              stepLabels={potentialStepLabels.acceptedRunes}
              onChange={(value) => void onUpdate({ acceptedRunes: value })} />
            <PotentialSlider id="broken-runes" label="Broken runes" value={settings.brokenRunes}
              description="You didn’t ask for them. But do you want them?"
              stepLabels={potentialStepLabels.brokenRunes}
              onChange={(value) => void onUpdate({ brokenRunes: value })} />
          </div>

          <div className="settings-rule" role="presentation" />

          <aside className="settings-aside">
            {/* The outcome first, level with the four sliders that decide it.

                Dashes, not numbers. These read from the settings once the
                calculation exists; until then a figure here would be a claim
                about the settings that nothing behind it supports, and the two
                would not change as the sliders moved. */}
            <section className="statistics pending">
              <h4>Statistics</h4>
              <p className="statistics-lead">What your settings would give you, once the calculation is in place.</p>
              <dl>
                <div>
                  <dt>Percent to roll</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>Percent to keep</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </section>

            {/* Set apart from the box above by more than the aside's own gap,
                so it reads as its own question rather than as a footnote to the
                statistics. A weight, not a threshold — the four tracks in the
                column decide what a rune is worth, and this says how much that
                verdict counts for when the rune's value is the kind you cannot
                read off its lines. */}
            <PotentialSlider id="intangible-runes" label="Intangible runes"
                className="slider-compact aside-detached" value={settings.intangibleRunes}
                description="How badly do you want them?"
                stepLabels={potentialStepLabels.intangibleRunes}
                onChange={(value) => void onUpdate({ intangibleRunes: value })} />

            {/* The count follows the set, not the slot: a 4-set has to be filled
                four times over, so keeping as many candidates for it as for a
                2-set leaves it half the choice. */}
            <div className="stack tight">
              <p className="field-legend">4-sets vs. 2-sets</p>
              <CheckboxRow label="Keep twice as many 4-set runes" checked={settings.keepMoreForLargerSets}
                onChange={(checked) => void onUpdate({ keepMoreForLargerSets: checked })} />
            </div>
          </aside>
        </div>

        <div className="bar-divide" />

        {/* The two items you spend on a rune, side by side across the slider
            column as the four above them are, with both grades stacked in the
            third of the width beside them — each select level with, and reading
            in the same order as, the track it qualifies. */}
        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="enchanted-gems" label="Enchanted gems" value={settings.enchantedGems}
              description="Credit every rune with this much of a gem, before you spend one."
              stepLabels={potentialStepLabels.enchantedGems}
              onChange={(value) => void onUpdate({ enchantedGems: value })} />
            <PotentialSlider id="grindstones" label="Grindstones" value={settings.grindstones}
              description="Credit every rune with this much of a grindstone, before you spend one."
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
          {/* Always "N presets", plural included, so the width does not change
              as presets are added and deleted — a narrower count would move the
              wrap threshold and could drop the button onto its own line. */}
          <p className="list-count">
            <b>{presets.length}</b> presets
          </p>
          <button className="button primary" onClick={() => setEditing({ draft: createRunePotentialPreset(), isNew: true })}>
            <span className="button-glyph" aria-hidden="true">+</span>
            Add preset
          </button>
        </div>

        {presets.length === 0
          ? <p className="notice">Every preset is gone, including the ones JASWA started you with. Add one to say what a rune should be judged against.</p>
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

    {/* Keyed on the preset, so opening the editor on a different one always
        gets a fresh draft rather than reusing the previous instance's state. */}
    {editing && <PresetEditor
      key={editing.draft.id}
      draft={editing.draft}
      isNew={editing.isNew}
      onCancel={() => setEditing(null)}
      onSave={(preset) => savePreset(preset, editing.isNew)}
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
  </WorkspacePage>;
}

/**
 * One setting on a 1..n scale. The chosen step names itself underneath the
 * track — the number alone said nothing, and a pair of fixed end labels made
 * the reader work out where they had landed between them.
 */
function PotentialSlider({ id, label, value, description, stepLabels, className, onChange }: {
  id: string; label: string; value: number;
  description: string;
  stepLabels: readonly string[];
  /** For a slider that stands on its own, outside the grid the reserved rows serve. */
  className?: string;
  onChange: (value: number) => void;
}) {
  const steps = stepLabels.length;
  return <div className={className ? `slider ${className}` : 'slider'}>
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
function ChoiceLine({ choice }: { choice?: PresetChoice<string> }) {
  /* A choice can be missing outright on a record that predates it, so both
     halves are read defensively rather than assumed. */
  const preferred = choice?.preferred ?? [];
  const acceptable = (choice?.acceptable ?? []).filter((value) => !preferred.includes(value));
  if (!preferred.length && !acceptable.length) return <span className="choice-none">—</span>;
  return <span className="choice-line">
    {preferred.map((value) => <span className="choice preferred" key={value}>{value}</span>)}
    {acceptable.map((value) => <span className="choice acceptable" key={value}>{value}</span>)}
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
  /* Captured once, so the heading is stable while the Name field is typed in. */
  const [openedAs] = useState(() => draft.name.trim());
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
      {/* The heading names the preset as it stood when the editor opened, not
          as the Name field currently reads. Following the field would re-wrap
          the heading while the user types, and since the head is a fixed row
          of a grid whose body scrolls, that would shrink the body and jump the
          chips below it on a keystroke. */}
      <header className="editor-head">
        <p className="eyebrow">{isNew ? 'Add preset' : 'Edit preset'}</p>
        <h2 id="preset-editor-title">{isNew ? 'A new preset' : openedAs || 'This preset'}</h2>
      </header>

      <div className="editor-body">
        <div className="editor-pair">
          {/* Capped: a name is a label on a card and a heading in this editor,
              and an uncapped one wrapped to a dozen lines, taking the card's
              own contents off the screen. 60 characters is far more than any
              role needs and still fits one line at card width. */}
          <label className="field"><span>Name</span>
            <input ref={nameField} value={preset.name} placeholder="e.g. Fast DD" maxLength={presetNameMaximum}
              onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label className="field"><span>Type</span>
            <select value={preset.type} onChange={(event) => update({ type: event.target.value as PresetType })}>
              {presetTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>

        <EditorBlock title="Rune sets" legend note="Preferred is what the role is built around. Acceptable still works when the box does not oblige.">
          <ChoiceEditor choice={preset.sets} options={presetRuneSetNameList} columns
            onChange={(sets) => update({ sets })} />
        </EditorBlock>

        <EditorBlock title="Rune slots" legend note="Slots 1, 3 and 5 carry a fixed main stat, so only these three are stated.">
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
                {/* An empty field means the role does not aim at this stat, and
                    is kept distinct from a typed 0, which is a stated target of
                    nothing. Anything unparseable reads as empty rather than
                    reaching state as NaN, and the value is clamped here so what
                    is stored is what the field shows. */}
                <input type="number" min={0} max={presetTargetMaximum} step={1} inputMode="numeric"
                  value={value === undefined ? '' : value}
                  placeholder="—"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const parsed = Number(raw);
                    updateTarget(key, raw === '' || !Number.isFinite(parsed)
                      ? undefined
                      : Math.min(presetTargetMaximum, Math.max(0, Math.round(parsed))));
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
function EditorBlock({ title, note, legend = false, children }: {
  title: string; note?: string; legend?: boolean; children: React.ReactNode;
}) {
  return <section className="editor-block">
    <header className="editor-block-head">
      <h3 className="editor-block-title">{title}</h3>
      {legend && <ChoiceLegend />}
    </header>
    {note && <p className="editor-note">{note}</p>}
    {children}
  </section>;
}

/**
 * What the two filled states mean, stated once beside the heading. The chips
 * themselves say nothing but their own name, so the key has to live somewhere —
 * and here it is fixed text that no click can change.
 */
function ChoiceLegend() {
  return <p className="choice-legend">
    <span className="choice-legend-item"><span className="choice-key preferred" aria-hidden="true" />Preferred</span>
    <span className="choice-legend-item"><span className="choice-key acceptable" aria-hidden="true" />Acceptable</span>
    <span className="choice-legend-hint">click to cycle</span>
  </p>;
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

  /* The state is carried by colour and by the chip's own accessible name, not
     by text inside it: added text would widen the chip and re-wrap the row. */
  const described = { none: 'not wanted', preferred: 'preferred', acceptable: 'acceptable' } as const;
  const nextStep = { none: 'prefer it', preferred: 'accept it', acceptable: 'clear it' } as const;

  return <div className={columns ? 'choice-editor columns' : 'choice-editor'}>
    {options.map((option) => {
      const current = state(option);
      return <button
        type="button"
        key={option}
        className={`choice-chip ${current}`}
        onClick={() => cycle(option)}
        aria-pressed={current !== 'none'}
        aria-label={`${option}: ${described[current]}`}
        title={`${option}: ${described[current]} — click to ${nextStep[current]}`}
      >
        <span className="choice-chip-mark" aria-hidden="true" />
        {option}
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
  onUpdate: (unitId: string, update: Partial<MonsterPreference>) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState('');

  if (!monsters.length) return <WorkspacePage
    header={<PageHeader
      title="Call them what you call them"
      tagline="Give each monster the name you actually use and the goals you actually have. Kept separate from the import, so replacing your data keeps them." />}
  >
    <section className="empty-state">
      <h2>Nothing to name until a game file is imported.</h2>
      <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
    </section>
  </WorkspacePage>;

  const defaultNames = numberedMonsterNames(monsters);
  const term = search.trim().toLowerCase();
  const visible = monsters.filter((monster, index) => {
    if (!term) return true;
    const unitId = String(monster.unit_id ?? `unknown-${index}`);
    const preference = preferences.monsterPreferences[unitId];
    return (preference?.label || defaultNames[unitId]).toLowerCase().includes(term);
  });

  return <WorkspacePage
    header={<PageHeader
      title="Call them what you call them"
      tagline="Give each monster the name you actually use and the goals you actually have. Kept separate from the import, so replacing your data keeps them." />}
  >
    <div className="filter-strip">
      <div className="filter-group">
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter monsters" aria-label="Filter monsters by name" />
          {/* Always present, so the input does not resize on the first keystroke. */}
          <button className="filter-button" onClick={() => setSearch('')}
            hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
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
  </WorkspacePage>;
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
