import { filterIncludes, filterPair } from '../../domain/shared/filter-selection';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FilterButton } from '../../ui/button';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import { Disclosure, PageHeader } from '../../ui/page-chrome';
import { DataTablePage, TableColumnGroup } from '../../ui/data-table-page';
import { FilterSummary } from '../../ui/filter-summary';
import { SortableHeader } from '../../ui/sortable-table';
import { useSortedRows } from '../../ui/use-sorted-rows';
import type { SortableColumn } from '../../ui/use-sorted-rows';
import { ValueSlider, RangeSlider } from '../../ui/range-slider';
import { RelicDurabilityMark, RelicLevelMark, RelicSynergyFilterMark, RelicSynergyMark } from './relic-marks';
import { RelicSynergyOverlay } from './relic-synergy-overlay';
import { WorkspacePage } from '../../ui/workspace-page';
import { columnClasses, relicTableColumns } from '../../ui/table-layouts';
import type { GameRecord } from '../../domain/account/game-record';
import type { ImportedGame, Preferences } from '../../domain/model';
import { relicEngravingCounts } from '../../domain/relics/relics';
import type { Relic } from '../../domain/relics/relics';
import {
  relicFamilies, relicFamilyByGrant, relicMainPropertyOrder, relicMaximumDurability, relicMaximumLevel,
  relicNextTierLevel, relicPropertyLabel,
} from '../../domain/relics/relic-properties';
import { relicReachChance } from '../../domain/relics/relic-power-up-model';
import type { RelicMainProperty } from '../../domain/relics/relic-properties';
import { relicSynergy, relicSynergyBandLabels, relicSynergyBandOrder, resolveRelicSynergy } from '../../domain/relics/relic-synergy';
import type { RelicSynergyBand, RelicSynergyChoices } from '../../domain/relics/relic-synergy';
import {
  defaultRelicInvestmentSelectivity, isRelicInvestmentSelectivity, relicAdvice, relicInvestmentSelectivityLabels,
  relicVerdictLabels, relicVerdictOrder, relicMinimumSynergyBands, relicChancePercent,
} from '../../domain/relics/relic-advice';
import type { RelicInvestmentSelectivity, RelicVerdict } from '../../domain/relics/relic-advice';
import {
  compareRelicRows, defaultRelicSortDirections, relicEffectText, relicHasLikelyEnd, relicLevelState,
} from '../../domain/relics/relic-grid';
import type { RelicRow, RelicSortKey } from '../../domain/relics/relic-grid';
import { formatNumber } from '../../domain/shared/formatting';
import { useSessionStorageState } from '../../ui/session-state';

const noRelicRecords: readonly Relic[] = [];

/* Split out on its own, because it reads the 6.6 MB engraving-statistics
   dataset and the library above it does not. Loaded eagerly, the page could
   not show the verdict table — the question it has always answered — until the
   whole player-base distribution had been fetched and parsed. `deferContent`
   on the disclosure below is the other half of that: `details` renders its
   children whether or not it is open, so without it this chunk would be
   requested immediately and the split would buy nothing. */
const RelicMonsterList = lazy(() => import('./relic-monster-list')
  .then(({ RelicMonsterList: component }) => ({ default: component })));

const durabilityOptions = Array.from({ length: relicMaximumDurability + 1 }, (_, value) => value);

const familyNames = relicFamilies.map((entry) => entry.family);

type RelicFilterState = {
  /** The relic's unique-property family — what it grants, in the game's own word. */
  selectedFamilies: string[];
  selectedMains: RelicMainProperty[];
  selectedBands: RelicSynergyBand[];
  selectedVerdicts: RelicVerdict[];
  selectedDurability: number[];
  lowestLevel: number;
  highestLevel: number;
  showEngraved: boolean;
  showInventory: boolean;
  /**
   * How much the user is willing to gamble on a power-up. It sits with the
   * filters because it belongs to the same question the filters answer — what
   * this table should be telling me — even though it changes the verdicts
   * rather than which rows survive.
   */
  selectivity: RelicInvestmentSelectivity;
};

const defaultRelicFilters: RelicFilterState = {
  selectedFamilies: [],
  selectedMains: [],
  selectedBands: [],
  selectedVerdicts: [],
  selectedDurability: [],
  lowestLevel: 0,
  highestLevel: relicMaximumLevel,
  showEngraved: true,
  showInventory: true,
  selectivity: defaultRelicInvestmentSelectivity,
};

function isRelicFilterState(value: unknown): value is RelicFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const level = (entry: unknown) => typeof entry === 'number' && Number.isInteger(entry)
    && entry >= 0 && entry <= relicMaximumLevel;
  return Array.isArray(candidate.selectedFamilies)
    && candidate.selectedFamilies.every((entry) => typeof entry === 'string' && familyNames.includes(entry))
    && Array.isArray(candidate.selectedMains)
    && candidate.selectedMains.every((entry) => relicMainPropertyOrder.includes(entry as RelicMainProperty))
    && Array.isArray(candidate.selectedBands)
    && candidate.selectedBands.every((entry) => relicSynergyBandOrder.includes(entry as RelicSynergyBand))
    && Array.isArray(candidate.selectedVerdicts)
    && candidate.selectedVerdicts.every((entry) => relicVerdictOrder.includes(entry as RelicVerdict))
    && Array.isArray(candidate.selectedDurability)
    && candidate.selectedDurability.every((entry) => durabilityOptions.includes(entry as number))
    && level(candidate.lowestLevel) && level(candidate.highestLevel)
    && (candidate.lowestLevel as number) <= (candidate.highestLevel as number)
    && typeof candidate.showEngraved === 'boolean'
    && typeof candidate.showInventory === 'boolean'
    && isRelicInvestmentSelectivity(candidate.selectivity);
}

const relicCell = columnClasses(relicTableColumns);

const relicColumns: readonly SortableColumn<RelicRow>[] = (() => {
  const column = (key: RelicSortKey, label: SortableColumn<RelicRow>['label'], accessibleLabel?: string) => ({
    key,
    label,
    accessibleLabel,
    align: relicTableColumns.find((entry) => entry.key === key)?.align,
    gutter: relicTableColumns.find((entry) => entry.key === key)?.gutter,
    initialDirection: defaultRelicSortDirections[key] ? 'ascending' as const : 'descending' as const,
    compare: (left: RelicRow, right: RelicRow) => compareRelicRows(left, right, key) || left.index - right.index,
  });
  return [
    column('unique', 'Unique property'),
    column('main', 'Main'),
    column('synergy', 'Synergy'),
    column('level', 'Level'),
    column('durability', 'Durability'),
    column('engraved', <span className="table-heading-two-line" aria-label="Monsters it is engraved on">Engraved<br />on #</span>),
    column('advice', 'Advice'),
    column('reason', 'Reason', 'Why the advice says so, and where the relic likely ends'),
  ];
})();

/**
 * The median landing level as a sentence: the chance of finishing there or
 * higher. A median that is the level the relic already has would read as a
 * certainty about nothing — every relic is sure to end at or above where it
 * stands — so that case says the relic is likely to stay put instead.
 */
function likelyEndText(row: RelicRow): string {
  const { level, chance } = row.advice.landing;
  if (level <= row.relic.level) return `Likely to stay at +${row.relic.level}`;
  return `${relicChancePercent(chance)} chance of +${level} or higher`;
}

/**
 * The rest of the landing distribution, for the title. A relic level is a whole
 * number in the game, so it is never printed as a mean or an expected gain —
 * only as a level, with its chance in percent.
 */
function likelyEndDetail(row: RelicRow): string {
  const { likeliest } = row.advice.landing;
  /* The next multiple of three rather than +15: that is where the unique
     property takes its big step, and +15 is a lottery whose odds say nothing. */
  const tier = relicNextTierLevel(row.relic.level);
  return `Likeliest single end: +${likeliest.level}, ${relicChancePercent(likeliest.chance)} chance. `
    + `Chance of reaching +${tier}: ${relicChancePercent(relicReachChance(row.relic.level, row.relic.durability, tier))}.`;
}

export function RelicList({ game, monsters, preferences, onOpenMonster, onChangeRelicSynergy }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
  onChangeRelicSynergy: (choices: RelicSynergyChoices) => void;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.relics', defaultRelicFilters, isRelicFilterState,
  );
  const { selectedFamilies, selectedMains, selectedBands, selectedVerdicts, selectedDurability,
    lowestLevel, highestLevel, showEngraved, showInventory, selectivity } = filters;

  const [editingSynergy, setEditingSynergy] = useState(false);
  const synergyOpener = useRef<HTMLButtonElement>(null);

  /* The one synergy table this page reads — the shipped cells with the user's
     own on top (`relic-synergy.ts`). The verdicts, the column and the filter all
     take it from here, so an edit in the table reaches each of them at once. */
  const synergy = useMemo(() => resolveRelicSynergy(preferences.relicSynergy), [preferences.relicSynergy]);
  const relics = game?.snapshot.relics ?? noRelicRecords;
  const engravings = useMemo(() => relicEngravingCounts(monsters), [monsters]);
  /* The counts reach the advice because a same-pair copy that has run out of
     places can no longer make a duplicate redundant (§8 rule 0's exception). */
  const advice = useMemo(
    () => relicAdvice(relics, selectivity, synergy, undefined, engravings),
    [relics, selectivity, synergy, engravings],
  );
  const format = useMemo(() => (value: number) => formatNumber(value, preferences.general), [preferences.general]);

  const rows = useMemo<RelicRow[]>(() => relics.map((relic, index) => ({
    relic,
    index,
    synergy: relicSynergy(synergy, relic.mainProperty, relic.unique.definition.id),
    /* Every relic in this list was judged together, so the map always holds it;
       the fallback exists because a `Map` lookup is optional, not because a
       relic could be missing. */
    advice: advice.get(relic.id) ?? {
      verdict: 'keep', reason: '', selfEvident: false, reachChance: 0, nextChance: 0, investmentScore: 0, expectedGain: 0,
      expectedLevel: relic.level,
      landing: { level: relic.level, chance: 1, likeliest: { level: relic.level, chance: 1 } },
      supersededBy: null, overtakeChance: null,
    },
    levelState: relicLevelState(relic),
    engraved: engravings.get(relic.id) ?? 0,
  })), [relics, synergy, advice, engravings]);

  const visible = useMemo(() => rows.filter((row) => {
    if (!filterPair(row.engraved > 0, showEngraved, showInventory)) return false;
    if (!filterIncludes(selectedFamilies,
      relicFamilyByGrant[row.relic.unique.definition.grants], familyNames)) return false;
    if (!filterIncludes(selectedMains, row.relic.mainProperty, relicMainPropertyOrder)) return false;
    if (!filterIncludes(selectedBands, row.synergy, relicSynergyBandOrder)) return false;
    if (!filterIncludes(selectedVerdicts, row.advice.verdict, relicVerdictOrder)) return false;
    if (!filterIncludes(selectedDurability, row.relic.durability, durabilityOptions)) return false;
    return row.relic.level >= lowestLevel && row.relic.level <= highestLevel;
  }), [rows, selectedFamilies, selectedMains, selectedBands, selectedVerdicts, selectedDurability,
    lowestLevel, highestLevel, showEngraved, showInventory]);

  /* The page exists to answer "which of these is worth anything", so it opens
     on that answer rather than on the order the export happens to list them in. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, relicColumns, { key: 'synergy', direction: 'descending' },
  );

  function toggleValue<T>(value: T, key: keyof RelicFilterState) {
    setFilters((current) => {
      const chosen = current[key] as T[];
      return {
        ...current,
        [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value],
      };
    });
  }

  const toggleGroup = <T extends string | number>(
    label: string, description: string, options: readonly T[], selected: readonly T[],
    key: keyof RelicFilterState, display: (option: T) => ReactNode, className: string,
    accessibleName?: (option: T) => string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {options.map((option) => <FilterButton
        key={option}
        active={selected.includes(option)}
        onClick={() => toggleValue(option, key)}
        aria-label={accessibleName?.(option)}
      >{display(option)}</FilterButton>)}
    </div>
  </div>;

  function closeSynergyEditor() {
    setEditingSynergy(false);
    synergyOpener.current?.focus();
  }

  const noRelics = <section className="empty-state">
    <h2>{game
      ? 'This import holds no relics JASWA can read.'
      : 'Nothing to show until a game file is imported.'}</h2>
    <p className="next-step">{game
      ? 'Report it from the rail if your account does have relics.'
      : 'Go to Home to connect the helper or import a game file.'}</p>
  </section>;

  /* Two questions, two menus. The library asks what a relic is worth to the
     account and answers keep, power up, or sell; the roster asks which relic
     each monster should have engraved. They share the relics and nothing else —
     different rows, different filters, different arithmetic — so they are
     separate disclosures rather than one table with a mode switch. */
  return <WorkspacePage
    header={<PageHeader
      title="Relic Optimization"
      tagline={"I'm only required to judge your relics. Silently judging your life choices "
        + 'at the same time is voluntary.'} />}
  >
    <Disclosure title="Power up/Keep/Sell" sessionKey="relics.library" defaultOpen>
      {!relics.length ? noRelics : <div className="relic-library">
      <DataTablePage
        filterClassName="relic-filter-strip"
        tableClassName="relic-grid"
        headerLabel="Relic library columns"
        tableLabel="Relic library"
        columnGroup={<TableColumnGroup columns={relicTableColumns} />}
        header={<SortableHeader columns={relicColumns} sort={sort} onToggle={toggle} />}
        filters={<>
          {toggleGroup('Family', 'Filter by relic family', familyNames, selectedFamilies,
            'selectedFamilies', (family) => family, 'relic-filter-family')}
          {toggleGroup('Main stat', 'Filter by main stat', relicMainPropertyOrder, selectedMains,
            'selectedMains', (main) => main, 'relic-filter-main')}
          {toggleGroup('Synergy', 'Filter by synergy', relicSynergyBandOrder, selectedBands,
            'selectedBands', (band) => <RelicSynergyFilterMark band={band} />, 'relic-filter-synergy',
            (band) => relicSynergyBandLabels[band])}
          {toggleGroup('Advice', 'Filter by advice', relicVerdictOrder, selectedVerdicts,
            'selectedVerdicts', (verdict) => relicVerdictLabels[verdict], 'relic-filter-advice')}
          <div className="filter-group relic-filter-threshold" role="group" aria-label="Power-up threshold">
            <span className="filter-label">Power-up threshold</span>
            <div className="filter-group-controls">
              <ValueSlider minimum={1} maximum={5} value={selectivity}
                label="Power-up threshold, very restrictive to naive"
                valueLabel={(value) => relicInvestmentSelectivityLabels[value as RelicInvestmentSelectivity]}
                valueAbove
                valueText={(value) => `${relicInvestmentSelectivityLabels[value as RelicInvestmentSelectivity]}; `
                  + `${relicSynergyBandLabels[relicMinimumSynergyBands[value as RelicInvestmentSelectivity]]} synergy or better`}
                onChange={(value) => setFilters((current) => ({
                  ...current, selectivity: isRelicInvestmentSelectivity(value) ? value : current.selectivity,
                }))} />
            </div>
          </div>
          <div className="filter-group relic-filter-level" role="group" aria-label="Filter by power-up level">
            <span className="filter-label">Level</span>
            <div className="filter-group-controls">
              <RangeSlider minimum={0} maximum={relicMaximumLevel}
                lowerValue={lowestLevel} upperValue={highestLevel}
                label="Power-up level range"
                lowerLabel="Lowest power-up level" upperLabel="Highest power-up level"
                valueText={(value, end) => `${end === 'lower' ? 'Lowest' : 'Highest'} level +${value}`}
                onChange={(lower, upper) => setFilters((current) => ({
                  ...current, lowestLevel: lower, highestLevel: upper,
                }))} />
            </div>
          </div>
          {toggleGroup('Durability', 'Filter by durability left', durabilityOptions, selectedDurability,
            'selectedDurability', (value) => String(value), 'relic-filter-durability')}
          {/* Engraved is a yes-or-no question about a relic, asked like the
              groups beside it: the heading names it, the chips answer it. */}
          <div className="filter-group relic-filter-usage" role="group" aria-label="Filter by engraved">
            <span className="filter-label">Engraved</span>
            <div className="filter-group-controls">
              <FilterButton active={showEngraved}
                onClick={() => setFilters((current) => ({ ...current, showEngraved: !current.showEngraved }))}
              >Yes</FilterButton>
              <FilterButton active={showInventory}
                onClick={() => setFilters((current) => ({ ...current, showInventory: !current.showInventory }))}
              >No</FilterButton>
            </div>
          </div>
          <FilterSummary visible={visible.length} total={rows.length} noun="relics"
            onReset={() => setFilters(defaultRelicFilters)} className="relic-filter-status"
            below={<button ref={synergyOpener} type="button" className="filter-reset relic-synergy-map"
              aria-haspopup="dialog" onClick={() => setEditingSynergy(true)}>Synergy map</button>} />
        </>}
      >
        <tbody>
          {sorted.length ? sorted.map((row) => {
            return <tr key={row.relic.id}>
              <td className={relicCell('unique')}>
                <span className="relic-property">{relicPropertyLabel(row.relic.unique.definition)}</span>
                <span className="relic-effect">{relicEffectText(row.relic, format)}</span>
              </td>
              {/* Named, never quantified — the same rule an artifact's main
                  stat follows (`AGENTS.md` §5). How much it grants is fixed by
                  the level, which the column beside it already states, so the
                  number here only costs width. */}
              <td className={relicCell('main', 'relic-main')}>{row.relic.mainProperty}</td>
              <td className={relicCell('synergy')}>
                <RelicSynergyMark band={row.synergy} />
              </td>
              <td className={relicCell('level', 'relic-level', row.levelState !== 'open' && 'dim')}>
                <span className="relic-level-value">+{format(row.relic.level)}</span>
                <RelicLevelMark state={row.levelState} />
              </td>
              <td className={relicCell('durability')}>
                <RelicDurabilityMark durability={row.relic.durability} />
              </td>
              <td className={relicCell('engraved', row.engraved === 0 && 'muted')}>
                {row.engraved === 0 ? '—' : format(row.engraved)}
              </td>
              <td className={relicCell('advice')}>
                <span className="relic-verdict" data-verdict={row.advice.verdict}>
                  {relicVerdictLabels[row.advice.verdict]}
                </span>
              </td>
              {/* A verdict without its explanation asks the user to take the
                  page on trust. The reason line is reserved in every row, so a
                  threshold move that rewrites it moves nothing. Under it, the
                  median of the landing distribution with the size of its own
                  tail — a median is a statement about a tail, and the tail is
                  never exactly a half. Whether that line is there follows the
                  relic alone, never a control on the page. A Trash relic being
                  sold keeps the line's box but draws nothing in it: the slider
                  can move it in and out of the sale, and the row must not
                  change height when it does. */}
              <td className={relicCell('reason')}
                title={relicHasLikelyEnd(row.levelState) && !row.advice.selfEvident ? likelyEndDetail(row) : undefined}>
                <span className="relic-advice-reason">{row.advice.reason}</span>
                {relicHasLikelyEnd(row.levelState) && <span className="relic-landing">
                  {row.advice.selfEvident ? null : likelyEndText(row)}
                </span>}
              </td>
            </tr>;
          }) : <tr>
            <td className="table-empty-state" colSpan={relicTableColumns.length}>
              No relics match these filters. Clear a filter to see more.
            </td>
          </tr>}
        </tbody>
      </DataTablePage>
      </div>}
    </Disclosure>

    {editingSynergy && <RelicSynergyOverlay synergy={synergy} onSave={onChangeRelicSynergy} onClose={closeSynergyEditor} />}

    <Disclosure title="Use for mons" sessionKey="relics.monsters" deferContent>
      {!relics.length ? noRelics
        : <Suspense fallback={<p className="lead">Reading your monsters’ builds…</p>}>
          <RelicMonsterList relics={relics} monsters={monsters} preferences={preferences} onOpenMonster={onOpenMonster} />
        </Suspense>}
    </Disclosure>
  </WorkspacePage>;
}
