'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { PageHeader } from './page-chrome';
import { DataTablePage } from './data-table-page';
import type { GameRecord } from '../lib/game-data';
import type { ImportedGame, Preferences } from '../lib/types';
import { readArtifacts } from '../lib/artifacts';
import { artifactValueOnMonster } from '../lib/artifact-value-on-monster';
import {
  artifactCategoryLabel, artifactEquipClass, compareArtifactRows,
  defaultArtifactSortDirections, displaySubProperty,
} from '../lib/artifact-grid';
import type { ArtifactRow, ArtifactSortKey } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactMainPropertyOrder,
} from '../lib/artifact-properties';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import { numberedMonsterNames } from '../lib/monster-names';
import { formatNumber } from '../lib/formatting';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const elementOrder = Object.values(artifactElements);
const archetypeOrder = Object.values(artifactArchetypes);

function ArtifactColumnGroup() {
  return <colgroup>
    <col className="artifact-col-index" />
    <col className="artifact-col-location" />
    <col className="artifact-col-value" />
    <col className="artifact-col-category" />
    <col className="artifact-col-equipClass" />
    <col className="artifact-col-grade" />
    <col className="artifact-col-mainProperty" />
    <col className="artifact-col-subProperties" />
  </colgroup>;
}

function ArtifactTableHeader({ sortHeader }: {
  sortHeader: (key: ArtifactSortKey, label: ReactNode, alignLeft?: boolean) => ReactNode;
}) {
  return <thead>
    <tr>
      {sortHeader('index', '#', true)}
      {sortHeader('location', 'Location', true)}
      {sortHeader('value', <span className="table-heading-two-line" aria-label="Value on mon">Value on<br />mon</span>)}
      {sortHeader('category', 'Type', true)}
      {sortHeader('equipClass', 'Restriction', true)}
      {sortHeader('grade', 'Quality', true)}
      {sortHeader('mainProperty', 'Main stat', true)}
      {sortHeader('subProperties', 'Subs', true)}
    </tr>
  </thead>;
}

export function ArtifactList({ game, monsters, preferences }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
}) {
  const [sort, setSort] = useState<{ key: ArtifactSortKey; ascending: boolean }>({ key: 'index', ascending: true });
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ArtifactCategory[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<ArtifactGrade[]>([]);
  const [selectedMainProperties, setSelectedMainProperties] = useState<ArtifactMainProperty[]>([]);
  /* Equipped and inventory are both ordinary places for an artifact to be, so
     the list starts as the whole account and each is switched off separately. */
  const [showEquipped, setShowEquipped] = useState(true);
  const [showInventory, setShowInventory] = useState(true);
  const artifacts = useMemo(() => readArtifacts(game?.data), [game]);

  const rows = useMemo<ArtifactRow[]>(() => {
    const names = numberedMonsterNames(monsters);
    const wearers = new Map<string, GameRecord>();
    for (const monster of monsters) {
      if (monster.unit_id !== undefined && monster.unit_id !== null) wearers.set(String(monster.unit_id), monster);
    }
    return artifacts.map((artifact, index) => {
      const wearer = artifact.occupiedId === null ? undefined : wearers.get(artifact.occupiedId);
      const unitId = wearer?.unit_id === undefined ? null : String(wearer.unit_id);
      const preference = unitId === null ? undefined : preferences.monsterPreferences[unitId];
      return {
        artifact,
        index,
        /* Three different states, kept apart: `Inventory` for an artifact
           nothing is wearing, the monster's name where the roster has it, and
           `null` for a wearer the roster does not contain — a gap in the
           import, which must not read as an empty inventory. */
        location: artifact.occupiedId === null
          ? 'Inventory'
          : unitId === null ? null : preference?.label || names[unitId] || null,
        value: wearer ? artifactValueOnMonster(artifact, wearer.unit_master_id, preferences.artifacts.acceptableWorth) : undefined,
        subProperties: artifact.subProperties,
      };
    });
  }, [artifacts, monsters, preferences]);

  /* Every class the game has, always, in both groups' full length. Narrowing
     this to the chosen categories would take buttons out of the row and slide
     the filters after it sideways on a click the user aimed elsewhere, which is
     the movement `AGENTS.md` rule 2 forbids — and it would strand a selection
     whose button had just disappeared. The two categories are separated instead
     by their own labelled groups. */
  const classOptions = { attribute: elementOrder, type: archetypeOrder };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const equipped = row.artifact.occupiedId !== null;
      if (!showEquipped && equipped) return false;
      if (!showInventory && !equipped) return false;
      if (selectedCategories.length && !selectedCategories.includes(row.artifact.category)) return false;
      if (selectedGrades.length && !selectedGrades.includes(row.artifact.grade)) return false;
      if (selectedMainProperties.length && !selectedMainProperties.includes(row.artifact.mainProperty)) return false;
      if (selectedClasses.length) {
        const equipClass = artifactEquipClass(row.artifact);
        if (!equipClass || !selectedClasses.includes(equipClass)) return false;
      }
      if (!term) return true;
      return row.location?.toLowerCase().includes(term)
        || row.subProperties.some((property) => property.definition.name.toLowerCase().includes(term));
    });
    const { key, ascending } = sort;
    if (key === 'index') return ascending ? filtered : [...filtered].reverse();
    const direction = ascending ? 1 : -1;
    return [...filtered].sort((left, right) =>
      compareArtifactRows(left, right, key, direction) || left.index - right.index);
  }, [rows, search, selectedCategories, selectedClasses, selectedGrades, selectedMainProperties, showEquipped, showInventory, sort]);

  function toggleSort(key: ArtifactSortKey) {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      : { key, ascending: defaultArtifactSortDirections[key] });
  }

  function toggle<T>(value: T, set: (update: (current: T[]) => T[]) => void) {
    set((current) => current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]);
  }

  if (!artifacts.length) return <div className="section-body">
    <PageHeader
      title="Every artifact you own"
      tagline="The library the recommendations are read against — what you actually have, in one list." />
    <section className="empty-state">
      <h2>{game
        ? 'This import holds no artifacts JASWA can read.'
        : 'Nothing to show until a game file is imported.'}</h2>
      <p className="next-step">{game
        ? 'Report it from the rail if your account does have artifacts.'
        : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
    </section>
  </div>;

  const sortHeader = (key: ArtifactSortKey, label: ReactNode, alignLeft = false) => {
    const sorted = sort.key === key;
    const className = [alignLeft ? 'align-left' : '', 'sortable', sorted ? 'sorted' : '', sorted && sort.ascending ? 'ascending' : '']
      .filter(Boolean).join(' ');
    return <th key={key} scope="col" aria-sort={sorted ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>{label}</button>
    </th>;
  };

  /* Five of the seven groups are the same shape — a heading, then one toggle
     per option — so they are written once and given their options. */
  const toggleGroup = <T extends string>(
    label: string, description: string, options: readonly T[],
    selected: T[], set: (update: (current: T[]) => T[]) => void,
    display: (option: T) => string, className: string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {options.map((option) => <button
        key={option}
        className={selected.includes(option) ? 'filter-button active' : 'filter-button'}
        onClick={() => toggle(option, set)}
        aria-pressed={selected.includes(option)}
      >{display(option)}</button>)}
    </div>
  </div>;
  const abbreviate = (option: string) => option.slice(0, 3).toUpperCase();

  return <DataTablePage
    filterClassName="artifact-filter-strip"
    tableClassName="artifact-grid"
    headerLabel="Artifact library columns"
    tableLabel="Artifact library"
    columnGroup={<ArtifactColumnGroup />}
    header={<ArtifactTableHeader sortHeader={sortHeader} />}
    filters={<>
      <div className="filter-group artifact-filter-search">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter artifacts" aria-label="Filter artifacts by monster or property" />
            <button className="filter-button" onClick={() => setSearch('')}
              hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
          </div>
        </div>
      </div>
      {toggleGroup('Type', 'Filter by artifact type', categoryOrder,
        selectedCategories, setSelectedCategories, (category) => artifactCategoryLabels[category], 'artifact-filter-type')}
      {toggleGroup('Element', 'Filter by element', classOptions.attribute,
        selectedClasses, setSelectedClasses, abbreviate, 'artifact-filter-element')}
      {toggleGroup('Archetype', 'Filter by monster type', classOptions.type,
        selectedClasses, setSelectedClasses, abbreviate, 'artifact-filter-archetype')}
      {toggleGroup('Quality', 'Filter by quality', artifactGradeOrder,
        selectedGrades, setSelectedGrades, abbreviate, 'artifact-filter-quality')}
      {toggleGroup('Main stat', 'Filter by main stat', artifactMainPropertyOrder,
        selectedMainProperties, setSelectedMainProperties, (property) => property, 'artifact-filter-main-stat')}
      <div className="filter-group artifact-filter-location" role="group" aria-label="Choose artifact locations">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls">
          <button type="button" className={showEquipped ? 'filter-button active' : 'filter-button'}
            onClick={() => setShowEquipped((current) => !current)} aria-pressed={showEquipped}
          >Equipped</button>
          <button type="button" className={showInventory ? 'filter-button active' : 'filter-button'}
            onClick={() => setShowInventory((current) => !current)} aria-pressed={showInventory}
          >Inventory</button>
        </div>
      </div>
      <output className="filter-summary" aria-label={`${visible.length} of ${rows.length} artifacts shown`}>
        <b>{visible.length}</b> of {rows.length} shown
      </output>
    </>}
  >
    <tbody>
          {visible.map((row) => <tr key={row.artifact.id}>
            <td className="align-left row-index">{String(row.index + 1).padStart(2, '0')}</td>
            <td className={row.location ? 'align-left' : 'align-left muted'}
              title={row.location === null ? 'Worn by a monster this import does not contain' : undefined}>
              {row.location ?? 'Unknown monster'}
            </td>
            <td className={row.value === undefined ? 'muted' : undefined}
              title={row.value === undefined && row.artifact.occupiedId !== null
                ? 'Not judged: nothing recorded for this monster type'
                : undefined}>
              {row.value === undefined ? '—' : `${formatNumber(Math.round(row.value * 100), preferences.general)} %`}
            </td>
            <td className="align-left dim">{artifactCategoryLabel(row.artifact.category)}</td>
            <td className={artifactEquipClass(row.artifact) ? 'align-left' : 'align-left muted'}>
              {artifactEquipClass(row.artifact) ?? '—'}
            </td>
            <td className="align-left dim">{row.artifact.grade}</td>
            <td className="align-left">
              {row.artifact.mainProperty}
            </td>
            <td className="align-left">
              <ul className="artifact-subs">
                {row.subProperties.map((subProperty) => <li
                  key={subProperty.definition.id}
                  className={subProperty.definition.status === 'legacy' ? 'legacy' : undefined}
                >{displaySubProperty(subProperty, (value) => formatNumber(value, preferences.general))}</li>)}
              </ul>
            </td>
          </tr>)}
    </tbody>
  </DataTablePage>;
}
