'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { PageHeader } from './page-chrome';
import { DataTablePage } from './data-table-page';
import { Dropdown } from './dropdown';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import type { GameRecord } from '../lib/game-data';
import type { ImportedGame, Preferences } from '../lib/types';
import { readArtifacts } from '../lib/artifacts';
import { artifactValueOnMonster } from '../lib/artifact-value-on-monster';
import { defaultPropertyPreferences } from '../lib/artifact-preferences';
import {
  artifactCategoryLabel, artifactEquipClassLabel, compareArtifactRows,
  defaultArtifactSortDirections, displaySubProperty,
} from '../lib/artifact-grid';
import type { ArtifactRow, ArtifactSortKey } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactIntangibleLabel, artifactMainPropertyOrder,
} from '../lib/artifact-properties';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import { numberedMonsterNames } from '../lib/monster-names';
import { formatNumber } from '../lib/formatting';
import { useLocalStorageState } from '../lib/local-storage-state';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const elementOrder = Object.values(artifactElements);
const archetypeOrder = Object.values(artifactArchetypes);
/* Intangible is one option rather than one per group: it is a single class that
   belongs to neither the elements nor the archetypes, and the Type filter
   already separates an Intangible attribute artifact from an Intangible type
   one when the user wants only one of them. */
const intangibleOption: readonly string[] = [artifactIntangibleLabel];
const artifactClassOptions = [...elementOrder, ...archetypeOrder, ...intangibleOption];

type ArtifactFilterState = {
  search: string;
  selectedCategories: ArtifactCategory[];
  selectedClasses: string[];
  selectedGrades: ArtifactGrade[];
  selectedMainProperties: ArtifactMainProperty[];
  sortBySubProperty: number | null;
  showEquipped: boolean;
  showInventory: boolean;
};

const defaultArtifactFilters: ArtifactFilterState = {
  search: '',
  selectedCategories: [],
  selectedClasses: [],
  selectedGrades: [],
  selectedMainProperties: [],
  sortBySubProperty: null,
  showEquipped: true,
  showInventory: true,
};

function isArtifactFilterState(value: unknown): value is ArtifactFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedCategories)
    && candidate.selectedCategories.every((entry) => categoryOrder.includes(entry as ArtifactCategory))
    && Array.isArray(candidate.selectedClasses)
    && candidate.selectedClasses.every((entry) => typeof entry === 'string' && artifactClassOptions.includes(entry))
    && Array.isArray(candidate.selectedGrades)
    && candidate.selectedGrades.every((entry) => artifactGradeOrder.includes(entry as ArtifactGrade))
    && Array.isArray(candidate.selectedMainProperties)
    && candidate.selectedMainProperties.every((entry) => artifactMainPropertyOrder.includes(entry as ArtifactMainProperty))
    && (candidate.sortBySubProperty === null
      || (typeof candidate.sortBySubProperty === 'number'
        && Number.isSafeInteger(candidate.sortBySubProperty)
        && candidate.sortBySubProperty >= 0))
    && typeof candidate.showEquipped === 'boolean'
    && typeof candidate.showInventory === 'boolean';
}

function subPropertyMagnitude(row: ArtifactRow, propertyId: number): number | null {
  for (const subProperty of row.subProperties) {
    if (subProperty.definition.id === propertyId) {
      /* A reduction displays with a minus sign, but -12 is stronger than -10,
         so this ranking compares the size of the effect rather than its sign. */
      return Math.abs(subProperty.valueHundredths);
    }
  }
  return null;
}

function PowerUpMark() {
  return <svg className="artifact-sub-mark artifact-sub-power-up-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13V3" />
    <path d="m4.5 6.5 3.5-3.5 3.5 3.5" />
  </svg>;
}

function ArtifactColumnGroup() {
  return <colgroup>
    <col className="artifact-col-location" />
    <col className="artifact-col-value" />
    <col className="artifact-col-category" />
    <col className="artifact-col-equipClass" />
    <col className="artifact-col-grade" />
    <col className="artifact-col-mainProperty" />
    <col className="artifact-col-subProperties" />
    <col className="artifact-col-refinement" />
  </colgroup>;
}

function ArtifactTableHeader({ sortHeader }: {
  sortHeader: (key: ArtifactSortKey, label: ReactNode, alignLeft?: boolean) => ReactNode;
}) {
  return <thead>
    <tr>
      {sortHeader('location', 'Location', true)}
      {sortHeader('value', <span className="table-heading-two-line" aria-label="Value on mon">Value on<br />mon</span>, true)}
      {sortHeader('category', 'Type', true)}
      {sortHeader('equipClass', 'Fits', true)}
      {sortHeader('grade', 'Quality', true)}
      {sortHeader('mainProperty', 'Main stat', true)}
      {sortHeader('subProperties', 'Substats', true)}
      {/* Not sortable: the flag marks a handful of rows and reads as an
          annotation on the row rather than a column to order by. */}
      <th scope="col"><span className="visually-hidden">Refinement</span></th>
    </tr>
  </thead>;
}

export function ArtifactList({ game, monsters, preferences }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
}) {
  const [sort, setSort] = useState<{ key: ArtifactSortKey; ascending: boolean }>({ key: 'index', ascending: true });
  const [filters, setFilters] = useLocalStorageState(
    'jaswa.filters.artifacts', defaultArtifactFilters, isArtifactFilterState,
  );
  const { search, selectedCategories, selectedClasses, selectedGrades, selectedMainProperties,
    sortBySubProperty, showEquipped, showInventory } = filters;
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
      const propertyPreferences = wearer
        ? defaultPropertyPreferences(wearer.unit_master_id, artifact.category)
        : undefined;
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
        mainPropertyPreference: propertyPreferences?.main[artifact.mainProperty] ?? 'unwanted',
        subProperties: artifact.subProperties,
        subPropertyPreferences: propertyPreferences?.sub ?? null,
      };
    });
  }, [artifacts, monsters, preferences]);

  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const row of rows) {
      for (const subProperty of row.subProperties) {
        definitions.set(subProperty.definition.id, {
          id: subProperty.definition.id,
          name: subProperty.definition.name,
        });
      }
    }
    return [...definitions.values()].sort((left, right) =>
      left.name.localeCompare(right.name) || left.id - right.id);
  }, [rows]);

  /* A changed import can remove the property that was selected in the previous
     one. Keep that stale state from turning into an invisible filter. */
  const activeSortBySubProperty = sortBySubProperty !== null
    && subPropertyOptions.some((option) => option.id === sortBySubProperty)
    ? sortBySubProperty : null;

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
      if (selectedClasses.length && !selectedClasses.includes(artifactEquipClassLabel(row.artifact))) return false;
      if (activeSortBySubProperty !== null
        && !row.subProperties.some((property) => property.definition.id === activeSortBySubProperty)) return false;
      if (!term) return true;
      return row.location?.toLowerCase().includes(term)
        || row.subProperties.some((property) => property.definition.name.toLowerCase().includes(term));
    });
    if (activeSortBySubProperty !== null) {
      return [...filtered].sort((left, right) => {
        const leftMagnitude = subPropertyMagnitude(left, activeSortBySubProperty);
        const rightMagnitude = subPropertyMagnitude(right, activeSortBySubProperty);
        if (leftMagnitude === null || rightMagnitude === null) {
          if (leftMagnitude === rightMagnitude) return left.index - right.index;
          return leftMagnitude === null ? 1 : -1;
        }
        return rightMagnitude - leftMagnitude || left.index - right.index;
      });
    }
    const { key, ascending } = sort;
    if (key === 'index') return ascending ? filtered : [...filtered].reverse();
    const direction = ascending ? 1 : -1;
    return [...filtered].sort((left, right) =>
      compareArtifactRows(left, right, key, direction) || left.index - right.index);
  }, [rows, search, selectedCategories, selectedClasses, selectedGrades, selectedMainProperties,
    showEquipped, showInventory, sort, activeSortBySubProperty]);

  function toggleSort(key: ArtifactSortKey) {
    /* A table-header click hands ordering back to the table and clears the
       property-specific ordering, while the dropdown remains the compact way
       to both filter and rank one substat. */
    setSortBySubProperty(null);
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      : { key, ascending: defaultArtifactSortDirections[key] });
  }

  function toggle<T>(value: T, set: (update: (current: T[]) => T[]) => void) {
    set((current) => current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]);
  }

  function setSearch(update: string) {
    setFilters((current) => ({ ...current, search: update }));
  }

  function setSelectedCategories(update: (current: ArtifactCategory[]) => ArtifactCategory[]) {
    setFilters((current) => ({ ...current, selectedCategories: update(current.selectedCategories) }));
  }

  function setSelectedClasses(update: (current: string[]) => string[]) {
    setFilters((current) => ({ ...current, selectedClasses: update(current.selectedClasses) }));
  }

  function setSelectedGrades(update: (current: ArtifactGrade[]) => ArtifactGrade[]) {
    setFilters((current) => ({ ...current, selectedGrades: update(current.selectedGrades) }));
  }

  function setSelectedMainProperties(update: (current: ArtifactMainProperty[]) => ArtifactMainProperty[]) {
    setFilters((current) => ({ ...current, selectedMainProperties: update(current.selectedMainProperties) }));
  }

  function setSortBySubProperty(update: number | null) {
    setFilters((current) => ({ ...current, sortBySubProperty: update }));
  }

  function setShowEquipped(update: (current: boolean) => boolean) {
    setFilters((current) => ({ ...current, showEquipped: update(current.showEquipped) }));
  }

  function setShowInventory(update: (current: boolean) => boolean) {
    setFilters((current) => ({ ...current, showInventory: update(current.showInventory) }));
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
    const sorted = activeSortBySubProperty === null && sort.key === key;
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

  return <div className="artifact-library">
    <DataTablePage
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
      <div className="filter-group artifact-filter-sort-by" role="group" aria-label="Sort artifacts by substat">
        <label className="filter-label" htmlFor="artifact-sort-by">Sort by</label>
        <div className="filter-group-controls">
          <Dropdown id="artifact-sort-by"
            className="artifact-sort-select"
            value={activeSortBySubProperty ?? ''}
            onChange={(event) => {
              const selected = subPropertyOptions.find((option) => String(option.id) === event.target.value);
              setSortBySubProperty(selected?.id ?? null);
            }}
            aria-label="Sort artifacts by substat"
            placeholder="Select a substat">
            {subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Dropdown>
        </div>
      </div>
      {toggleGroup('Type', 'Filter by artifact type', categoryOrder,
        selectedCategories, setSelectedCategories, (category) => artifactCategoryLabels[category], 'artifact-filter-type')}
      {toggleGroup('Element', 'Filter by element', classOptions.attribute,
        selectedClasses, setSelectedClasses, abbreviate, 'artifact-filter-element')}
      {toggleGroup('Archetype', 'Filter by monster type', classOptions.type,
        selectedClasses, setSelectedClasses, abbreviate, 'artifact-filter-archetype')}
      {/* Its own group because it belongs to neither list: an Intangible
          artifact restricts to no element and no monster type. */}
      {toggleGroup('Wildcard', 'Filter by unrestricted equip class', intangibleOption,
        selectedClasses, setSelectedClasses, abbreviate, 'artifact-filter-intangible')}
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
          {visible.length ? visible.map((row) => <tr key={row.artifact.id}>
            <td className={row.location ? 'align-left' : 'align-left muted'}
              title={row.location === null ? 'Worn by a monster this import does not contain' : undefined}>
              {row.location ?? 'Unknown monster'}
            </td>
            <td className={row.value === undefined ? 'align-left muted' : 'align-left'}
              title={row.value === undefined && row.artifact.occupiedId !== null
                ? 'Not judged: nothing recorded for this monster type'
                : undefined}>
              {row.value === undefined ? '—' : `${formatNumber(Math.round(row.value * 100), preferences.general)} %`}
            </td>
            <td className="align-left dim">{artifactCategoryLabel(row.artifact.category)}</td>
            <td className="align-left">{artifactEquipClassLabel(row.artifact)}</td>
            <td className="align-left dim">{row.artifact.grade}</td>
            <td className={`align-left artifact-main-${row.mainPropertyPreference}`}>
              {row.artifact.mainProperty}
            </td>
            <td className="align-left">
              <ul className="artifact-subs">
                {row.subProperties.map((subProperty, index) => {
                  const preference = row.subPropertyPreferences?.get(subProperty.definition.id) ?? 'unwanted';
                  return <li
                    key={subProperty.definition.id}
                    className={`artifact-sub-${preference}${subProperty.definition.status === 'legacy' ? ' legacy' : ''}`}
                  >
                    {displaySubProperty(subProperty, (value) => formatNumber(value, preferences.general))}
                    {row.artifact.convertedPropertyIndex === index && <ConvertedArtifactMark position={index} />}
                    {subProperty.powerUps > 0 && <>{' '}<span className="artifact-sub-power-ups">
                      <span aria-hidden="true">[{subProperty.powerUps}<PowerUpMark />]</span>
                      <span className="visually-hidden"> {subProperty.powerUps} power-up{subProperty.powerUps === 1 ? '' : 's'}</span>
                    </span></>}
                  </li>;
                })}
              </ul>
            </td>
            <td className="artifact-refinement-flag"><UnrefinedArtifactMark unrefined={row.artifact.unrefined} /></td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={9}>No artifacts match these filters. Clear a filter to see more.</td>
          </tr>}
      </tbody>
    </DataTablePage>
  </div>;
}
