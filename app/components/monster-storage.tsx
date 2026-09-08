'use client';

import { useMemo } from 'react';
import { DataTablePage } from './data-table-page';
import { MonsterPortrait } from './monster-portrait';
import { monsterFamilyId, monsterPresentation, monsterSkillUpsToMax } from '../lib/monster-catalog';
import type { GameRecord } from '../lib/game-data';
import { formatNumber } from '../lib/formatting';
import {
  isStoredMonster, monsterArchetypeLabels, monsterFilterArchetypes, monsterNameCollator, numericOrNull,
} from '../lib/monster-grid';
import { elementName } from '../lib/rune-sets';
import type { Preferences } from '../lib/types';
import { useLocalStorageState } from '../lib/local-storage-state';

const storageElementOptions = ['Water', 'Fire', 'Light', 'Wind', 'Dark'] as const;
const storageGradeOptions = [1, 2, 3, 4, 5] as const;
const storageMinimumLevel = 1;
const storageMaximumLevel = 40;
const maxMonsterLevel = 40;

type StorageFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: typeof monsterFilterArchetypes[number][];
  minimumLevel: number;
  maximumLevel: number;
  selectedGrades: number[];
  alreadyHaveLevel40: boolean;
  familyFullySkilled: boolean;
};

const defaultStorageFilters: StorageFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  minimumLevel: storageMinimumLevel,
  maximumLevel: storageMaximumLevel,
  selectedGrades: [],
  alreadyHaveLevel40: false,
  familyFullySkilled: false,
};

function isStorageFilterState(value: unknown): value is StorageFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => storageElementOptions.includes(entry as typeof storageElementOptions[number]))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as typeof monsterFilterArchetypes[number]))
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
    && typeof candidate.familyFullySkilled === 'boolean';
}

type StorageMonsterRow = {
  unitId: string;
  masterId: string;
  familyId?: number;
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

function isLevel40(monster: GameRecord): boolean {
  const level = numericOrNull(monster.unit_level);
  return level !== null && level >= maxMonsterLevel;
}

function displaySkillProgress(row: StorageMonsterRow): string {
  if (row.maximumSkillUps === undefined) return '—';
  if (row.maxSkilled) return 'MAX';
  return `${row.currentSkillUps ?? '—'} / ${row.maximumSkillUps}`;
}

function RangeSlider({ minimum, maximum, onMinimumChange, onMaximumChange }: {
  minimum: number;
  maximum: number;
  onMinimumChange: (value: number) => void;
  onMaximumChange: (value: number) => void;
}) {
  const minimumPosition = ((minimum - storageMinimumLevel) / (storageMaximumLevel - storageMinimumLevel)) * 100;
  const maximumPosition = ((maximum - storageMinimumLevel) / (storageMaximumLevel - storageMinimumLevel)) * 100;
  return <div className="range-slider" aria-label="Monster level range">
    <div className="range-slider-values" aria-hidden="true">
      <output className="range-slider-value" style={{ left: `${minimumPosition}%` }}>{minimum}</output>
      <output className="range-slider-value" style={{ left: `${maximumPosition}%` }}>{maximum}</output>
    </div>
    <div className="range-slider-track">
      <span className="range-slider-fill" style={{ left: `${minimumPosition}%`, right: `${100 - maximumPosition}%` }} />
      <input className="range-slider-input range-slider-input-minimum" type="range"
        min={storageMinimumLevel} max={storageMaximumLevel} step={1} value={minimum}
        onChange={(event) => onMinimumChange(Math.min(Number(event.target.value), maximum))}
        aria-label="Minimum monster level" aria-valuetext={`Minimum level ${minimum}`} />
      <input className="range-slider-input range-slider-input-maximum" type="range"
        min={storageMinimumLevel} max={storageMaximumLevel} step={1} value={maximum}
        onChange={(event) => onMaximumChange(Math.max(Number(event.target.value), minimum))}
        aria-label="Maximum monster level" aria-valuetext={`Maximum level ${maximum}`} />
    </div>
    <div className="range-slider-limits" aria-hidden="true"><span>1</span><span>40</span></div>
  </div>;
}

export function MonsterStorage({ monsters, preferences }: { monsters: GameRecord[]; preferences: Preferences }) {
  const [filters, setFilters] = useLocalStorageState(
    'jaswa.filters.monster-storage', defaultStorageFilters, isStorageFilterState,
  );
  const {
    search, selectedElements, selectedArchetypes, minimumLevel, maximumLevel, selectedGrades,
    alreadyHaveLevel40, familyFullySkilled,
  } = filters;

  const rows = useMemo<StorageMonsterRow[]>(() => monsters
    .filter(isStoredMonster)
    .map((monster, index) => {
      const masterId = String(monster.unit_master_id ?? `unknown-${index}`);
      const presentation = monsterPresentation(monster.unit_master_id);
      const maximumSkillUps = monsterSkillUpsToMax(monster.unit_master_id);
      const current = currentSkillUps(monster);
      return {
        unitId: String(monster.unit_id ?? `unknown-${index}`),
        masterId,
        familyId: monsterFamilyId(monster.unit_master_id),
        name: presentation.name,
        searchAliases: presentation.searchAliases,
        element: elementName(monster.attribute),
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
  [monsters]);

  const level40ByMasterId = useMemo(() => new Set(
    monsters.filter(isLevel40).map((monster) => String(monster.unit_master_id ?? '')),
  ), [monsters]);
  const allLevel40ByFamily = useMemo(() => {
    const familyStates = new Map<number, { count: number; fullySkilled: number }>();
    for (const monster of monsters) {
      if (!isLevel40(monster)) continue;
      const familyId = monsterFamilyId(monster.unit_master_id);
      if (familyId === undefined) continue;
      const state = familyStates.get(familyId) ?? { count: 0, fullySkilled: 0 };
      state.count += 1;
      if (isMaxSkilled(monster)) state.fullySkilled += 1;
      familyStates.set(familyId, state);
    }
    return new Set([...familyStates.entries()]
      .filter(([, state]) => state.count > 0 && state.count === state.fullySkilled)
      .map(([familyId]) => familyId));
  }, [monsters]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.level === null || row.level < minimumLevel || row.level > maximumLevel) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (selectedGrades.length && (row.grade === null || !selectedGrades.includes(row.grade))) return false;
      if (alreadyHaveLevel40 && !level40ByMasterId.has(row.masterId)) return false;
      if (familyFullySkilled && (row.familyId === undefined || !allLevel40ByFamily.has(row.familyId))) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term)
        || row.searchAliases.some((alias) => alias.toLowerCase().includes(term));
    });
  }, [allLevel40ByFamily, alreadyHaveLevel40, familyFullySkilled, level40ByMasterId, maximumLevel, minimumLevel, rows, search, selectedArchetypes, selectedElements, selectedGrades]);

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

  return <DataTablePage
    filterClassName="storage-filter-strip"
    tableClassName="storage-grid"
    headerLabel="Storage columns"
    tableLabel="Monsters in Storage"
    columnGroup={<colgroup>
      <col style={{ width: '5%' }} /><col style={{ width: '35%' }} /><col style={{ width: '12%' }} />
      <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
    </colgroup>}
    header={<thead><tr>
      <th scope="col" className="align-left">#</th>
      <th scope="col" className="align-left">Monster</th>
      <th scope="col" className="align-left">Element</th>
      <th scope="col" className="align-left">Type</th>
      <th scope="col" className="align-right">Grade</th>
      <th scope="col" className="align-right">Level</th>
      <th scope="col" className="align-right">Skills</th>
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
            <span>{grade}-star</span>
          </label>)}
        </div>
      </div>
      <div className="filter-group storage-filter-special" role="group" aria-label="Special Storage filters">
        <span className="filter-label">Special</span>
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
        </div>
      </div>
      <output className="filter-summary" aria-label={`${visible.length} of ${rows.length} Storage monsters shown`}>
        <b>{visible.length}</b> of {rows.length} shown
      </output>
    </>}
  >
    <tbody>
      {!monsters.length ? <tr><td className="table-empty-state" colSpan={7}>
        Import your game data first. Monster Storage will appear here when JASWA has an account to inspect.
      </td></tr> : visible.length ? visible.map((row, index) => <tr key={row.unitId}>
        <td className="align-left row-index">{String(index + 1).padStart(2, '0')}</td>
        <td className="align-left"><div className="monster-cell">
          <MonsterPortrait imageFilename={row.imageFilename} initial={row.initial} name={row.name} />
          <span className="monster-name">{row.name}</span>
        </div></td>
        <td className="align-left dim">{row.element ?? '—'}</td>
        <td className="align-left dim">{row.archetype ? monsterArchetypeLabels[row.archetype] : '—'}</td>
        <td className="align-right dim">{row.grade === null ? '—' : `${row.grade}★`}</td>
        <td className="align-right dim">{formatNumber(row.level, preferences.general)}</td>
        <td className="align-right dim">{displaySkillProgress(row)}</td>
      </tr>) : <tr><td className="table-empty-state" colSpan={7}>
        No Storage monsters match these filters. Clear a filter to see more.
      </td></tr>}
    </tbody>
  </DataTablePage>;
}
