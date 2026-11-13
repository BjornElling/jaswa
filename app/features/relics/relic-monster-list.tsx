import { filterIncludes, filterPair } from '../../domain/shared/filter-selection';
import { useMemo } from 'react';
import { FilterButton } from '../../ui/button';
import { DataTablePage, TableColumnGroup } from '../../ui/data-table-page';
import { FilterSummary } from '../../ui/filter-summary';
import { MonsterLink } from '../../ui/gear/monster-link';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import { SortableHeader } from '../../ui/sortable-table';
import { useRowOpener } from '../../ui/use-row-opener';
import { useSortedRows } from '../../ui/use-sorted-rows';
import type { SortableColumn } from '../../ui/use-sorted-rows';
import { columnClasses, relicMonsterTableColumns } from '../../ui/table-layouts';
import type { GameRecord } from '../../domain/account/game-record';
import type { Preferences } from '../../domain/model';
import { monsterPresentation } from '../../domain/monsters/monster-catalog';
import type { MonsterArchetype } from '../../domain/monsters/monster-catalog';
import { withHigherAwakenings } from '../../domain/monsters/monster-identity';
import { monsterCopyNames } from '../../domain/monsters/monster-names';
import { profileIn, profilesIn } from '../../domain/profiles/monster-preferences';
import { scenarioPresetId } from '../../domain/placements/presets';
import { elementName, elementNameList } from '../../domain/runes/rune-sets';
import { isStoredMonster, monsterArchetypeLabels, monsterFilterArchetypes, numericOrNull } from '../../domain/monsters/monster-grid';
import { relicEngravingCounts } from '../../domain/relics/relics';
import type { Relic } from '../../domain/relics/relics';
import {
  allocateRelicEngravings, assertRelicAllocation,
} from '../../domain/relics/relic-monster-fit';
import type { RelicAllocationSubject } from '../../domain/relics/relic-monster-fit';
import { relicMonsterModel, relicMonsterValue } from '../../domain/relics/relic-monster-value';
import {
  compareRelicMonsterRows, defaultRelicMonsterSortDirections, isRelicPlanMonster,
  relicMonsterReason, relicMonsterRelicDetail, relicMonsterRelicLabel, relicMonsterSearchText,
  relicMonsterVerdict, relicMonsterVerdictLabels,
} from '../../domain/relics/relic-monster-grid';
import type { RelicMonsterRow, RelicMonsterSortKey } from '../../domain/relics/relic-monster-grid';
import { formatDecimal, formatNumber } from '../../domain/shared/formatting';
import { canEngraveRelics } from '../../domain/monsters/monster-engrave-eligibility';
import { useSessionStorageState } from '../../ui/session-state';

/**
 * This table's filters and nothing else. Every one of them decides which rows
 * are *shown*. Every row is decided from that monster, the relics and the
 * engraving counts in the import before any of this runs, so narrowing the view
 * can never change what the page advises (`RELIC-CANONICAL.md` §11.6).
 */
type RelicMonsterFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: MonsterArchetype[];
  showInventory: boolean;
  showStorage: boolean;
  /**
   * Drops every monster already carrying a relic, whichever relic it is and
   * whatever the page thinks of it. Engraving a bare monster costs nothing but
   * the relic's own places, while moving one already engraved means undoing an
   * engraving first — so this leaves the monsters that can be acted on today.
   *
   * Not `recommendation.alreadyEngraved`, which is the narrower claim that the
   * relic it has engraved is the one this page would give it.
   */
  hideAlreadyEngraved: boolean;
  /**
   * Drops the rows with nothing to do. On an account whose relics are mostly
   * placed, `Keep` is the commonest verdict by a wide margin, and the rows worth
   * reading are the ones asking for a change — so this turns the table into a
   * worklist without changing a single judgement behind it.
   */
  hideAlreadyOptimal: boolean;
};

/* Include opens with neither location chosen, which the inclusive-filter rule
   reads as both (`ACCOUNT-TABLES.md`): pressing one then narrows to it rather
   than taking it away. There is no level control, because every row is Lv. 40
   before a filter runs — the plan's scope admits nothing else. */
const defaultRelicMonsterFilters: RelicMonsterFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  showInventory: false,
  showStorage: false,
  hideAlreadyEngraved: false,
  hideAlreadyOptimal: false,
};

function isRelicMonsterFilterState(value: unknown): value is RelicMonsterFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => typeof entry === 'string' && elementNameList.includes(entry))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as MonsterArchetype))
    && typeof candidate.showInventory === 'boolean'
    && typeof candidate.showStorage === 'boolean'
    && typeof candidate.hideAlreadyEngraved === 'boolean'
    && typeof candidate.hideAlreadyOptimal === 'boolean';
}

/* One implementation, shared with every other table: a second one here read the
   column plan for its alignment and quietly ignored everything else the plan
   declares, so the gutters opened in the heading and not in the rows under it. */
const relicMonsterCell = columnClasses(relicMonsterTableColumns);

const relicMonsterColumns: readonly SortableColumn<RelicMonsterRow>[] = (() => {
  const column = (key: RelicMonsterSortKey, label: SortableColumn<RelicMonsterRow>['label'], accessibleLabel?: string) => {
    /* The plan is the single source for how a column sits in its box, so the
       heading takes both of its declarations from the same entry the rows do. */
    const planned = relicMonsterTableColumns.find((entry) => entry.key === key);
    return {
      key,
      label,
      accessibleLabel,
      align: planned?.align,
      gutter: planned?.gutter,
      initialDirection: defaultRelicMonsterSortDirections[key] ? 'ascending' as const : 'descending' as const,
      compare: (left: RelicMonsterRow, right: RelicMonsterRow) =>
        compareRelicMonsterRows(left, right, key) || left.index - right.index,
    };
  };
  return [
    column('index', '#', 'Row number'),
    column('name', 'Monster'),
    column('element', 'Elem'),
    column('archetype', 'Type'),
    column('level', 'LVL'),
    column('current', <span className="table-heading-two-line" aria-label="The relic engraved on this monster today">Current<br />relic</span>),
    column('recommended', <span className="table-heading-two-line" aria-label="The relic to engrave on this monster">Recommended<br />relic</span>),
    /* The two score contributions describe the recommended relic, not its popularity.
       The unique half is headed *Substat* on purpose: the player already reads a
       piece as a main stat and its substats everywhere else in the game, and
       *Unique* named nothing they knew. */
    column('mainStat', <span className="table-heading-two-line" aria-label="The recommended main bonus in weighted score points">Main stat<br />value</span>),
    column('uniqueStat', <span className="table-heading-two-line" aria-label="The recommended unique bonus in weighted score points">Substat<br />value</span>),
    column('advice', 'Advice'),
  ];
})();

/** The displayed points and the underlying effect come from the same calculation. */
function halfExplanation(
  half: 'main' | 'unique', row: RelicMonsterRow, points: (value: number) => string,
): string | undefined {
  const value = row.recommendation.chosen?.value;
  if (!value) return row.reason || undefined;
  const current = row.currentHalves[half];
  const relic = row.recommendation.chosen!.relic;
  const effect = half === 'main'
    ? `${points(value.mainGain)} ${relic.mainProperty}`
    : `${points(value.uniquePercent)} % ${relic.unique.definition.grants}, from ${points(value.sourceValue)} ${relic.unique.definition.per}`;
  return `${points(value[half])} weighted score points; ${effect}; `
    + (current === null ? 'nothing engraved to compare' : `first current relic: ${points(current)} points`)
    + `; total value: ${points(value.score)} points. See The Math for assumptions.`;
}
/** A relic cell: the property over its main and level, or an em dash. */
function RelicCell({ relic }: { relic: Relic | undefined }) {
  if (!relic) return <span className="relic-monster-none">—</span>;
  return <>
    <span className="relic-property">{relicMonsterRelicLabel(relic)}</span>
    <span className="relic-effect">{relicMonsterRelicDetail(relic)}</span>
  </>;
}

export function RelicMonsterList({ relics, monsters: roster, preferences, onOpenMonster }: {
  relics: readonly Relic[];
  monsters: readonly GameRecord[];
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const rowOpener = useRowOpener();
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.relic-monsters', defaultRelicMonsterFilters, isRelicMonsterFilterState,
  );

  /* The plan's scope, and the only place the roster is narrowed by anything but
     a display filter. Leaving Material monsters out is JASWA's policy, not a
     game rule: the game asks only for Lv. 40, but a place on a relic given to
     fodder is taken from a monster that could use it, and the account holds
     fodder by the dozen. The policy decides which rows are proposed and never
     the capacity — `relicEngravingCounts` below reads the whole roster, so a
     relic already on a Material copy still fills its place. */
  const monsters = useMemo(
    () => roster.filter((monster) => isRelicPlanMonster(monster.unit_master_id) && canEngraveRelics(monster)),
    [roster],
  );
  const {
    search, selectedElements, selectedArchetypes, showInventory, showStorage,
    hideAlreadyEngraved, hideAlreadyOptimal,
  } = filters;

  const relicsById = useMemo(() => new Map(relics.map((relic) => [relic.id, relic])), [relics]);
  const models = useMemo(() => new Map(monsters.map((monster, index) => [
    String(monster.unit_id ?? `unknown-${index}`), relicMonsterModel(monster),
  ])), [monsters]);

  /* The relics engraved on a monster, resolved against the account's own relic list
     rather than read out of the monster record. The export repeats the whole
     relic under every monster it is engraved on, and the library has already merged and validated
     those copies — reading them twice would let a monster show a relic the
     library rejected, which is exactly the invisible row `AGENTS.md` §0.1
     forbids. */
  const engravedByMonster = useMemo(() => {
    const engraved = new Map<string, Relic[]>();
    monsters.forEach((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const list: Relic[] = [];
      if (Array.isArray(monster.relics)) {
        const seen = new Set<string>();
        for (const entry of monster.relics) {
          const rid = numericOrNull((entry as GameRecord | null)?.rid);
          if (rid === null) continue;
          const id = String(rid);
          if (seen.has(id)) continue;
          seen.add(id);
          const relic = relicsById.get(id);
          if (relic) list.push(relic);
        }
      }
      engraved.set(unitId, list);
    });
    return engraved;
  }, [monsters, relicsById]);

  /* Every monster the account holds is answered here, whatever the filters above
     are set to: the plan shares each relic's places across the whole roster
     (§11.5), so a row hidden from the view still competes for a place. */
  const allocation = useMemo(() => {
    const subjects: RelicAllocationSubject[] = monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      /* A relic is Scenario's in every preset (`DECK-PRESETS.md` §1), so it is
         planned against the copy's Scenario profile. */
      const stated = profileIn(preferences.monsterPreferences, scenarioPresetId, unitId);
      return {
        monsterId: unitId,
        model: models.get(unitId)!,
        engravedRelicIds: (engravedByMonster.get(unitId) ?? []).map((relic) => relic.id),
        /* Only saved choices constrain the plan; statistics defaults never score. */
        ...(stated === undefined ? {} : { preferences: stated }),
      };
    });
    const result = allocateRelicEngravings(
      subjects, relics, relicEngravingCounts(roster),
    );
    assertRelicAllocation(result, subjects);
    return result;
  }, [monsters, roster, relics, engravedByMonster, preferences.monsterPreferences, models]);

  const rows = useMemo<RelicMonsterRow[]>(() => {
    const copyNames = monsterCopyNames(monsters, profilesIn(preferences.monsterPreferences, scenarioPresetId));
    return monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const display = monsterPresentation(monster.unit_master_id);
      const engraved = engravedByMonster.get(unitId) ?? [];
      const recommendation = allocation.recommendations.get(unitId)!;
      const verdict = relicMonsterVerdict(recommendation, engraved);
      const current = engraved[0] ? relicMonsterValue(engraved[0], models.get(unitId)!) : null;
      const chosen = recommendation.chosen?.value;
      return {
        unitId,
        masterId: String(monster.unit_master_id ?? `unknown-${index}`),
        index,
        ...copyNames[unitId],
        searchAliases: display.searchAliases,
        element: elementName(monster.attribute),
        archetype: display.archetype,
        imageFilename: display.imageFilename,
        initial: display.shortName,
        inStorage: isStoredMonster(monster),
        level: numericOrNull(monster.unit_level),
        engraved,
        recommendation,
        verdict,
        reason: relicMonsterReason({ recommendation, verdict }),
        recommendedHalves: { main: chosen?.main ?? null, unique: chosen?.unique ?? null },
        currentHalves: { main: current?.main ?? null, unique: current?.unique ?? null },
      };
    });
  }, [monsters, preferences, engravedByMonster, allocation, models]);

  /* A search names a monster, and awakening it does not change which monster it
     is, so a term reaches the forms above what it matched and never the forms
     below — the same rule, from the same module, as the roster table. */
  const searchedMasterIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return undefined;
    const named = rows
      .filter((row) => [row.name, ...(row.searchAliases ?? [])]
        .some((name) => name.toLowerCase().includes(term)))
      .map((row) => row.masterId);
    return withHigherAwakenings(named, rows.map((row) => row.masterId));
  }, [rows, search]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      /* `Keep` is precisely "already has engraved what the page would recommend", so
         hiding it leaves the rows that ask for something — and, like every
         other control here, it drops rows rather than touching a judgement. */
      if (hideAlreadyOptimal && row.verdict === 'keep') return false;
      /* The relics engraved on the monster, as the account's own relic list gave them
         — so a row hidden here is one the export really does show engraved, not
         one whose record merely mentions a relic the library rejected. */
      if (hideAlreadyEngraved && row.engraved.length) return false;
      if (!filterPair(row.inStorage, showStorage, showInventory)) return false;
      if (!filterIncludes(selectedElements, row.element, elementNameList)) return false;
      if (!filterIncludes(selectedArchetypes, row.archetype, monsterFilterArchetypes)) return false;
      if (!term) return true;
      return searchedMasterIds?.has(row.masterId) || relicMonsterSearchText(row).includes(term);
    });
  }, [rows, search, searchedMasterIds, selectedElements, selectedArchetypes,
    showInventory, showStorage, hideAlreadyEngraved, hideAlreadyOptimal]);

  /* The page exists to answer "what should be engraved on this monster", so it opens
     on the rows that want something done rather than on the import's own order:
     Engrave, then Replace, then the rows already carrying their answer. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, relicMonsterColumns, { key: 'advice', direction: 'ascending' },
  );

  const points = (value: number) => formatDecimal(value, preferences.general, 2);

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

  if (!monsters.length) {
    return <section className="empty-state">
      <h2>{roster.length
        ? 'No monster here is up for a relic plan.'
        : 'This import holds no monsters to engrave.'}</h2>
      <p className="next-step">{roster.length
        ? 'Relics need Lv. 40, and JASWA leaves Material monsters out of the plan.'
        : 'Go to Home to connect the helper or import a game file.'}</p>
    </section>;
  }

  return <div className="relic-monster-library">
    <DataTablePage
      filterClassName="relic-monster-filter-strip"
      tableClassName="relic-monster-grid"
      headerLabel="Relic destination columns"
      tableLabel="Relic destinations"
      columnGroup={<TableColumnGroup columns={relicMonsterTableColumns} />}
      header={<SortableHeader columns={relicMonsterColumns} sort={sort} onToggle={toggle} />}
      filters={<>
        <div className="filter-group relic-monster-filter-search">
          <span className="filter-label">Search</span>
          <div className="filter-group-controls">
            <div className="search-field">
              <span aria-hidden="true">⌕</span>
              <input value={search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Filter monsters" aria-label="Filter monsters by name, relic or advice" />
              <FilterButton
                onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
            </div>
          </div>
        </div>
        <div className="filter-group relic-monster-filter-element" role="group" aria-label="Filter by element">
          <span className="filter-label">Element</span>
          <div className="filter-group-controls">
            {elementNameList.map((name) => <FilterButton
              key={name}
              active={selectedElements.includes(name)}
              onClick={() => toggleElement(name)}
            >{name.slice(0, 3).toUpperCase()}</FilterButton>)}
          </div>
        </div>
        <div className="filter-group relic-monster-filter-type" role="group" aria-label="Filter by monster type">
          <span className="filter-label">Type</span>
          <div className="filter-group-controls">
            {monsterFilterArchetypes.map((archetype) => <FilterButton
              key={archetype}
              active={selectedArchetypes.includes(archetype)}
              onClick={() => toggleArchetype(archetype)}
            >{monsterArchetypeLabels[archetype]}</FilterButton>)}
          </div>
        </div>
        <div className="filter-group relic-monster-filter-include" role="group" aria-label="Choose which monsters to include">
          <span className="filter-label">Include</span>
          <div className="filter-group-controls">
            <FilterButton active={showInventory}
              onClick={() => setFilters((current) => ({ ...current, showInventory: !current.showInventory }))}
              title="Monsters on your island rather than in Monster Storage"
              aria-label="Monsters outside Monster Storage"
            >Inventory</FilterButton>
            <FilterButton active={showStorage}
              onClick={() => setFilters((current) => ({ ...current, showStorage: !current.showStorage }))}
            >Storage</FilterButton>
          </div>
        </div>
        {/* The group used to be named for the one control in it. It now holds
            two that leave out different monsters — one the rows with nothing to
            change, the other every monster already carrying a relic — so it is
            named for what the pair does. */}
        <div className="filter-group relic-monster-filter-hide" role="group" aria-label="Choose which monsters to leave out">
          <span className="filter-label">Hide if</span>
          <div className="filter-group-controls">
            <FilterButton active={hideAlreadyEngraved}
              onClick={() => setFilters((current) => ({
                ...current, hideAlreadyEngraved: !current.hideAlreadyEngraved,
              }))}
              title="Monsters with a relic already engraved, whichever relic it is"
            >Already engraved</FilterButton>
            <FilterButton active={hideAlreadyOptimal}
              onClick={() => setFilters((current) => ({
                ...current, hideAlreadyOptimal: !current.hideAlreadyOptimal,
              }))}
              title="Monsters with the relic this page would give them already engraved"
            >Already optimal</FilterButton>
          </div>
        </div>
        <FilterSummary visible={visible.length} total={rows.length} noun="monsters"
          onReset={() => setFilters(defaultRelicMonsterFilters)} className="relic-monster-filter-status" />
      </>}
    >
      <tbody>
        {sorted.length ? sorted.map((row) => {
          const chosen = row.recommendation.chosen;
          return <tr key={row.unitId} {...rowOpener}>
            <td className={relicMonsterCell('index', 'row-index')}>{String(row.index + 1).padStart(2, '0')}</td>
            <td className={relicMonsterCell('name')}>
              <MonsterLink
                target={{ kind: 'copy', unitId: row.unitId, masterId: row.masterId }}
                name={row.name}
                portrait={{ imageFilename: row.imageFilename, initial: row.initial }}
                onOpen={onOpenMonster}
              />
            </td>
            <td className={relicMonsterCell('element', !row.element && 'muted')}>
              {row.element ? row.element.slice(0, 3).toUpperCase() : '—'}
            </td>
            <td className={relicMonsterCell('archetype', !row.archetype && 'muted')}>
              {row.archetype ? monsterArchetypeLabels[row.archetype] : '—'}
            </td>
            <td className={relicMonsterCell('level', row.level === null ? 'dim muted' : 'dim')}>
              {formatNumber(row.level, preferences.general)}
            </td>
            <td className={relicMonsterCell('current')}>
              <RelicCell relic={row.engraved[0]} />
              {/* Parity before tidiness: a monster the export gives more than
                  one relic shows every one of them rather than having the
                  extras quietly dropped from the page. */}
              {row.engraved.length > 1 && <span className="relic-effect">
                {row.engraved.slice(1).map((relic) => relicMonsterRelicLabel(relic)).join(', ')}
              </span>}
            </td>
            {/* Where the plan names the relic already engraved on the monster,
                the cell says so in a word instead of repeating the two lines
                beside it. The repetition made a row with nothing to do look
                exactly as busy as a row with a swap to make. */}
            <td className={relicMonsterCell('recommended')}>
              {row.recommendation.alreadyEngraved
                ? <span className="relic-monster-same">Same</span>
                : <RelicCell relic={chosen?.relic} />}
            </td>
            {/* Values and explanations read the same effect calculation. */}
            <td className={relicMonsterCell('mainStat', row.recommendedHalves.main === null && 'muted')}
              title={halfExplanation('main', row, points)}>
              {row.recommendedHalves.main === null ? '—' : points(row.recommendedHalves.main)}
            </td>
            <td className={relicMonsterCell('uniqueStat', row.recommendedHalves.unique === null && 'muted')}
              title={halfExplanation('unique', row, points)}>
              {row.recommendedHalves.unique === null ? '—' : points(row.recommendedHalves.unique)}
            </td>
            {/* The reason line is rendered only when there is one, so a verdict
                with nothing to add sits centred in its cell instead of being
                pushed up by a blank line. This is not the state-hiding rule 2
                forbids: a row's reason follows the import and the monster, and
                no control on this page can add or remove one, so nothing moves
                under a user who clicks something. The library table opposite
                does reserve its second line, because there the threshold slider
                rewrites it. */}
            <td className={relicMonsterCell('advice')}>
              <span className="relic-verdict" data-verdict={row.verdict}>
                {relicMonsterVerdictLabels[row.verdict]}
              </span>
              {row.reason && <span className="relic-advice-reason">{row.reason}</span>}
            </td>
          </tr>;
        }) : <tr>
          <td className="table-empty-state" colSpan={relicMonsterTableColumns.length}>
            No monsters match these filters. Clear a filter to see more.
          </td>
        </tr>}
      </tbody>
    </DataTablePage>
  </div>;
}
