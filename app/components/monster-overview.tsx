'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { PageHeader } from './page-chrome';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { MonsterPortrait } from './monster-portrait';
import { monsterPresentation } from '../lib/monster-catalog';
import type { MonsterArchetype } from '../lib/monster-catalog';
import type { GameRecord } from '../lib/game-data';
import { calculateMonsterTotals } from '../lib/monster-stats';
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from '../lib/rune-potential-metrics';
import { activeRuneSets, elementName } from '../lib/rune-sets';
import type { Preferences } from '../lib/types';
import {
  compareNumbersWithBlanks, compareTextWithBlanks, defaultMonsterSortDirections,
  displayArtifactTypes, displayRelicType, equippedEquipmentTypes, isStoredMonster,
  monsterArchetypeLabels, monsterFilterArchetypes, monsterNameCollator, numericOrNull,
} from '../lib/monster-grid';
import type { MonsterGridColumn, MonsterRow, SortKey } from '../lib/monster-grid';
import { numberedMonsterNames } from '../lib/monster-names';
import { formatNumber } from '../lib/formatting';
import { useLocalStorageState } from '../lib/local-storage-state';
import { alignmentClass, monsterTableColumns } from '../lib/table-layouts';

type MonsterFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: MonsterArchetype[];
  showStorage: boolean;
  showInventory: boolean;
  showBelowMaxLevel: boolean;
};

const defaultMonsterFilters: MonsterFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  showStorage: true,
  showInventory: true,
  showBelowMaxLevel: false,
};
const monsterElementOptions = ['Water', 'Fire', 'Wind', 'Light', 'Dark'] as const;

/* Two columns sort under a different name than they are laid out under, so the
   sort key is mapped to the layout column before its alignment is read. */
const monsterLayoutKeys: Partial<Record<SortKey, string>> = { artifactTypes: 'artifacts', relicTypes: 'relic' };

/**
 * The alignment class for one column of the monster table, header and cell
 * alike, taken from the column plan in `table-layouts.ts` so the two agree by
 * construction rather than by both call sites remembering the same answer.
 */
function monsterColumnAlignment(key: SortKey): string {
  const layoutKey = monsterLayoutKeys[key] ?? key;
  return alignmentClass(monsterTableColumns.find((column) => column.key === layoutKey)?.align);
}

/** One body cell's classes: the column's alignment, then the row's own state. */
function cell(key: SortKey, ...extra: Array<string | false | undefined>): string {
  return [monsterColumnAlignment(key), ...extra].filter(Boolean).join(' ');
}
/* The game caps monsters at 40 today, so a level below that is not maxed. Treating
   it as a floor rather than an exact match keeps the filter right if the cap rises. */
const maxMonsterLevel = 40;

function isMonsterFilterState(value: unknown): value is MonsterFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => monsterElementOptions.includes(entry as typeof monsterElementOptions[number]))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as MonsterArchetype))
    && typeof candidate.showStorage === 'boolean'
    /* A stored filter set from before Inventory replaced the fodder toggle has
       no `showInventory`, so it fails here and the defaults are used. Carrying
       it over as `false` would open the page with the roster hidden. */
    && typeof candidate.showInventory === 'boolean'
    && typeof candidate.showBelowMaxLevel === 'boolean';
}

function MonsterTableHeader({ columns, sortHeader }: {
  columns: MonsterGridColumn[];
  sortHeader: (key: SortKey, label: string, extraClassName?: string) => ReactNode;
}) {
  return <thead>
    <tr>
      {sortHeader('index', '#')}
      {sortHeader('name', 'Monster')}
      {sortHeader('sets', 'Runes')}
      {columns.map((column) => sortHeader(column.key, column.label))}
      {sortHeader('artifactTypes', 'Artifacts', 'equipment-start')}
      {sortHeader('relicTypes', 'Relic')}
      {sortHeader('ehp', 'E.HP')}
      {sortHeader('ehpD', 'E.HP D')}
      {sortHeader('dmg', 'DMG')}
    </tr>
  </thead>;
}

export function MonsterOverview({ monsters, preferences }: { monsters: GameRecord[]; preferences: Preferences }) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'index', ascending: true });
  const [filters, setFilters] = useLocalStorageState(
    'jaswa.filters.monsters', defaultMonsterFilters, isMonsterFilterState,
  );
  const {
    search, selectedElements, selectedArchetypes, showStorage, showInventory, showBelowMaxLevel,
  } = filters;
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
        /* Only a user's own label earns a second line, and it shows the game's
           name beneath it. A collaboration copy shows one name — its own. */
        secondaryName: preference?.label ? defaultNames[unitId] : undefined,
        searchAliases: display.searchAliases,
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
      /* Storage and Inventory are the game's two places a monster can be, so
         the pair is exhaustive: turning both off is a request for nothing. */
      if (!showStorage && row.inStorage) return false;
      if (!showInventory && !row.inStorage) return false;
      if (!showBelowMaxLevel && (row.level === null || row.level < maxMonsterLevel)) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term)
        || row.secondaryName?.toLowerCase().includes(term)
        || row.searchAliases?.some((alias) => alias.toLowerCase().includes(term))
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
  }, [rows, search, selectedElements, selectedArchetypes, showStorage, showInventory, showBelowMaxLevel, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      : { key, ascending: defaultMonsterSortDirections[key] });
  }

  function toggleElement(name: string) {
    setFilters((current) => ({
      ...current,
      selectedElements: current.selectedElements.includes(name)
        ? current.selectedElements.filter((entry) => entry !== name)
        : [...current.selectedElements, name],
    }));
  }

  function toggleArchetype(archetype: MonsterArchetype) {
    setFilters((current) => ({
      ...current,
      selectedArchetypes: current.selectedArchetypes.includes(archetype)
        ? current.selectedArchetypes.filter((entry) => entry !== archetype)
        : [...current.selectedArchetypes, archetype],
    }));
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
  const sortHeader = (key: SortKey, label: string, extraClassName = '') => {
    const sorted = sort.key === key;
    const className = [monsterColumnAlignment(key), 'sortable', sorted ? 'sorted' : '', sorted && sort.ascending ? 'ascending' : '', extraClassName]
      .filter(Boolean).join(' ');
    return <th key={key} scope="col" aria-sort={sorted ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>{label}</button>
    </th>;
  };
  return <DataTablePage
    tableClassName="monster-grid"
    headerLabel="Monster roster columns"
    tableLabel="Monster roster"
    columnGroup={<TableColumnGroup columns={monsterTableColumns} />}
    header={<MonsterTableHeader columns={columns} sortHeader={sortHeader} />}
    filters={<>
      <div className="filter-group">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Filter monsters" aria-label="Filter monsters by name or set" />
            <button className="filter-button" onClick={() => setFilters((current) => ({ ...current, search: '' }))}
              hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
          </div>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {elements.map((name) => <button
            key={name}
            className={selectedElements.includes(name) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleElement(name)}
            aria-pressed={selectedElements.includes(name)}
          >{name.slice(0, 3).toUpperCase()}</button>)}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter by monster type">
        <span className="filter-label">Type</span>
        <div className="filter-group-controls">
          {monsterFilterArchetypes.map((archetype) => <button
            key={archetype}
            className={selectedArchetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleArchetype(archetype)}
            aria-pressed={selectedArchetypes.includes(archetype)}
          >{monsterArchetypeLabels[archetype]}</button>)}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Choose which monsters to include">
        <span className="filter-label">Include</span>
        <div className="filter-group-controls">
          <button type="button" className={showInventory ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilters((current) => ({ ...current, showInventory: !current.showInventory }))} aria-pressed={showInventory}
            title="Monsters on your island rather than in Monster Storage"
            aria-label="Monsters outside Monster Storage"
          >Inventory</button>
          <button type="button" className={showStorage ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilters((current) => ({ ...current, showStorage: !current.showStorage }))} aria-pressed={showStorage}
          >Storage</button>
          <button type="button" className={showBelowMaxLevel ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilters((current) => ({ ...current, showBelowMaxLevel: !showBelowMaxLevel }))}
            aria-pressed={showBelowMaxLevel}
          >Lvl. &lt; {maxMonsterLevel}</button>
        </div>
      </div>
      <output className="filter-summary" aria-label={`${visible.length} of ${rows.length} monsters shown`}>
        <b>{visible.length}</b> of {rows.length} shown
      </output>
    </>}
  >
    <tbody>
          {visible.map((row) => <tr key={row.unitId}>
            <td className={cell('index', 'row-index')}>{String(row.index + 1).padStart(2, '0')}</td>
            <td className={cell('name')}>
              <div className="monster-cell">
                <MonsterPortrait imageFilename={row.imageFilename} initial={row.initial} name={row.name} />
                <span className="monster-name">
                  {row.name}
                  {row.secondaryName && <small>{row.secondaryName}</small>}
                </span>
              </div>
            </td>
            <td className={cell('sets')}>
              {row.sets.length
                ? <span className="set-mark" title={row.sets.map((set) => set.name).join(' / ')}>{row.sets.map((set) => set.abbreviation).join('/')}</span>
                : <span className="set-none">—</span>}
            </td>
            <td className={cell('level', row.level === null ? 'dim muted' : 'dim')}>{formatNumber(row.level, preferences.general)}</td>
            <td className={cell('hp', row.hp === null && 'muted')}>{formatNumber(row.hp, preferences.general)}</td>
            <td className={cell('atk', row.atk === null && 'muted')}>{formatNumber(row.atk, preferences.general)}</td>
            <td className={cell('def', row.def === null && 'muted')}>{formatNumber(row.def, preferences.general)}</td>
            <td className={cell('spd', row.spd === null && 'muted')}>{formatNumber(row.spd, preferences.general)}</td>
            <td className={cell('criticalRate', row.criticalRate === null && 'muted')}>{formatNumber(row.criticalRate, preferences.general)}</td>
            <td className={cell('criticalDamage', row.criticalDamage === null && 'muted')}>{formatNumber(row.criticalDamage, preferences.general)}</td>
            <td className={cell('resistance', row.resistance === null && 'muted')}>{formatNumber(row.resistance, preferences.general)}</td>
            <td className={cell('accuracy', row.accuracy === null && 'muted')}>{formatNumber(row.accuracy, preferences.general)}</td>
            <td className={cell('artifactTypes', 'equipment-start', row.artifactTypes.some((type) => type !== null) ? 'equipment-types' : 'muted')}>
              {displayArtifactTypes(row.artifactTypes)}
            </td>
            <td className={cell('relicTypes', row.relicTypes.some((type) => type !== null) ? 'equipment-types' : 'muted')}>
              {displayRelicType(row.relicTypes)}
            </td>
            <td className={cell('ehp', row.ehp === null && 'muted')}>{formatNumber(row.ehp, preferences.general)}</td>
            <td className={cell('ehpD', row.ehpD === null && 'muted')}>{formatNumber(row.ehpD, preferences.general)}</td>
            <td className={cell('dmg', row.dmg === null && 'muted')}>{formatNumber(row.dmg, preferences.general)}</td>
          </tr>)}
    </tbody>
  </DataTablePage>;
}
