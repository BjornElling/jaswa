import { filterIncludes, filterPair } from '../lib/filter-selection';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { FilterButton } from './button';
import { PageHeader } from './page-chrome';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { Dropdown } from './dropdown';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { ArtifactEngravedPlace } from './engraved-place';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { alignmentClass, artifactTableColumns } from '../lib/table-layouts';
import type { GameRecord } from '../lib/game-data';
import type { ImportedGame, Preferences } from '../lib/types';
import { readArtifacts } from '../lib/artifacts';
import { artifactJudgementOnMonster } from '../lib/artifact-value-on-monster';
import { scorePercent } from '../lib/compute/artifact-score-core';
import {
  artifactCategoryLabel, artifactEngraveClassLabel, artifactValueTint, compareArtifactRows,
  defaultArtifactSortDirections, displaySubProperty,
} from '../lib/artifact-grid';
import type { ArtifactRow, ArtifactSortKey } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactIntangibleLabel, artifactMainPropertyOrder,
} from '../lib/artifact-properties';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import { monsterCopyNamesIn } from '../lib/monster-names';
import { scenarioPresetId, engravingLines } from '../lib/presets';
import { profilesIn } from '../lib/monster-preferences';
import { usePresets } from '../lib/presets-context';
import { formatNumber } from '../lib/formatting';
import { useSessionStorageState } from '../lib/session-storage-state';
import { WorkspacePage } from './workspace-page';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const elementOrder = Object.values(artifactElements);
const archetypeOrder = Object.values(artifactArchetypes);
/* Intangible is not one of the element or archetype buttons. It belongs to
   neither group — it is the absence of a restriction — so narrowing *to* it
   sat oddly beside nine classes that narrow to one. Include answers the
   question the user actually has about it: whether these wildcards belong in
   the list at all. */
const artifactClassOptions = [...elementOrder, ...archetypeOrder];

type ArtifactFilterState = {
  search: string;
  selectedCategories: ArtifactCategory[];
  selectedClasses: string[];
  selectedGrades: ArtifactGrade[];
  selectedMainProperties: ArtifactMainProperty[];
  sortBySubProperty: number | null;
  showEngraved: boolean;
  showInventory: boolean;
  /**
   * Whether Intangible artifacts appear at all. On by default: they are real
   * artifacts the account owns, and a library that quietly omitted 35 of them
   * would break the parity rule the page exists to honour (`AGENTS.md` §0.1).
   */
  includeIntangible: boolean;
};

const defaultArtifactFilters: ArtifactFilterState = {
  search: '',
  selectedCategories: [],
  selectedClasses: [],
  selectedGrades: [],
  selectedMainProperties: [],
  sortBySubProperty: null,
  showEngraved: true,
  showInventory: true,
  includeIntangible: true,
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
    && typeof candidate.showEngraved === 'boolean'
    && typeof candidate.showInventory === 'boolean'
    && typeof candidate.includeIntangible === 'boolean';
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

/**
 * One artifact-table cell's classes, header or body: the alignment declared for
 * that column in `table-layouts.ts`, then whatever the row itself needs. The
 * heading and the cells read the same declaration, so they cannot drift apart.
 */
function artifactCell(key: string, ...extra: Array<string | false | undefined>): string {
  const align = artifactTableColumns.find((column) => column.key === key)?.align;
  return [alignmentClass(align), ...extra].filter(Boolean).join(' ');
}

/**
 * Every column of the artifact table with the comparison that orders it
 * (`ACCOUNT-TABLES.md` §1), including the marks column — a flag is still something the user may
 * want to gather together, and "every column" admits no quiet exceptions.
 *
 * `subProperty` carries the substat-specific ordering the dropdown drives. It
 * is declared here with `header: false` so it is one sort state rather than
 * two: while it is active no column heading claims to be the sorted one, and a
 * click on any heading hands ordering back to the table.
 */
const artifactColumns = (subPropertyId: number | null): readonly SortableColumn<ArtifactRow>[] => {
  const column = (
    key: ArtifactSortKey, label: ReactNode, accessibleLabel?: string,
  ): SortableColumn<ArtifactRow> => ({
    key,
    label,
    accessibleLabel,
    align: artifactTableColumns.find((entry) => entry.key === key)?.align,
    initialDirection: defaultArtifactSortDirections[key] ? 'ascending' : 'descending',
    compare: (left, right) => compareArtifactRows(left, right, key, 1) || left.index - right.index,
  });
  return [
    column('category', 'Type'),
    column('engraveClass', 'Fits'),
    column('grade', 'Quality'),
    column('mainProperty', 'Main stat'),
    column('subProperties', 'Substats'),
    column('location', 'Location'),
    column('value', <span className="table-heading-two-line" aria-label="Value on mon">Value on<br />mon</span>),
    {
      key: 'refinement',
      label: '',
      accessibleLabel: 'Refinement',
      align: artifactTableColumns.find((entry) => entry.key === 'refinement')?.align,
      /* Unrefined rows first: the mark flags work still to do, so the useful
         end of this ordering is the one that gathers those together. */
      initialDirection: 'descending',
      compare: (left, right) =>
        Number(Boolean(left.artifact.unrefined)) - Number(Boolean(right.artifact.unrefined))
        || left.index - right.index,
    },
    {
      key: 'subProperty',
      label: '',
      header: false,
      compare: subPropertyId === null ? undefined : (left, right) => {
        const leftMagnitude = subPropertyMagnitude(left, subPropertyId);
        const rightMagnitude = subPropertyMagnitude(right, subPropertyId);
        /* An artifact without the property has no place in its ranking either
           way round, so it sorts last in both directions. */
        if (leftMagnitude === null || rightMagnitude === null) {
          if (leftMagnitude === rightMagnitude) return left.index - right.index;
          return leftMagnitude === null ? 1 : -1;
        }
        return rightMagnitude - leftMagnitude || left.index - right.index;
      },
    },
  ];
};

export function ArtifactList({ game, monsters, preferences, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.artifacts', defaultArtifactFilters, isArtifactFilterState,
  );
  const { search, selectedCategories, selectedClasses, selectedGrades, selectedMainProperties,
    sortBySubProperty, showEngraved, showInventory, includeIntangible } = filters;
  const artifacts = useMemo(() => readArtifacts(game?.data), [game]);

  const placements = usePresets();
  /* An artifact's value is read in Scenario, so the profile it is judged by is
     Scenario's; each place it is engraved names its monster in that place's preset. */
  const scenarioProfiles = useMemo(() => profilesIn(preferences.monsterPreferences, scenarioPresetId), [preferences.monsterPreferences]);
  const namesIn = useMemo(() => monsterCopyNamesIn(monsters, preferences.monsterPreferences, placements.presets), [monsters, preferences.monsterPreferences, placements.presets]);
  const monsterName = useCallback((unitId: string, presetId: string) => namesIn(unitId, presetId) ?? 'A monster not in this import', [namesIn]);
  const rows = useMemo<ArtifactRow[]>(() => {
    const monstersByUnitId = new Map<string, GameRecord>();
    for (const monster of monsters) {
      if (monster.unit_id !== undefined && monster.unit_id !== null) monstersByUnitId.set(String(monster.unit_id), monster);
    }
    return artifacts.map((artifact, index) => {
      const engravedOn = artifact.occupiedId === null ? undefined : monstersByUnitId.get(artifact.occupiedId);
      const unitId = engravedOn?.unit_id === undefined ? null : String(engravedOn.unit_id);
      const places = placements.artifacts.get(String(artifact.id)) ?? [];
      const only = places.length === 1 ? monstersByUnitId.get(places[0].unitId) : undefined;
      const preference = unitId === null ? undefined : scenarioProfiles[unitId];
      /* The statement of the monster it is engraved on in Scenario, where it has
         one, so this column answers for that copy rather than for its species —
         and the marks on its lines come from the same reading as the score, so
         a line marked preferred is one the score counted as preferred. */
      const judgement = engravedOn
        ? artifactJudgementOnMonster(artifact, engravedOn, preferences.artifacts, preference)
        : undefined;
      const value = judgement?.value;
      return {
        artifact,
        index,
        location: places.length === 0 ? 'Inventory' : engravingLines(places, placements.presets, monsterName).join(' · '),
        places,
        engravedOn: only === undefined || only.unit_master_id === undefined
          ? undefined
          : { unitId: places[0].unitId, masterId: String(only.unit_master_id), presetId: places[0].presetId },
        /* Rounded once, here, so the column, its colour band and the sort all
           read the same whole-point score the user sees. */
        valuePercent: value === undefined ? undefined : scorePercent(value),
        mainPropertyPreference: judgement?.preferences?.main ?? 'unwanted',
        subProperties: artifact.subProperties,
        subPropertyPreferences: judgement?.preferences?.sub ?? null,
      };
    });
  }, [artifacts, monsters, scenarioProfiles, preferences.artifacts, placements, monsterName]);

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
      const engraved = row.places.length > 0;
      if (!filterPair(engraved, showEngraved, showInventory)) return false;
      /* Include, not narrow-to: switched off, the wildcards leave the list;
         switched on, they sit among the rest and the class buttons still
         choose between elements and archetypes as before. */
      if (!includeIntangible && row.artifact.intangible) return false;
      if (!filterIncludes(selectedCategories, row.artifact.category, categoryOrder)) return false;
      if (!filterIncludes(selectedGrades, row.artifact.grade, artifactGradeOrder)) return false;
      if (!filterIncludes(selectedMainProperties, row.artifact.mainProperty, artifactMainPropertyOrder)) return false;
      if (!filterIncludes(selectedClasses, artifactEngraveClassLabel(row.artifact), artifactClassOptions)) return false;
      if (activeSortBySubProperty !== null
        && !row.subProperties.some((property) => property.definition.id === activeSortBySubProperty)) return false;
      if (!term) return true;
      return row.location.toLowerCase().includes(term)
        || row.subProperties.some((property) => property.definition.name.toLowerCase().includes(term));
    });
    return filtered;
  }, [rows, search, selectedCategories, selectedClasses, selectedGrades, selectedMainProperties,
    showEngraved, showInventory, includeIntangible, activeSortBySubProperty]);

  const columns = useMemo(() => artifactColumns(activeSortBySubProperty), [activeSortBySubProperty]);
  const { sorted, sort, toggle: toggleColumnSort, setSort } = useSortedRows(
    visible, columns, { key: 'index', direction: 'ascending' },
  );

  /* Choosing a substat in the dropdown ranks by it, and clicking any column
     heading hands ordering back to the table. One sort state throughout, so the
     two controls cannot both claim to be ordering the list. */
  const sortingBySubProperty = sort.key === 'subProperty';
  useEffect(() => {
    if (activeSortBySubProperty !== null) setSort({ key: 'subProperty', direction: 'descending' });
    else if (sortingBySubProperty) setSort({ key: 'index', direction: 'ascending' });
  }, [activeSortBySubProperty, setSort, sortingBySubProperty]);

  function toggleSort(key: string) {
    setSortBySubProperty(null);
    toggleColumnSort(key);
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

  function setShowEngraved(update: (current: boolean) => boolean) {
    setFilters((current) => ({ ...current, showEngraved: update(current.showEngraved) }));
  }

  function setShowInventory(update: (current: boolean) => boolean) {
    setFilters((current) => ({ ...current, showInventory: update(current.showInventory) }));
  }

  function setIncludeIntangible(update: (current: boolean) => boolean) {
    setFilters((current) => ({ ...current, includeIntangible: update(current.includeIntangible) }));
  }

  /* Five of the seven groups are the same shape — a heading, then one toggle
     per option — so they are written once and given their options. */
  const toggleGroup = <T extends string>(
    label: string, description: string, options: readonly T[],
    selected: T[], set: (update: (current: T[]) => T[]) => void,
    display: (option: T) => string, className: string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {options.map((option) => <FilterButton
        key={option}
        active={selected.includes(option)}
        onClick={() => toggle(option, set)}
      >{display(option)}</FilterButton>)}
    </div>
  </div>;
  const abbreviate = (option: string) => option.slice(0, 3).toUpperCase();

  return <WorkspacePage
    header={<PageHeader
      title="Artifacts"
      tagline="A museum of tiny stat sticks. Some are priceless. Most are taking up space." />}
  >
    {!artifacts.length ? <section className="empty-state">
      <h2>{game
        ? 'This import holds no artifacts JASWA can read.'
        : 'Nothing to show until a game file is imported.'}</h2>
      <p className="next-step">{game
        ? 'Report it from the rail if your account does have artifacts.'
        : 'Go to Home to connect the helper or import a game file.'}</p>
    </section> : <div className="artifact-library">
      <DataTablePage
      filterClassName="artifact-filter-strip"
      tableClassName="artifact-grid"
      headerLabel="Artifact library columns"
      tableLabel="Artifact library"
      columnGroup={<TableColumnGroup columns={artifactTableColumns} />}
      header={<SortableHeader columns={columns} sort={sort} onToggle={toggleSort} />}
      filters={<>
      <div className="filter-group artifact-filter-search">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter artifacts" aria-label="Filter artifacts by monster or property" />
            <FilterButton onClick={() => setSearch('')}
              hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
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
      {toggleGroup('Quality', 'Filter by quality', artifactGradeOrder,
        selectedGrades, setSelectedGrades, abbreviate, 'artifact-filter-quality')}
      {toggleGroup('Main stat', 'Filter by main stat', artifactMainPropertyOrder,
        selectedMainProperties, setSelectedMainProperties, (property) => property, 'artifact-filter-main-stat')}
      <div className="filter-group artifact-filter-location" role="group" aria-label="Choose artifact locations">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls">
          <FilterButton active={showEngraved}
            onClick={() => setShowEngraved((current) => !current)}
          >Engraved</FilterButton>
          <FilterButton active={showInventory}
            onClick={() => setShowInventory((current) => !current)}
          >Inventory</FilterButton>
        </div>
      </div>
      {/* Beside Location because the two ask the same shape of question — which
          artifacts belong in this list at all — rather than which single class
          to narrow to. */}
      <div className="filter-group artifact-filter-include" role="group" aria-label="Choose which artifacts to include">
        <span className="filter-label">Include</span>
        <div className="filter-group-controls">
          <FilterButton active={includeIntangible}
            onClick={() => setIncludeIntangible((current) => !current)}
          >{artifactIntangibleLabel}</FilterButton>
        </div>
      </div>
      <FilterSummary visible={visible.length} total={rows.length} noun="artifacts"
        onReset={() => setFilters(defaultArtifactFilters)} />
      </>}
    >
      <tbody>
          {sorted.length ? sorted.map((row) => <tr key={row.artifact.id}>
            <td className={artifactCell('category', 'dim')}>{artifactCategoryLabel(row.artifact.category)}</td>
            {/* Type and Fits are both plain description of the artifact, so
                they read at one weight: full ink here made the engrave class
                look like the more important of the two. */}
            <td className={artifactCell('engraveClass', 'dim')}>{artifactEngraveClassLabel(row.artifact)}</td>
            <td className={artifactCell('grade', 'dim')}>{row.artifact.grade}</td>
            <td className={artifactCell('mainProperty', `artifact-main-${row.mainPropertyPreference}`)}>
              {row.artifact.mainProperty}
            </td>
            <td className={artifactCell('subProperties')}>
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
            <td className={artifactCell('location')} title={row.places.length === 1 ? row.location : undefined}>
              {/* One place names its monster and opens it; several are counted
                  and named on hover, since an artifact can sit on a monster in
                  many presets at once. */}
              {row.engravedOn === undefined
                ? <ArtifactEngravedPlace places={row.places} presets={placements.presets} monsterName={monsterName} />
                : <MonsterLink
                  target={{ kind: 'copy', unitId: row.engravedOn.unitId, masterId: row.engravedOn.masterId }}
                  name={monsterName(row.engravedOn.unitId, row.engravedOn.presetId)}
                  presetId={row.engravedOn.presetId} onOpen={onOpenMonster}
                />}
            </td>
            {/* The score bands itself: gold once the artifact is worth acting
                on, full ink where it is respectable, dim where it argues
                against the slot. An unjudged value is not a low score and
                keeps its own muted reading. */}
            <td className={artifactCell('value', row.valuePercent === undefined && 'muted')}
              {...(row.valuePercent === undefined ? {} : artifactValueTint(row.valuePercent))}
              title={row.valuePercent === undefined && row.artifact.occupiedId !== null
                ? 'Not judged: nothing recorded for this monster type'
                : undefined}>
              {row.valuePercent === undefined ? '—' : `${formatNumber(row.valuePercent, preferences.general)} %`}
            </td>
            <td className={artifactCell('refinement', 'artifact-refinement-flag')}><UnrefinedArtifactMark unrefined={row.artifact.unrefined} /></td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={artifactTableColumns.length}>No artifacts match these filters. Clear a filter to see more.</td>
          </tr>}
      </tbody>
      </DataTablePage>
    </div>}
  </WorkspacePage>;
}
