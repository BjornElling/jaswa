import { useMemo } from 'react';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { MonsterPortrait } from './monster-portrait';
import { RangeSlider, ValueSlider } from './range-slider';
import { SortableHeader, columnClasses, useSortedRows } from './sortable-table';
import type { SortableColumn } from './sortable-table';
import { monsterPresentation, monsterSkillUpsToMax } from '../lib/monster-catalog';
import { withHigherAwakenings } from '../lib/monster-awakening-scope';
import { createMonsterCopyIndex, createMonsterSelectionIndex } from '../lib/monster-selection';
import type { GameRecord } from '../lib/game-data';
import { formatNumber } from '../lib/formatting';
import {
  compareNumbersWithBlanks, compareTextWithBlanks, isStoredMonster, monsterArchetypeLabels,
  monsterFilterArchetypes, monsterNameCollator, numericOrNull,
} from '../lib/monster-grid';
import { storageTableColumns } from '../lib/table-layouts';
import { elementName, elementNameList } from '../lib/rune-sets';
import { summonedShrineRecords } from '../lib/sealed-shrine-storage';
import type { Preferences } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';

/* The game's five elements, in the game's order — the same list the Stats page
   offers, so the two element rows read alike. This page had Light and Wind the
   other way round, which made the pair disagree for no reason. */
const storageElementOptions = elementNameList;
const storageGradeOptions = [1, 2, 3, 4, 5, 6] as const;
const storageLocationOptions = ['inventory', 'storage', 'sealed-summoned', 'sealed-normal'] as const;
const storageMinimumLevel = 1;
const storageMaximumLevel = 40;
/* The "Have ≥" slider's own bounds, named because both the control and the
   check on a stored session read them: a session carrying a quantity the
   slider cannot reach is not a session this tab wrote. */
const storageMinimumQuantity = 1;
const storageMaximumQuantity = 10;
type StorageLocation = typeof storageLocationOptions[number];
/* The two Sealed Shrine tabs come from their own export lists; `inventory` and
   `storage` are both read off the account's monster list instead. */
type ShrineLocation = Extract<StorageLocation, 'sealed-summoned' | 'sealed-normal'>;

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
  needsSkillUps: boolean;
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
  needsSkillUps: false,
  minimumQuantityEnabled: false,
  minimumQuantity: storageMinimumQuantity,
};

function isStorageFilterState(value: unknown): value is StorageFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => typeof entry === 'string' && storageElementOptions.includes(entry))
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
    /* Added after the other conditions, so a session stored before it exists
       carries no such key. Absent reads as unchecked rather than as an invalid
       state, which would discard every other filter the tab had set. */
    && (candidate.needsSkillUps === undefined || typeof candidate.needsSkillUps === 'boolean')
    && typeof candidate.minimumQuantityEnabled === 'boolean'
    && typeof candidate.minimumQuantity === 'number'
    && Number.isSafeInteger(candidate.minimumQuantity)
    && candidate.minimumQuantity >= storageMinimumQuantity
    && candidate.minimumQuantity <= storageMaximumQuantity;
}

type StorageMonsterRow = {
  unitId: string;
  masterId: string;
  location: StorageLocation;
  /** Position in the table's own default order, so `#` can sort back to it. */
  ordinal: number;
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
  inventory: 'Inventory',
  storage: 'Storage',
  'sealed-summoned': 'Sealed Shrine · Summoned',
  'sealed-normal': 'Sealed Shrine · Normal',
};

/* SWEX's original merged export calls the summoned shrine list
   `unit_storage_list`. Newer captures may keep the two shrine tabs in named
   containers instead. The resolver accepts those explicit containers while
   keeping ordinary Monster Storage on the game's `building_id` marker. */
const storageListKeys: Record<ShrineLocation, string[]> = {
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

function storageEntries(gameData: GameRecord): Array<{ record: GameRecord; location: ShrineLocation; index: number }> {
  const entries: Array<{ record: GameRecord; location: ShrineLocation; index: number }> = [];
  const add = (value: unknown, fallback: ShrineLocation) => storageList(value).forEach((record) => {
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

/**
 * A summoned-shrine stack is the one record the game states by omission. It
 * carries `unit_master_id`, `quantity` and `class` and nothing else — no level
 * and no skills — because sealing produces a fresh copy, and a fresh copy is
 * always Lv. 1 with every skill at level 1. The fields are absent for being
 * invariant, not for being unknown.
 *
 * Reading that omission as "unknown" printed a whole tab of "—", which told the
 * user less than the game itself does. The two values are derived here, at the
 * boundary that knows the record's shape, so the rest of the table — the Level
 * and Skills columns, their sorting, and "Needs skill-ups" — reads one kind of
 * row and needs no cases of its own.
 *
 * Only the summoned stack is treated this way. A normal-shrine record is a real
 * unit that carries its own level and skills, and keeps them.
 */
function sealedStackDefaults(location: StorageLocation): { level: number | null; skills: number | null } {
  return location === 'sealed-summoned' ? { level: 1, skills: 0 } : { level: null, skills: null };
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

/**
 * Every column of the Storage table, each with the comparison that orders it
 * (§17.8). Blanks sort to the end in both directions via
 * `compareNumbersWithBlanks`/`compareTextWithBlanks`, so a missing level never
 * masquerades as a low one.
 */
const storageColumns: readonly SortableColumn<StorageMonsterRow>[] = [
  {
    key: 'index', label: '#', accessibleLabel: 'Row number', align: 'left',
    compare: (left, right) => left.ordinal - right.ordinal,
  },
  {
    key: 'name', label: 'Monster', align: 'left',
    compare: (left, right) => monsterNameCollator.compare(left.name, right.name),
  },
  {
    key: 'location', label: 'Location', align: 'left',
    /* Ordered by the Location filter's own listing rather than alphabetically,
       so sorting groups the table the way the filter above it is arranged. */
    compare: (left, right) => storageLocationOptions.indexOf(left.location) - storageLocationOptions.indexOf(right.location),
  },
  {
    key: 'element', label: 'Element', align: 'left',
    compare: (left, right) => compareTextWithBlanks(left.element ?? null, right.element ?? null, 1),
  },
  {
    key: 'archetype', label: 'Type', align: 'left',
    compare: (left, right) => compareTextWithBlanks(
      left.archetype ? monsterArchetypeLabels[left.archetype] : null,
      right.archetype ? monsterArchetypeLabels[right.archetype] : null, 1),
  },
  {
    key: 'grade', label: 'Grade', align: 'right', initialDirection: 'descending',
    compare: (left, right) => compareNumbersWithBlanks(left.grade, right.grade, 1),
  },
  {
    key: 'level', label: 'Level', align: 'right', initialDirection: 'descending',
    compare: (left, right) => compareNumbersWithBlanks(left.level, right.level, 1),
  },
  {
    key: 'skills', label: 'Skills', align: 'right', initialDirection: 'descending',
    /* Ordered by how far along the skill-ups are, not by the printed text:
       "MAX" and "3 / 5" would otherwise sort as words. A monster whose maximum
       the catalogue does not know has no progress to compare. */
    compare: (left, right) => compareNumbersWithBlanks(storageSkillProgress(left), storageSkillProgress(right), 1),
  },
  {
    key: 'quantity', label: 'Quantity', align: 'right', initialDirection: 'descending',
    compare: (left, right) => left.quantity - right.quantity,
  },
];

/** How complete this row's skill-ups are, as a fraction, for ordering. */
function storageSkillProgress(row: StorageMonsterRow): number | null {
  if (row.maximumSkillUps === undefined) return null;
  if (row.maxSkilled) return 1;
  if (row.maximumSkillUps === 0) return 1;
  return row.currentSkillUps === null ? null : row.currentSkillUps / row.maximumSkillUps;
}

const storageCell = columnClasses(storageColumns);

export function MonsterStorage({ monsters, gameData, preferences }: {
  monsters: GameRecord[];
  gameData: GameRecord;
  preferences: Preferences;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.monster-storage', defaultStorageFilters, isStorageFilterState,
  );
  const {
    search, selectedElements, selectedArchetypes, selectedLocations, minimumLevel, maximumLevel, selectedGrades,
    alreadyHaveLevel40, familyFullySkilled, needsSkillUps = false, minimumQuantityEnabled, minimumQuantity,
  } = filters;

  const shrineEntries = useMemo(() => storageEntries(gameData), [gameData]);
  const rows = useMemo<StorageMonsterRow[]>(() => [
    /* Storage and Inventory are the game's two places a monster on the account
       can be, so the same list yields both: the `building_id` marker decides
       which, and every monster lands in exactly one of the two. */
    ...monsters.map((monster, index) => ({
      monster, location: isStoredMonster(monster) ? 'storage' as const : 'inventory' as const, index,
    })),
    ...shrineEntries.map(({ record, location, index }) => ({ monster: record, location, index })),
  ].map(({ monster, location, index }) => {
      const masterId = String(monster.unit_master_id ?? `unknown-${index}`);
      const presentation = monsterPresentation(monster.unit_master_id);
      const maximumSkillUps = monsterSkillUpsToMax(monster.unit_master_id);
      const implied = sealedStackDefaults(location);
      const current = currentSkillUps(monster) ?? implied.skills;
      return {
        unitId: String(monster.unit_id ?? `${location}-${masterId}-${index}`),
        masterId,
        location,
        ordinal: 0,
        quantity: storageEntryQuantity(monster),
        name: presentation.name,
        searchAliases: presentation.searchAliases,
        element: storageEntryElement(monster, masterId),
        archetype: presentation.archetype && monsterFilterArchetypes.includes(presentation.archetype)
          ? presentation.archetype : undefined,
        imageFilename: presentation.imageFilename,
        initial: presentation.shortName,
        grade: numericOrNull(monster.class),
        level: numericOrNull(monster.unit_level) ?? implied.level,
        currentSkillUps: current,
        maximumSkillUps,
        maxSkilled: isMaxSkilled(monster),
      };
    })
    .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId))
    /* Numbered after the default sort, so `#` names the order the table opens
       in and sorting by it returns to that order rather than to import order. */
    .map((row, position) => ({ ...row, ordinal: position + 1 })),
  [monsters, shrineEntries]);

  /* Both indexes below are built from every monster the account holds — every
     location, before any filter runs. A filter decides which rows are *shown*;
     it must not change what the account *contains*. Unchecking Inventory
     narrows the list, but a copy standing there still counts towards "Have ≥"
     and still answers the two "Only show if" conditions, so the same row keeps
     the same verdict however the Location boxes are set. Build either index
     from `visible` and that stops being true. */
  const allMonsterRecords = useMemo(() => [
    ...monsters,
    ...shrineEntries.map(({ record }) => record),
  ], [monsters, shrineEntries]);

  const monsterSelection = useMemo(() => createMonsterSelectionIndex(allMonsterRecords.map((monster) => ({
    masterId: monster.unit_master_id,
    level: numericOrNull(monster.unit_level),
    maxSkilled: isMaxSkilled(monster),
  }))), [allMonsterRecords]);

  /* `rows` is the unfiltered set, so the tally spans all four locations.
     Awakening stages pool into it: `createMonsterCopyIndex` keys on the
     monster's identity, so an unawakened, an awakened and a second awakened
     copy count as three of the same monster. */
  const storageCopies = useMemo(() => createMonsterCopyIndex(
    rows.map((row) => ({ masterId: row.masterId, copies: row.quantity })),
  ), [rows]);

  /* A search names a monster, and awakening it does not change which monster it
     is: `poison master` is a request to see what became of it, so the awakened
     Kyle belongs in the results (§17.15). The widening is drawn from every row
     the table can list, for the same reason the two indexes above are — a
     hidden location must not decide what the account is understood to hold.

     Master ids are the unit of comparison rather than names, because that is
     what carries the awakening step; the names differ at every stage, which is
     exactly why a name match alone cannot find the higher form. */
  const searchedMasterIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return undefined;
    const named = rows
      .filter((row) => row.name.toLowerCase().includes(term)
        || row.searchAliases.some((alias) => alias.toLowerCase().includes(term)))
      .map((row) => row.masterId);
    return withHigherAwakenings(named, rows.map((row) => row.masterId));
  }, [rows, search]);

  const visible = useMemo(() => rows.filter((row) => {
      /* A row whose level the export never states is visible for the complete
         1–40 range, but cannot honestly match a narrower interval. Summoned
         stacks are no longer such a row: `sealedStackDefaults` gives them the
         Lv. 1 the game guarantees, so they filter like any other level. */
      if (row.level === null ? minimumLevel !== storageMinimumLevel || maximumLevel !== storageMaximumLevel : row.level < minimumLevel || row.level > maximumLevel) return false;
      if (!selectedLocations.includes(row.location)) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (selectedGrades.length && (row.grade === null || !selectedGrades.includes(row.grade))) return false;
      if (!monsterSelection.matches(row.masterId, { alreadyHaveLevel40, familyFullySkilled })) return false;
      /* Unlike the two conditions above, this one asks about the row itself
         rather than about the account: a max-skilled copy is done, whatever
         other copies of the same monster still need. */
      if (needsSkillUps && row.maxSkilled) return false;
      /* "Have ≥" asks about the monster, not about this one entry: a row's own
         quantity counted a stack but missed a player holding the same monster
         as several single entries. */
      if (minimumQuantityEnabled && storageCopies.copies(row.masterId) < minimumQuantity) return false;
      return searchedMasterIds === undefined || searchedMasterIds.has(row.masterId);
    }),
  [alreadyHaveLevel40, familyFullySkilled, maximumLevel, minimumLevel, minimumQuantity, minimumQuantityEnabled, monsterSelection, needsSkillUps, rows, searchedMasterIds, selectedArchetypes, selectedElements, selectedGrades, selectedLocations, storageCopies]);

  /* The table opens in its default order, which `#` also sorts back to. The
     tiebreak keeps equal rows in that same order rather than letting them
     reshuffle between renders. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, storageColumns, { key: 'index', direction: 'ascending' },
    (left, right) => left.ordinal - right.ordinal,
  );

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
    headerLabel="Numbers columns"
    tableLabel="Monster numbers"
    columnGroup={<TableColumnGroup columns={storageTableColumns} />}
    header={<SortableHeader columns={storageColumns} sort={sort} onToggle={toggle} />}
    filters={<>
      <div className="filter-group storage-filter-search">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Filter monsters" aria-label="Filter Numbers monsters by name" />
            <button className="filter-button" onClick={() => setFilters((current) => ({ ...current, search: '' }))}
              hidden={!search} disabled={!search} aria-label="Clear Numbers filter">✕</button>
          </div>
        </div>
      </div>
      <div className="filter-group storage-filter-element" role="group" aria-label="Filter Numbers monsters by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {storageElementOptions.map((element) => <button type="button" key={element}
            className={selectedElements.includes(element) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleElement(element)} aria-pressed={selectedElements.includes(element)}
          >{element.slice(0, 3).toUpperCase()}</button>)}
        </div>
      </div>
      <div className="filter-group storage-filter-type" role="group" aria-label="Filter Numbers monsters by type">
        <span className="filter-label">Type</span>
        <div className="filter-group-controls">
          {monsterFilterArchetypes.map((archetype) => <button type="button" key={archetype}
            className={selectedArchetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleArchetype(archetype)} aria-pressed={selectedArchetypes.includes(archetype)}
          >{monsterArchetypeLabels[archetype]}</button>)}
        </div>
      </div>
      <div className="filter-group storage-filter-location" role="group" aria-label="Choose which locations to include">
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
          <RangeSlider
            minimum={storageMinimumLevel} maximum={storageMaximumLevel}
            lowerValue={minimumLevel} upperValue={maximumLevel}
            label="Monster level range"
            lowerLabel="Minimum monster level" upperLabel="Maximum monster level"
            valueText={(value, end) => `${end === 'lower' ? 'Minimum' : 'Maximum'} level ${value}`}
            onChange={(lower, upper) => setFilters((current) => ({
              ...current, minimumLevel: lower, maximumLevel: upper,
            }))} />
        </div>
      </div>
      <div className="filter-group storage-filter-grade" role="group" aria-label="Filter Numbers monsters by grade">
        <span className="filter-label">Grade</span>
        <div className="filter-group-controls storage-grade-options">
          {storageGradeOptions.map((grade) => <label className="filter-checkbox-label" key={grade}>
            <input className="filter-checkbox" type="checkbox" checked={selectedGrades.includes(grade)}
              onChange={() => toggleGrade(grade)} />
            <span>{grade}★</span>
          </label>)}
        </div>
      </div>
      <div className="filter-group storage-filter-special" role="group" aria-label="Only show Numbers monsters if">
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
          <label className="checkbox-row">
            <input type="checkbox" checked={needsSkillUps}
              onChange={(event) => setFilters((current) => ({ ...current, needsSkillUps: event.target.checked }))} />
            <span>Needs skill-ups</span>
          </label>
          <div className="storage-quantity-filter">
            <label className="checkbox-row">
              <input type="checkbox" checked={minimumQuantityEnabled}
                onChange={(event) => setFilters((current) => ({ ...current, minimumQuantityEnabled: event.target.checked }))} />
              <span>Have ≥</span>
            </label>
            <ValueSlider
              minimum={storageMinimumQuantity} maximum={storageMaximumQuantity}
              value={minimumQuantity} disabled={!minimumQuantityEnabled}
              label="Minimum monster quantity"
              valueText={(value) => `Have at least ${value}`}
              onChange={(value) => setFilters((current) => ({ ...current, minimumQuantity: value }))} />
          </div>
        </div>
      </div>
      <FilterSummary visible={visible.length} total={rows.length} noun="Numbers monsters"
        onReset={() => setFilters(defaultStorageFilters)} />
    </>}
  >
    <tbody>
      {!monsters.length && !shrineEntries.length ? <tr><td className="table-empty-state" colSpan={9}>
        Import your game data first. Your monsters will appear here when JASWA has an account to inspect.
      </td></tr> : sorted.length ? sorted.map((row) => <tr key={row.unitId}>
        {/* The row's own number, not its position in the current view, so
            sorting by `#` visibly restores the table's default order rather
            than renumbering whatever order is already on screen. */}
        <td className={storageCell('index', 'row-index')}>{String(row.ordinal).padStart(2, '0')}</td>
        <td className={storageCell('name')}><div className="monster-cell">
          <MonsterPortrait imageFilename={row.imageFilename} initial={row.initial} name={row.name} />
          <span className="monster-name">{row.name}</span>
        </div></td>
        <td className={storageCell('location', 'dim')}>{storageLocationLabels[row.location]}</td>
        <td className={storageCell('element', 'dim')}>{row.element ?? '—'}</td>
        <td className={storageCell('archetype', 'dim')}>{row.archetype ? monsterArchetypeLabels[row.archetype] : '—'}</td>
        <td className={storageCell('grade', 'dim')}>{row.grade === null ? '—' : `${row.grade}★`}</td>
        <td className={storageCell('level', 'dim')}>{formatNumber(row.level, preferences.general)}</td>
        <td className={storageCell('skills', 'dim')}>{displaySkillProgress(row)}</td>
        <td className={storageCell('quantity', 'dim')}>×{row.quantity}</td>
      </tr>) : <tr><td className="table-empty-state" colSpan={9}>
        No monsters match these filters. Clear a filter to see more.
      </td></tr>}
    </tbody>
  </DataTablePage>;
}
