import { useMemo } from 'react';
import { DataTablePage } from './data-table-page';
import { MonsterPortrait } from './monster-portrait';
import { monsterPresentation, monsterSkillUpsToMax } from '../lib/monster-catalog';
import { createMonsterSelectionIndex } from '../lib/monster-selection';
import type { GameRecord } from '../lib/game-data';
import { formatNumber } from '../lib/formatting';
import {
  isStoredMonster, monsterArchetypeLabels, monsterFilterArchetypes, monsterNameCollator, numericOrNull,
} from '../lib/monster-grid';
import { elementName } from '../lib/rune-sets';
import { summonedShrineRecords } from '../lib/sealed-shrine-storage';
import type { Preferences } from '../lib/types';
import { useLocalStorageState } from '../lib/local-storage-state';

const storageElementOptions = ['Water', 'Fire', 'Light', 'Wind', 'Dark'] as const;
const storageGradeOptions = [1, 2, 3, 4, 5, 6] as const;
const storageLocationOptions = ['storage', 'sealed-summoned', 'sealed-normal'] as const;
const storageMinimumLevel = 1;
const storageMaximumLevel = 40;
type StorageLocation = typeof storageLocationOptions[number];

type StorageFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: typeof monsterFilterArchetypes[number][];
  selectedLocations: StorageLocation[];
  minimumLevel: number;
  maximumLevel: number;
  selectedGrades: number[];
  alreadyHaveLevel40: boolean;
  familyFullySkilled: boolean;
  minimumQuantityEnabled: boolean;
  minimumQuantity: number;
};

const defaultStorageFilters: StorageFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  selectedLocations: [...storageLocationOptions],
  minimumLevel: storageMinimumLevel,
  maximumLevel: storageMaximumLevel,
  selectedGrades: [],
  alreadyHaveLevel40: false,
  familyFullySkilled: false,
  minimumQuantityEnabled: false,
  minimumQuantity: 1,
};

function isStorageFilterState(value: unknown): value is StorageFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => storageElementOptions.includes(entry as typeof storageElementOptions[number]))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as typeof monsterFilterArchetypes[number]))
    && Array.isArray(candidate.selectedLocations)
    && candidate.selectedLocations.every((entry) => storageLocationOptions.includes(entry as StorageLocation))
    && typeof candidate.minimumLevel === 'number'
    && Number.isSafeInteger(candidate.minimumLevel)
    && candidate.minimumLevel >= storageMinimumLevel
    && candidate.minimumLevel <= storageMaximumLevel
    && typeof candidate.maximumLevel === 'number'
    && Number.isSafeInteger(candidate.maximumLevel)
    && candidate.maximumLevel >= storageMinimumLevel
    && candidate.maximumLevel <= storageMaximumLevel
    && candidate.minimumLevel <= candidate.maximumLevel
    && Array.isArray(candidate.selectedGrades)
    && candidate.selectedGrades.every((entry) => storageGradeOptions.includes(entry as typeof storageGradeOptions[number]))
    && typeof candidate.alreadyHaveLevel40 === 'boolean'
    && typeof candidate.familyFullySkilled === 'boolean'
    && typeof candidate.minimumQuantityEnabled === 'boolean'
    && typeof candidate.minimumQuantity === 'number'
    && Number.isSafeInteger(candidate.minimumQuantity)
    && candidate.minimumQuantity >= 1
    && candidate.minimumQuantity <= 10;
}

type StorageMonsterRow = {
  unitId: string;
  masterId: string;
  location: StorageLocation;
  quantity: number;
  name: string;
  searchAliases: string[];
  element?: string;
  archetype?: typeof monsterFilterArchetypes[number];
  imageFilename?: string;
  initial: string;
  grade: number | null;
  level: number | null;
  currentSkillUps: number | null;
  maximumSkillUps?: number;
  maxSkilled: boolean;
};

const storageLocationLabels: Record<StorageLocation, string> = {
  storage: 'Storage',
  'sealed-summoned': 'Sealed Shrine · Summoned',
  'sealed-normal': 'Sealed Shrine · Normal',
};

/* SWEX's original merged export calls the summoned shrine list
   `unit_storage_list`. Newer captures may keep the two shrine tabs in named
   containers instead. The resolver accepts those explicit containers while
   keeping ordinary Monster Storage on the game's `building_id` marker. */
const storageListKeys: Record<Exclude<StorageLocation, 'storage'>, string[]> = {
  'sealed-summoned': [
    'summoned_unit_storage_list', 'unit_summoned_storage_list', 'unit_storage_list_summoned', 'summoned_storage_list',
    'summoned_monster_storage_list', 'sealed_shrine_summoned', 'sealedShrineSummoned',
  ],
  'sealed-normal': [
    'unit_storage_normal_list', 'normal_unit_storage_list', 'unit_normal_storage_list', 'unit_storage_list_normal', 'normal_storage_list',
    'normal_monster_storage_list', 'sealed_shrine_normal', 'sealedShrineNormal',
  ],
};

const sealedShrineContainerKeys = ['sealed_shrine', 'sealedShrine', 'sealed_monster_storage', 'sealedMonsterStorage'];

function storageLocationValue(value: unknown): StorageLocation | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'storage' || normalized === 'monsterstorage' || normalized === 'ordinary') return 'storage';
  if (normalized.includes('summoned')) return 'sealed-summoned';
  if (normalized.includes('normal')) return 'sealed-normal';
  return undefined;
}

function explicitStorageLocation(record: GameRecord): StorageLocation | undefined {
  for (const key of ['storage_location', 'storageLocation', 'storage_type', 'storageType', 'location', 'source', 'type']) {
    const location = storageLocationValue(record[key]);
    if (location) return location;
  }
  return undefined;
}

function storageList(value: unknown): GameRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is GameRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function storageEntries(gameData: GameRecord): Array<{ record: GameRecord; location: Exclude<StorageLocation, 'storage'>; index: number }> {
  const entries: Array<{ record: GameRecord; location: Exclude<StorageLocation, 'storage'>; index: number }> = [];
  const add = (value: unknown, fallback: Exclude<StorageLocation, 'storage'>) => storageList(value).forEach((record) => {
    const location = explicitStorageLocation(record);
    entries.push({ record, location: location === 'sealed-normal' || location === 'sealed-summoned' ? location : fallback, index: entries.length });
  });

  const mergedShrineList = summonedShrineRecords(gameData);
  mergedShrineList.forEach((record) => {
    const location = explicitStorageLocation(record);
    entries.push({
      record,
      location: location === 'sealed-normal' || location === 'sealed-summoned' ? location : 'sealed-summoned',
      index: entries.length,
    });
  });
  for (const location of ['sealed-summoned', 'sealed-normal'] as const) {
    for (const key of storageListKeys[location]) add(gameData[key], location);
  }
  for (const containerKey of sealedShrineContainerKeys) {
    const container = gameData[containerKey];
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    const source = container as GameRecord;
    add(source.summoned ?? source.Summoned ?? source.summoned_storage ?? source.summonedStorage, 'sealed-summoned');
    add(source.normal ?? source.Normal ?? source.normal_storage ?? source.normalStorage, 'sealed-normal');
  }
  return entries;
}

function storageEntryQuantity(record: GameRecord): number {
  const quantity = numericOrNull(record.quantity);
  return quantity !== null && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

function storageEntryElement(record: GameRecord, masterId: string): string | undefined {
  const explicit = elementName(record.attribute);
  if (explicit) return explicit;
  const encoded = Number(masterId.at(-1));
  return Number.isSafeInteger(encoded) ? elementName(encoded) : undefined;
}

function currentSkillUps(monster: GameRecord): number | null {
  if (!Array.isArray(monster.skills)) return null;
  let total = 0;
  for (const skill of monster.skills) {
    if (!Array.isArray(skill) || typeof skill[1] !== 'number' || !Number.isSafeInteger(skill[1]) || skill[1] < 1) return null;
    total += skill[1] - 1;
  }
  return total;
}

function isMaxSkilled(monster: GameRecord): boolean {
  const maximum = monsterSkillUpsToMax(monster.unit_master_id);
  if (maximum === undefined) return false;
  if (maximum === 0) return true;
  const current = currentSkillUps(monster);
  return current !== null && current >= maximum;
}

function displaySkillProgress(row: StorageMonsterRow): string {
  if (row.maximumSkillUps === undefined) return '—';
  if (row.maxSkilled) return 'MAX';
  return `${row.currentSkillUps ?? '—'} / ${row.maximumSkillUps}`;
}

/* A range input's thumb never reaches the very end of its track: the browser
   insets it by half its own width at each end, so a handle at the maximum has
   its centre half a thumb short of 100%. A value placed at a flat percentage of
   the track therefore drifts up to half a thumb away from the handle it names,
   worst at the two ends. Positions are expressed against the travel the thumb
   actually has, offset by half a thumb, so a value sits over its handle at
   every point of the range — including both ends. */
const sliderThumb = 16;
function handlePosition(fraction: number) {
  return `calc(${sliderThumb / 2}px + ${fraction} * (100% - ${sliderThumb}px))`;
}

function RangeSlider({ minimum, maximum, onMinimumChange, onMaximumChange }: {
  minimum: number;
  maximum: number;
  onMinimumChange: (value: number) => void;
  onMaximumChange: (value: number) => void;
}) {
  const span = storageMaximumLevel - storageMinimumLevel;
  const minimumPosition = handlePosition((minimum - storageMinimumLevel) / span);
  const maximumPosition = handlePosition((maximum - storageMinimumLevel) / span);
  return <div className="range-slider" aria-label="Monster level range">
    <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value" style={{ left: minimumPosition }}>{minimum}</output>
      <output className="range-slider-value" style={{ left: maximumPosition }}>{maximum}</output>
    </div>
    <div className="range-slider-track">
      <span className="range-slider-fill" style={{ left: minimumPosition, right: `calc(100% - ${maximumPosition})` }} />
      <input className="range-slider-input range-slider-input-minimum" type="range"
        min={storageMinimumLevel} max={storageMaximumLevel} step={1} value={minimum}
        onChange={(event) => onMinimumChange(Math.min(Number(event.target.value), maximum))}
        aria-label="Minimum monster level" aria-valuetext={`Minimum level ${minimum}`} />
      <input className="range-slider-input range-slider-input-maximum" type="range"
        min={storageMinimumLevel} max={storageMaximumLevel} step={1} value={maximum}
        onChange={(event) => onMaximumChange(Math.max(Number(event.target.value), minimum))}
        aria-label="Maximum monster level" aria-valuetext={`Maximum level ${maximum}`} />
    </div>
  </div>;
}

function QuantitySlider({ value, onChange, disabled }: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const position = handlePosition((value - 1) / 9);
  return <div className="range-slider range-slider-single" data-disabled={disabled ? 'true' : undefined}>
    <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value" style={{ left: position }}>{value}</output>
    </div>
    <div className="range-slider-track">
      <input className="range-slider-input" type="range" min={1} max={10} step={1} value={value} disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Minimum monster quantity" aria-valuetext={`Have at least ${value}`} />
    </div>
  </div>;
}

export function MonsterStorage({ monsters, gameData, preferences }: {
  monsters: GameRecord[];
  gameData: GameRecord;
  preferences: Preferences;
}) {
  const [filters, setFilters] = useLocalStorageState(
    'jaswa.filters.monster-storage', defaultStorageFilters, isStorageFilterState,
  );
  const {
    search, selectedElements, selectedArchetypes, selectedLocations, minimumLevel, maximumLevel, selectedGrades,
    alreadyHaveLevel40, familyFullySkilled, minimumQuantityEnabled, minimumQuantity,
  } = filters;

  const shrineEntries = useMemo(() => storageEntries(gameData), [gameData]);
  const rows = useMemo<StorageMonsterRow[]>(() => [
    ...monsters
      .filter(isStoredMonster)
      .map((monster, index) => ({ monster, location: 'storage' as const, index })),
    ...shrineEntries.map(({ record, location, index }) => ({ monster: record, location, index })),
  ].map(({ monster, location, index }) => {
      const masterId = String(monster.unit_master_id ?? `unknown-${index}`);
      const presentation = monsterPresentation(monster.unit_master_id);
      const maximumSkillUps = monsterSkillUpsToMax(monster.unit_master_id);
      const current = currentSkillUps(monster);
      return {
        unitId: String(monster.unit_id ?? `${location}-${masterId}-${index}`),
        masterId,
        location,
        quantity: storageEntryQuantity(monster),
        name: presentation.name,
        searchAliases: presentation.searchAliases,
        element: storageEntryElement(monster, masterId),
        archetype: presentation.archetype && monsterFilterArchetypes.includes(presentation.archetype)
          ? presentation.archetype : undefined,
        imageFilename: presentation.imageFilename,
        initial: presentation.shortName,
        grade: numericOrNull(monster.class),
        level: numericOrNull(monster.unit_level),
        currentSkillUps: current,
        maximumSkillUps,
        maxSkilled: isMaxSkilled(monster),
      };
    })
    .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId)),
  [monsters, shrineEntries]);

  const allMonsterRecords = useMemo(() => [
    ...monsters,
    ...shrineEntries.map(({ record }) => record),
  ], [monsters, shrineEntries]);

  const monsterSelection = useMemo(() => createMonsterSelectionIndex(allMonsterRecords.map((monster) => ({
    masterId: monster.unit_master_id,
    level: numericOrNull(monster.unit_level),
    maxSkilled: isMaxSkilled(monster),
  }))), [allMonsterRecords]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      /* Shrine summary records do not carry a level in the SWEX export. They
         are visible for the complete 1–40 range, but cannot honestly match a
         narrower interval until the export supplies a level for that copy. */
      if (row.level === null ? minimumLevel !== storageMinimumLevel || maximumLevel !== storageMaximumLevel : row.level < minimumLevel || row.level > maximumLevel) return false;
      if (!selectedLocations.includes(row.location)) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (selectedGrades.length && (row.grade === null || !selectedGrades.includes(row.grade))) return false;
      if (!monsterSelection.matches(row.masterId, { alreadyHaveLevel40, familyFullySkilled })) return false;
      if (minimumQuantityEnabled && row.quantity < minimumQuantity) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term)
        || row.searchAliases.some((alias) => alias.toLowerCase().includes(term));
    });
  }, [alreadyHaveLevel40, familyFullySkilled, maximumLevel, minimumLevel, minimumQuantity, minimumQuantityEnabled, monsterSelection, rows, search, selectedArchetypes, selectedElements, selectedGrades, selectedLocations]);

  const toggleElement = (name: string) => setFilters((current) => ({
    ...current,
    selectedElements: current.selectedElements.includes(name)
      ? current.selectedElements.filter((entry) => entry !== name)
      : [...current.selectedElements, name],
  }));
  const toggleArchetype = (archetype: typeof monsterFilterArchetypes[number]) => setFilters((current) => ({
    ...current,
    selectedArchetypes: current.selectedArchetypes.includes(archetype)
      ? current.selectedArchetypes.filter((entry) => entry !== archetype)
      : [...current.selectedArchetypes, archetype],
  }));
  const toggleGrade = (grade: number) => setFilters((current) => ({
    ...current,
    selectedGrades: current.selectedGrades.includes(grade)
      ? current.selectedGrades.filter((entry) => entry !== grade)
      : [...current.selectedGrades, grade],
  }));
  const toggleLocation = (location: StorageLocation) => setFilters((current) => ({
    ...current,
    selectedLocations: current.selectedLocations.includes(location)
      ? current.selectedLocations.filter((entry) => entry !== location)
      : [...current.selectedLocations, location],
  }));

  return <DataTablePage
    filterClassName="storage-filter-strip"
    tableClassName="storage-grid"
    headerLabel="Storage columns"
    tableLabel="Monsters in Storage"
    columnGroup={<colgroup>
      <col style={{ width: '4%' }} /><col style={{ width: '24%' }} /><col style={{ width: '13%' }} />
      <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
    </colgroup>}
    header={<thead><tr>
      <th scope="col" className="align-left">#</th>
      <th scope="col" className="align-left">Monster</th>
      <th scope="col" className="align-left">Location</th>
      <th scope="col" className="align-left">Element</th>
      <th scope="col" className="align-left">Type</th>
      <th scope="col" className="align-right">Grade</th>
      <th scope="col" className="align-right">Level</th>
      <th scope="col" className="align-right">Skills</th>
      <th scope="col" className="align-right">Quantity</th>
    </tr></thead>}
    filters={<>
      <div className="filter-group">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Filter monsters" aria-label="Filter Storage monsters by name" />
            <button className="filter-button" onClick={() => setFilters((current) => ({ ...current, search: '' }))}
              hidden={!search} disabled={!search} aria-label="Clear Storage filter">✕</button>
          </div>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter Storage monsters by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {storageElementOptions.map((element) => <button type="button" key={element}
            className={selectedElements.includes(element) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleElement(element)} aria-pressed={selectedElements.includes(element)}
          >{element.slice(0, 3).toUpperCase()}</button>)}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter Storage monsters by type">
        <span className="filter-label">Type</span>
        <div className="filter-group-controls">
          {monsterFilterArchetypes.map((archetype) => <button type="button" key={archetype}
            className={selectedArchetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleArchetype(archetype)} aria-pressed={selectedArchetypes.includes(archetype)}
          >{monsterArchetypeLabels[archetype]}</button>)}
        </div>
      </div>
      <div className="filter-group storage-filter-location" role="group" aria-label="Choose Storage locations">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls storage-location-options">
          {storageLocationOptions.map((location) => <label className="filter-checkbox-label" key={location}>
            <input className="filter-checkbox" type="checkbox" checked={selectedLocations.includes(location)}
              onChange={() => toggleLocation(location)} />
            <span>{storageLocationLabels[location]}</span>
          </label>)}
        </div>
      </div>
      <div className="filter-group storage-filter-level">
        <span className="filter-label">Level</span>
        <div className="filter-group-controls">
          <RangeSlider minimum={minimumLevel} maximum={maximumLevel}
            onMinimumChange={(value) => setFilters((current) => ({ ...current, minimumLevel: value }))}
            onMaximumChange={(value) => setFilters((current) => ({ ...current, maximumLevel: value }))} />
        </div>
      </div>
      <div className="filter-group storage-filter-grade" role="group" aria-label="Filter Storage monsters by grade">
        <span className="filter-label">Grade</span>
        <div className="filter-group-controls storage-grade-options">
          {storageGradeOptions.map((grade) => <label className="filter-checkbox-label" key={grade}>
            <input className="filter-checkbox" type="checkbox" checked={selectedGrades.includes(grade)}
              onChange={() => toggleGrade(grade)} />
            <span>{grade}★</span>
          </label>)}
        </div>
      </div>
      <div className="filter-group storage-filter-special" role="group" aria-label="Only show Storage monsters if">
        <span className="filter-label">Only show if</span>
        <div className="storage-special-options">
          <label className="checkbox-row">
            <input type="checkbox" checked={alreadyHaveLevel40}
              onChange={(event) => setFilters((current) => ({ ...current, alreadyHaveLevel40: event.target.checked }))} />
            <span>Already have lvl 40 of this mon</span>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={familyFullySkilled}
              onChange={(event) => setFilters((current) => ({ ...current, familyFullySkilled: event.target.checked }))} />
            <span>All lvl 40 of this family max skilled</span>
          </label>
          <div className="storage-quantity-filter">
            <label className="checkbox-row">
              <input type="checkbox" checked={minimumQuantityEnabled}
                onChange={(event) => setFilters((current) => ({ ...current, minimumQuantityEnabled: event.target.checked }))} />
              <span>Have ≥</span>
            </label>
            <QuantitySlider value={minimumQuantity} disabled={!minimumQuantityEnabled}
              onChange={(value) => setFilters((current) => ({ ...current, minimumQuantity: value }))} />
          </div>
        </div>
      </div>
      <output className="filter-summary" aria-label={`${visible.length} of ${rows.length} Storage monsters shown`}>
        <b>{visible.length}</b> of {rows.length} shown
      </output>
    </>}
  >
    <tbody>
      {!monsters.length && !shrineEntries.length ? <tr><td className="table-empty-state" colSpan={9}>
        Import your game data first. Monster Storage will appear here when JASWA has an account to inspect.
      </td></tr> : visible.length ? visible.map((row, index) => <tr key={row.unitId}>
        <td className="align-left row-index">{String(index + 1).padStart(2, '0')}</td>
        <td className="align-left"><div className="monster-cell">
          <MonsterPortrait imageFilename={row.imageFilename} initial={row.initial} name={row.name} />
          <span className="monster-name">{row.name}</span>
        </div></td>
        <td className="align-left dim">{storageLocationLabels[row.location]}</td>
        <td className="align-left dim">{row.element ?? '—'}</td>
        <td className="align-left dim">{row.archetype ? monsterArchetypeLabels[row.archetype] : '—'}</td>
        <td className="align-right dim">{row.grade === null ? '—' : `${row.grade}★`}</td>
        <td className="align-right dim">{formatNumber(row.level, preferences.general)}</td>
        <td className="align-right dim">{displaySkillProgress(row)}</td>
        <td className="align-right dim">×{row.quantity}</td>
      </tr>) : <tr><td className="table-empty-state" colSpan={9}>
        No Storage monsters match these filters. Clear a filter to see more.
      </td></tr>}
    </tbody>
  </DataTablePage>;
}
