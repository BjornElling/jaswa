import { useMemo } from 'react';
import { FilterButton } from './button';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { SortableHeader } from './sortable-table';
import { useRowOpener } from './use-row-opener';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { columnClasses, relicMonsterTableColumns } from '../lib/table-layouts';
import type { GameRecord } from '../lib/game-data';
import type { Preferences } from '../lib/types';
import { monsterPresentation } from '../lib/monster-catalog';
import type { MonsterArchetype } from '../lib/monster-catalog';
import { withHigherAwakenings } from '../lib/monster-identity';
import { monsterCopyNames } from '../lib/monster-names';
import { elementName, elementNameList } from '../lib/rune-sets';
import { isStoredMonster, monsterArchetypeLabels, monsterFilterArchetypes, numericOrNull } from '../lib/monster-grid';
import { relicEngravingCounts } from '../lib/relics';
import type { Relic } from '../lib/relics';
import {
  allocateRelicEngravings, assertRelicAllocation, relicHalvesAgainstOptimum,
} from '../lib/relic-monster-fit';
import type { RelicAllocationSubject } from '../lib/relic-monster-fit';
import { relicUsageObservations, relicUsageStatistics } from '../lib/relic-monster-statistics';
import {
  compareRelicMonsterRows, defaultRelicMonsterSortDirections, isRelicEngravableMonster,
  relicMonsterReason, relicMonsterRelicDetail, relicMonsterRelicLabel, relicMonsterSearchText,
  relicMonsterVerdict, relicMonsterVerdictLabels,
} from '../lib/relic-monster-grid';
import type { RelicMonsterRow, RelicMonsterSortKey } from '../lib/relic-monster-grid';
import { formatNumber } from '../lib/formatting';
import { canEquipRelics } from '../lib/monster-equipment-eligibility';
import { useSessionStorageState } from '../lib/session-storage-state';

/* The game caps monsters at 40 today, so a level below that is not maxed. A
   floor rather than an exact match keeps the filter right if the cap rises —
   the same reading the roster table uses. */
const maxMonsterLevel = 40;

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
  showBelowMaxLevel: boolean;
  /**
   * Drops every monster already carrying a relic, whichever relic it is and
   * whatever the page thinks of it. Engraving a bare monster costs nothing but
   * the relic's own places, while moving one already engraved means undoing an
   * engraving first — so this leaves the monsters that can be acted on today.
   *
   * Not `recommendation.alreadyEngraved`, which is the narrower claim that the
   * relic it wears is the one this page would give it.
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

const defaultRelicMonsterFilters: RelicMonsterFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  showInventory: true,
  showStorage: true,
  showBelowMaxLevel: false,
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
    && typeof candidate.showBelowMaxLevel === 'boolean'
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
    column('current', <span className="table-heading-two-line" aria-label="The relic this monster wears today">Current<br />relic</span>),
    column('recommended', <span className="table-heading-two-line" aria-label="The relic to engrave on this monster">Recommended<br />relic</span>),
    /* Two readings of the recommended relic, each against the best that half
       could be on this monster. Named for the halves themselves rather than for
       a composite, because a reader can check either one against the game's own
       Statistics panel.
       Both headings carry `Recc.` because both rate the relic in the column two
       to their left and not the one the monster wears today. Unqualified, they
       sat beside `Current relic` reading as though they described it — the
       distinction the cell titles spell out belongs in the heading too. */
    column('mainStat', <span className="table-heading-two-line" aria-label="The recommended main property, as a share of this monster's most-engraved main">Recc. main<br />stat</span>),
    column('uniqueStat', <span className="table-heading-two-line" aria-label="The recommended unique property, as a share of this monster's most-engraved unique property">Recc. unique<br />prop.</span>),
    column('advice', 'Advice'),
  ];
})();

/**
 * One half's column, in words: what the cell measures, and what the relic the
 * monster wears today scores on the same measure.
 *
 * The second half is the point of the title. The column rates the *recommended*
 * relic, so a row asking for a change shows a figure for a relic the monster is
 * not wearing; without the incumbent's own number beside it the reader cannot
 * see the size of the change being proposed.
 *
 * Where no panel was captured there is nothing to divide by, and the title says
 * so rather than printing a share of nothing — `undefined` and `0` are
 * different answers, and `0 %` would read as the population having rejected the
 * property.
 */
function halfExplanation(
  half: 'main' | 'unique',
  row: RelicMonsterRow,
  percent: (value: number) => string,
  format: (value: number) => string,
): string | undefined {
  if (row.recommendation.chosen?.suitability.status === 'missing') {
    return 'No statistics captured for this monster.';
  }
  const recommended = row.recommendedHalves[half];
  if (recommended === null || !row.usage) return undefined;
  const suitability = row.recommendation.chosen?.suitability;
  const observed = half === 'main' ? suitability?.mainShare : suitability?.uniqueShare;
  const wearing = row.currentHalves[half];
  return [
    `${percent(recommended)} of this monster's most-engraved ${half === 'main' ? 'main property' : 'unique property'}`,
    typeof observed === 'number' ? `${percent(observed)} of its engravings carry it` : null,
    wearing === null ? 'it wears nothing rated here' : `the relic it wears reads ${percent(wearing)}`,
    /* The sample size travels with every reading rather than gating it. A
       percentage drawn from 88 engravings and one drawn from 69,590 look
       identical in a column, and only one of them is worth leaning on. */
    `${format(relicUsageObservations(row.usage))} engravings measured`,
  ].filter(Boolean).join('; ');
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
     a display filter. Material monsters wear no equipment, so giving one a
     place on a relic would take that place from a monster that could use it —
     and the account holds fodder by the dozen. */
  const monsters = useMemo(
    () => roster.filter((monster) => isRelicEngravableMonster(monster.unit_master_id) && canEquipRelics(monster)),
    [roster],
  );
  const {
    search, selectedElements, selectedArchetypes, showInventory, showStorage, showBelowMaxLevel,
    hideAlreadyEngraved, hideAlreadyOptimal,
  } = filters;

  const relicsById = useMemo(() => new Map(relics.map((relic) => [relic.id, relic])), [relics]);

  /* The relics a monster wears, resolved against the account's own relic list
     rather than read out of the monster record. The export repeats the whole
     relic under every wearer, and the library has already merged and validated
     those copies — reading them twice would let a monster show a relic the
     library rejected, which is exactly the invisible row `AGENTS.md` §0.1
     forbids. */
  const wornByMonster = useMemo(() => {
    const worn = new Map<string, Relic[]>();
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
      worn.set(unitId, list);
    });
    return worn;
  }, [monsters, relicsById]);

  /* Every monster the account holds is answered here, whatever the filters above
     are set to. Under §11.5's gate each answer is already independent of the
     others, so the scope cannot change a row — but the counts it reads are
     account-wide, and a relic hidden from the view still occupies its places. */
  const allocation = useMemo(() => {
    const subjects: RelicAllocationSubject[] = monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const stated = preferences.monsterPreferences[unitId];
      return {
        monsterId: unitId,
        monsterOrder: index,
        masterId: monster.unit_master_id,
        wornRelicIds: (wornByMonster.get(unitId) ?? []).map((relic) => relic.id),
        /* What this copy's owner asked for, where they asked for anything. The
           plan is theirs to direct; the statistics answer only where they have
           not. */
        ...(stated === undefined ? {} : { preferences: stated }),
      };
    });
    const result = allocateRelicEngravings(
      subjects, relics, relicEngravingCounts(monsters), relicUsageStatistics,
    );
    assertRelicAllocation(result, subjects);
    return result;
  }, [monsters, relics, wornByMonster, preferences.monsterPreferences]);

  const rows = useMemo<RelicMonsterRow[]>(() => {
    const copyNames = monsterCopyNames(monsters, preferences.monsterPreferences);
    return monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const display = monsterPresentation(monster.unit_master_id);
      const worn = wornByMonster.get(unitId) ?? [];
      const recommendation = allocation.recommendations.get(unitId) ?? {
        monsterId: unitId,
        chosen: null,
        ideal: null,
        alreadyEngraved: false,
        limit: 'none' as const,
        retained: false,
        displaceableWearers: 0,
      };
      const verdict = relicMonsterVerdict(recommendation, worn);
      const usage = relicUsageStatistics(monster.unit_master_id);
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
        worn,
        recommendation,
        verdict,
        reason: relicMonsterReason({ recommendation, verdict }),
        usage,
        recommendedHalves: relicHalvesAgainstOptimum(recommendation.chosen?.relic, usage),
        currentHalves: relicHalvesAgainstOptimum(worn[0], usage),
      };
    });
  }, [monsters, preferences, wornByMonster, allocation]);

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
      /* `Keep` is precisely "already wearing what the page would recommend", so
         hiding it leaves the rows that ask for something — and, like every
         other control here, it drops rows rather than touching a judgement. */
      if (hideAlreadyOptimal && row.verdict === 'keep') return false;
      /* The relics the monster wears, as the account's own relic list gave them
         — so a row hidden here is one the export really does show engraved, not
         one whose record merely mentions a relic the library rejected. */
      if (hideAlreadyEngraved && row.worn.length) return false;
      /* Storage and Inventory are the game's two places a monster can be, so
         the pair is exhaustive: turning both off is a request for nothing. */
      if (!showStorage && row.inStorage) return false;
      if (!showInventory && !row.inStorage) return false;
      if (!showBelowMaxLevel && (row.level === null || row.level < maxMonsterLevel)) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (!term) return true;
      return searchedMasterIds?.has(row.masterId) || relicMonsterSearchText(row).includes(term);
    });
  }, [rows, search, searchedMasterIds, selectedElements, selectedArchetypes,
    showInventory, showStorage, showBelowMaxLevel, hideAlreadyEngraved, hideAlreadyOptimal]);

  /* The page exists to answer "what should this monster be wearing", so it opens
     on the rows that want something done rather than on the import's own order:
     Engrave, then Replace, then the rows already carrying their answer. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, relicMonsterColumns, { key: 'advice', direction: 'ascending' },
  );

  const format = useMemo(() => (value: number) => formatNumber(value, preferences.general), [preferences.general]);
  const percent = (value: number) => `${format(Math.round(value * 100))} %`;

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
        ? 'None of these monsters can carry a relic.'
        : 'This import holds no monsters to engrave.'}</h2>
      <p className="next-step">{roster.length
        ? 'Material monsters wear no equipment, so there is nothing here to plan.'
        : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
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
            <FilterButton active={showBelowMaxLevel}
              onClick={() => setFilters((current) => ({ ...current, showBelowMaxLevel: !current.showBelowMaxLevel }))}
            >Lvl. &lt; {maxMonsterLevel}</FilterButton>
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
              title="Monsters already wearing a relic, whichever relic it is"
            >Already engraved</FilterButton>
            <FilterButton active={hideAlreadyOptimal}
              onClick={() => setFilters((current) => ({
                ...current, hideAlreadyOptimal: !current.hideAlreadyOptimal,
              }))}
              title="Monsters already wearing the relic this page would give them"
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
              <RelicCell relic={row.worn[0]} />
              {/* Parity before tidiness: a monster the export gives more than
                  one relic shows every one of them rather than having the
                  extras quietly dropped from the page. */}
              {row.worn.length > 1 && <span className="relic-effect">
                {row.worn.slice(1).map((relic) => relicMonsterRelicLabel(relic)).join(', ')}
              </span>}
            </td>
            {/* Where the plan names the relic the monster is already wearing,
                the cell says so in a word instead of repeating the two lines
                beside it. The repetition made a row with nothing to do look
                exactly as busy as a row with a swap to make. */}
            <td className={relicMonsterCell('recommended')}>
              {row.recommendation.alreadyEngraved
                ? <span className="relic-monster-same">Same</span>
                : <RelicCell relic={chosen?.relic} />}
            </td>
            {/* Each half against the best that half could be here, with the
                observed shares and the relic it wears today in the title —
                which is what turns a percentage into something the reader can
                check against the game's own Statistics panel. */}
            <td className={relicMonsterCell('mainStat', row.recommendedHalves.main === null && 'muted')}
              title={halfExplanation('main', row, percent, format)}>
              {row.recommendedHalves.main === null ? '—' : percent(row.recommendedHalves.main)}
            </td>
            <td className={relicMonsterCell('uniqueStat', row.recommendedHalves.unique === null && 'muted')}
              title={halfExplanation('unique', row, percent, format)}>
              {row.recommendedHalves.unique === null ? '—' : percent(row.recommendedHalves.unique)}
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
