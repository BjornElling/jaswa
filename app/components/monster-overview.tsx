'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { PageHeader } from './page-chrome';
import { DataTablePage } from './data-table-page';
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

type MonsterFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: MonsterArchetype[];
  showStorage: boolean;
  showRainbowmons: boolean;
};

const defaultMonsterFilters: MonsterFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  showStorage: true,
  showRainbowmons: false,
};
const monsterElementOptions = ['Water', 'Fire', 'Wind', 'Light', 'Dark'] as const;

function isMonsterFilterState(value: unknown): value is MonsterFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => monsterElementOptions.includes(entry as typeof monsterElementOptions[number]))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as MonsterArchetype))
    && typeof candidate.showStorage === 'boolean'
    && typeof candidate.showRainbowmons === 'boolean';
}

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

export function MonsterOverview({ monsters, preferences }: { monsters: GameRecord[]; preferences: Preferences }) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'index', ascending: true });
  const [filters, setFilters] = useLocalStorageState(
    'jaswa.filters.monsters', defaultMonsterFilters, isMonsterFilterState,
  );
  const { search, selectedElements, selectedArchetypes, showStorage, showRainbowmons } = filters;
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
        isRainbowmon: display.name === 'Rainbowmon',
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
      if (!showRainbowmons && row.isRainbowmon) return false;
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
  }, [rows, search, selectedElements, selectedArchetypes, showStorage, showRainbowmons, sort]);

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
  const sortHeader = (key: SortKey, label: string, alignLeft = false, extraClassName = '') => {
    const sorted = sort.key === key;
    const className = [alignLeft ? 'align-left' : '', 'sortable', sorted ? 'sorted' : '', sorted && sort.ascending ? 'ascending' : '', extraClassName]
      .filter(Boolean).join(' ');
    return <th key={key} scope="col" aria-sort={sorted ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>{label}</button>
    </th>;
  };
  return <DataTablePage
    tableClassName="monster-grid"
    headerLabel="Monster roster columns"
    tableLabel="Monster roster"
    columnGroup={<MonsterColumnGroup columns={columns} />}
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
          <button type="button" className={showStorage ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilters((current) => ({ ...current, showStorage: !current.showStorage }))} aria-pressed={showStorage}
          >Storage</button>
          <button type="button" className={showRainbowmons ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilters((current) => ({ ...current, showRainbowmons: !current.showRainbowmons }))} aria-pressed={showRainbowmons}
          >Rainbowmons</button>
        </div>
      </div>
      <output className="filter-summary" aria-label={`${visible.length} of ${rows.length} monsters shown`}>
        <b>{visible.length}</b> of {rows.length} shown
      </output>
    </>}
  >
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
            <td className={row.level === null ? 'dim muted' : 'dim'}>{formatNumber(row.level, preferences.general)}</td>
            <td className={row.hp === null ? 'muted' : undefined}>{formatNumber(row.hp, preferences.general)}</td>
            <td className={row.atk === null ? 'muted' : undefined}>{formatNumber(row.atk, preferences.general)}</td>
            <td className={row.def === null ? 'muted' : undefined}>{formatNumber(row.def, preferences.general)}</td>
            <td className={row.spd === null ? 'muted' : undefined}>{formatNumber(row.spd, preferences.general)}</td>
            <td className={row.criticalRate === null ? 'muted' : undefined}>{formatNumber(row.criticalRate, preferences.general)}</td>
            <td className={row.criticalDamage === null ? 'muted' : undefined}>{formatNumber(row.criticalDamage, preferences.general)}</td>
            <td className={row.resistance === null ? 'muted' : undefined}>{formatNumber(row.resistance, preferences.general)}</td>
            <td className={row.accuracy === null ? 'muted' : undefined}>{formatNumber(row.accuracy, preferences.general)}</td>
            <td className={row.artifactTypes.some((type) => type !== null) ? 'equipment-start equipment-types' : 'equipment-start muted'}>
              {displayArtifactTypes(row.artifactTypes)}
            </td>
            <td className={row.relicTypes.some((type) => type !== null) ? 'equipment-types' : 'muted'}>
              {displayRelicType(row.relicTypes)}
            </td>
            <td className={row.ehp === null ? 'muted' : undefined}>{formatNumber(row.ehp, preferences.general)}</td>
            <td className={row.ehpD === null ? 'muted' : undefined}>{formatNumber(row.ehpD, preferences.general)}</td>
            <td className={row.dmg === null ? 'muted' : undefined}>{formatNumber(row.dmg, preferences.general)}</td>
          </tr>)}
    </tbody>
  </DataTablePage>;
}
