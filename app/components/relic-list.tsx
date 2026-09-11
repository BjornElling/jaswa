import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from './page-chrome';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { SortableHeader, useSortedRows } from './sortable-table';
import type { SortableColumn } from './sortable-table';
import { ValueSlider, RangeSlider } from './range-slider';
import { RelicDurabilityMark, RelicLevelMark, RelicSynergyFilterMark, RelicSynergyMark } from './relic-marks';
import { WorkspacePage } from './workspace-page';
import { alignmentClass, relicTableColumns } from '../lib/table-layouts';
import type { GameRecord } from '../lib/game-data';
import type { ImportedGame, Preferences } from '../lib/types';
import { readRelics, relicEngravingCounts, relicPowerUpStoneCount } from '../lib/relics';
import {
  relicMainPropertyOrder, relicMaximumDurability, relicMaximumLevel, relicPropertyLabel,
} from '../lib/relic-properties';
import type { RelicMainProperty } from '../lib/relic-properties';
import { relicSynergy, relicSynergyBandLabels, relicSynergyBandOrder } from '../lib/relic-synergy';
import type { RelicSynergyBand } from '../lib/relic-synergy';
import {
  isRelicInvestmentSelectivity, relicAdvice, relicInvestmentThresholds, relicVerdictLabels, relicVerdictOrder,
  relicMinimumSynergyBands,
} from '../lib/relic-advice';
import type { RelicInvestmentSelectivity, RelicVerdict } from '../lib/relic-advice';
import {
  compareRelicRows, defaultRelicSortDirections, relicEffectText, relicLevelState, relicSearchText,
} from '../lib/relic-grid';
import type { RelicRow, RelicSortKey } from '../lib/relic-grid';
import { formatNumber } from '../lib/formatting';
import { useSessionStorageState } from '../lib/session-storage-state';

const durabilityOptions = Array.from({ length: relicMaximumDurability + 1 }, (_, value) => value);

type RelicFilterState = {
  search: string;
  selectedMains: RelicMainProperty[];
  selectedBands: RelicSynergyBand[];
  selectedVerdicts: RelicVerdict[];
  selectedDurability: number[];
  lowestLevel: number;
  highestLevel: number;
  showEngraved: boolean;
  showUnused: boolean;
  /**
   * How much the user is willing to gamble on a power-up. It sits with the
   * filters because it belongs to the same question the filters answer — what
   * this table should be telling me — even though it changes the verdicts
   * rather than which rows survive.
   */
  selectivity: RelicInvestmentSelectivity;
};

const defaultRelicFilters: RelicFilterState = {
  search: '',
  selectedMains: [],
  selectedBands: [],
  selectedVerdicts: [],
  selectedDurability: [],
  lowestLevel: 0,
  highestLevel: relicMaximumLevel,
  showEngraved: true,
  showUnused: true,
  selectivity: 3,
};

function isRelicFilterState(value: unknown): value is RelicFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const level = (entry: unknown) => typeof entry === 'number' && Number.isInteger(entry)
    && entry >= 0 && entry <= relicMaximumLevel;
  return typeof candidate.search === 'string'
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
    && typeof candidate.showUnused === 'boolean'
    && isRelicInvestmentSelectivity(candidate.selectivity);
}

function relicCell(key: string, ...extra: Array<string | false | undefined>): string {
  const align = relicTableColumns.find((column) => column.key === key)?.align;
  return [alignmentClass(align), ...extra].filter(Boolean).join(' ');
}

const relicColumns: readonly SortableColumn<RelicRow>[] = (() => {
  const column = (key: RelicSortKey, label: SortableColumn<RelicRow>['label'], accessibleLabel?: string) => ({
    key,
    label,
    accessibleLabel,
    align: relicTableColumns.find((entry) => entry.key === key)?.align,
    initialDirection: defaultRelicSortDirections[key] ? 'ascending' as const : 'descending' as const,
    compare: (left: RelicRow, right: RelicRow) => compareRelicRows(left, right, key) || left.index - right.index,
  });
  return [
    column('unique', 'Unique property'),
    column('main', 'Main'),
    column('synergy', 'Synergy'),
    column('level', 'Level'),
    column('durability', 'Durability'),
    column('landing', <span className="table-heading-two-line" aria-label="Level it lands on or above half the time">Likely<br />end</span>),
    column('engraved', <span className="table-heading-two-line" aria-label="Monsters it is engraved on">Engraved<br />on #</span>),
    column('advice', 'Advice'),
  ];
})();

export function RelicList({ game, monsters, preferences }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.relics', defaultRelicFilters, isRelicFilterState,
  );
  const { search, selectedMains, selectedBands, selectedVerdicts, selectedDurability,
    lowestLevel, highestLevel, showEngraved, showUnused, selectivity } = filters;

  const relics = useMemo(() => readRelics(game?.data), [game]);
  const engravings = useMemo(() => relicEngravingCounts(monsters), [monsters]);
  const powerUpStones = useMemo(() => relicPowerUpStoneCount(game?.data), [game]);
  const advice = useMemo(() => relicAdvice(relics, selectivity), [relics, selectivity]);
  const format = useMemo(() => (value: number) => formatNumber(value, preferences.general), [preferences.general]);

  const rows = useMemo<RelicRow[]>(() => relics.map((relic, index) => ({
    relic,
    index,
    synergy: relicSynergy(relic.mainProperty, relic.unique.definition.id),
    /* Every relic in this list was judged together, so the map always holds it;
       the fallback exists because a `Map` lookup is optional, not because a
       relic could be missing. */
    advice: advice.get(relic.id) ?? {
      verdict: 'keep', reason: '', reachChance: 0, nextChance: 0, investmentScore: 0, expectedGain: 0,
      expectedLevel: relic.level,
      landing: { level: relic.level, chance: 1, likeliest: { level: relic.level, chance: 1 } },
      supersededBy: null, overtakeChance: null,
    },
    levelState: relicLevelState(relic),
    engraved: engravings.get(relic.id) ?? 0,
  })), [relics, advice, engravings]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showEngraved && row.engraved > 0) return false;
      if (!showUnused && row.engraved === 0) return false;
      if (selectedMains.length && !selectedMains.includes(row.relic.mainProperty)) return false;
      if (selectedBands.length && !selectedBands.includes(row.synergy)) return false;
      if (selectedVerdicts.length && !selectedVerdicts.includes(row.advice.verdict)) return false;
      if (selectedDurability.length && !selectedDurability.includes(row.relic.durability)) return false;
      if (row.relic.level < lowestLevel || row.relic.level > highestLevel) return false;
      if (!term) return true;
      return relicSearchText(row, format).includes(term);
    });
  }, [rows, search, selectedMains, selectedBands, selectedVerdicts, selectedDurability,
    lowestLevel, highestLevel, showEngraved, showUnused, format]);

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
      {options.map((option) => <button
        key={option}
        type="button"
        className={selected.includes(option) ? 'filter-button active' : 'filter-button'}
        onClick={() => toggleValue(option, key)}
        aria-pressed={selected.includes(option)} aria-label={accessibleName?.(option)}
      >{display(option)}</button>)}
    </div>
  </div>;

  return <WorkspacePage
    header={<PageHeader
      title="Relics"
      tagline="One relic rides a hundred monsters. Picking the wrong one is a hundred small regrets." />}
  >
    {!relics.length ? <section className="empty-state">
      <h2>{game
        ? 'This import holds no relics JASWA can read.'
        : 'Nothing to show until a game file is imported.'}</h2>
      <p className="next-step">{game
        ? 'Report it from the rail if your account does have relics.'
        : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
    </section> : <div className="relic-library">
      <DataTablePage
        filterClassName="relic-filter-strip"
        tableClassName="relic-grid"
        headerLabel="Relic library columns"
        tableLabel="Relic library"
        columnGroup={<TableColumnGroup columns={relicTableColumns} />}
        header={<SortableHeader columns={relicColumns} sort={sort} onToggle={toggle} />}
        filters={<>
          <div className="filter-group relic-filter-search">
            <span className="filter-label">Search</span>
            <div className="filter-group-controls">
              <div className="search-field">
                <span aria-hidden="true">⌕</span>
                <input value={search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Filter relics" aria-label="Filter relics by property, main stat or advice" />
                <button className="filter-button"
                  onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                  hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
              </div>
            </div>
          </div>
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
                label="Power-up threshold, 1 cautious to 5 bold"
                valueText={(value) => `${relicInvestmentThresholds[value as RelicInvestmentSelectivity]}% threshold; `
                  + `${relicMinimumSynergyBands[value as RelicInvestmentSelectivity]} or better`}
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
          <div className="filter-group relic-filter-usage" role="group" aria-label="Choose which relics to include">
            <span className="filter-label">Use</span>
            <div className="filter-group-controls">
              <button type="button" className={showEngraved ? 'filter-button active' : 'filter-button'}
                onClick={() => setFilters((current) => ({ ...current, showEngraved: !current.showEngraved }))}
                aria-pressed={showEngraved}>Engraved</button>
              <button type="button" className={showUnused ? 'filter-button active' : 'filter-button'}
                onClick={() => setFilters((current) => ({ ...current, showUnused: !current.showUnused }))}
                aria-pressed={showUnused}>Unused</button>
            </div>
          </div>
          <FilterSummary visible={visible.length} total={rows.length} noun="relics"
            onReset={() => setFilters(defaultRelicFilters)} className="relic-filter-status"
            below={<aside className="relic-stone-balance"
              aria-label={powerUpStones === undefined
                ? 'Relic Power-up stones unavailable from this import'
                : `Relic Power-up stones: ${format(powerUpStones)}`}>
              <span className="relic-stone-balance-label">Power-up stones</span>
              <span className="relic-stone-balance-value">{powerUpStones === undefined ? '—' : format(powerUpStones)}</span>
            </aside>} />
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
              {/* The median of the landing distribution, with the size of its
                  own tail under it: a median is a statement about a tail, and
                  the tail is never exactly a half. The readings the verdict is
                  actually made of travel in the title rather than in columns of
                  their own — the advice cell prints the relevant chance. */}
              <td className={relicCell('landing')}
                title={`Expected to gain +${row.advice.expectedGain.toFixed(1)} more; `
                  + `likeliest single outcome +${row.advice.landing.likeliest.level} at `
                  + `${Math.round(row.advice.landing.likeliest.chance * 100)} %; `
                  + `mean +${row.advice.expectedLevel.toFixed(1)}; `
                  + `next-attempt score ${Math.round(row.advice.investmentScore)} %`}>
                <span className="relic-landing-level">+{format(row.advice.landing.level)}</span>
                <span className="relic-landing-chance">
                  <span className="visually-hidden">at least </span>
                  &ge;&thinsp;{format(Math.round(row.advice.landing.chance * 100))} %
                </span>
              </td>
              <td className={relicCell('engraved', row.engraved === 0 && 'muted')}>
                {row.engraved === 0 ? '—' : format(row.engraved)}
              </td>
              {/* A verdict without its one-line explanation asks the user to
                  take the page on trust. Every row reserves the same second
                  line, so changing the threshold does not move its neighbours. */}
              <td className={relicCell('advice')}>
                <span className="relic-verdict" data-verdict={row.advice.verdict}>
                  {relicVerdictLabels[row.advice.verdict]}
                </span>
                <span className="relic-advice-reason">{row.advice.reason}</span>
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
  </WorkspacePage>;
}
