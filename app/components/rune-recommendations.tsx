import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AncientName } from './ancient-mark';
import { CalculationStatus } from './calculation-status';
import { Dropdown } from './dropdown';
import { Button, FilterButton } from './button';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { QualityRule, qualityRuleHost } from './quality-rule';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { RangeSlider } from './range-slider';
import { TokenChoiceField } from './token-choice-field';
import { alignmentClass, runeCleanupTableColumns } from '../lib/table-layouts';
import { formatNumber } from '../lib/formatting';
import { readRunes, runeMaximumLevel, runeStatName } from '../lib/runes';
import { monsterCopyNames } from '../lib/monster-names';
import type { MonsterPreferences } from '../lib/monster-preferences';
import { runeVerdictLabels, runeVerdictOrder } from '../lib/rune-cleanup-advice';
import type { RuneVerdict } from '../lib/rune-cleanup-advice';
import { calculateRuneAdvice, cancelRuneAdvice } from '../lib/compute/rune-advice-client';
import type { CalculationBackend } from '../lib/compute/calculation-summary';
import { noReferenceLineMessage, referenceLines } from '../lib/rune-reference-stats';
import {
  compareRuneCleanupRows, compareRuneGameSort, defaultRuneCleanupSortDirections,
  runeChanceShown, runeChanceText, runeCleanupSearchText, runeGameSortKeys, runeGameSortLabels,
  runeMaxValueShown,
} from '../lib/rune-cleanup-grid';
import type { RuneCleanupRow, RuneCleanupSortKey, RuneGameSortKey } from '../lib/rune-cleanup-grid';
import type { RuneDefaultGrade } from '../lib/runes';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import type { GameRecord } from '../lib/game-data';
import type { GeneralSettings, ImportedGame, RunePotentialSettings } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';
import { RuneLink } from './rune-link';
import type { OpenRuneOverlay } from './rune-link';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';

/* Nine of the game's own set names, and the slots and levels a rune can have.
   Listed rather than derived from the import so the filter strip does not change
   shape when a different account is loaded. */
const slotOptions = [1, 2, 3, 4, 5, 6];
const starOptions = [1, 2, 3, 4, 5, 6];
/* The requested quality filter deliberately leaves Magic out of its short row;
   when no quality is chosen, Magic runes remain included with every other rune. */
const qualityOptions: readonly RuneDefaultGrade[] = ['Normal', 'Rare', 'Hero', 'Legend'];

function StarIcon() {
  return <svg className="rune-star-icon" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.6 9.9 5.5l4.3.6-3.1 3  .8 4.3L8 11.4l-3.9 2 .8-4.3-3.1-3 4.3-.6L8 1.6Z" />
  </svg>;
}

type RuneFilterState = {
  search: string;
  selectedSets: string[];
  selectedSlots: number[];
  selectedVerdicts: RuneVerdict[];
  selectedPresets: string[];
  selectedMains: number[];
  selectedStars: number[];
  selectedQualities: RuneDefaultGrade[];
  lowestLevel: number;
  highestLevel: number;
  selectedPlaces: RunePlace[];
  showOnlyAncient: boolean;
  /** One of the game's own orderings, or `null` while a column heading orders. */
  gameSort: RuneGameSortKey | null;
};

/* Where a rune sits, chosen like every other value on the strip: none chosen and
   both chosen alike show every rune, and only one of the two narrows. */
const placeOptions = ['equipped', 'inventory'] as const;
type RunePlace = typeof placeOptions[number];
const placeLabels: Readonly<Record<RunePlace, string>> = { equipped: 'Equipped', inventory: 'Inventory' };

/* The table opens in the game's own Obtained order, newest first, so it reads
   like the box the player just left in Summoners War. */
const defaultRuneFilters: RuneFilterState = {
  search: '', selectedSets: [], selectedSlots: [], selectedVerdicts: [], selectedPresets: [],
  selectedMains: [], selectedStars: [], selectedQualities: [], lowestLevel: 0,
  highestLevel: runeMaximumLevel, selectedPlaces: [],
  showOnlyAncient: false, gameSort: 'gameObtained',
};

function isRuneFilterState(value: unknown): value is RuneFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const level = (entry: unknown) => typeof entry === 'number' && Number.isInteger(entry)
    && entry >= 0 && entry <= runeMaximumLevel;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedSets) && candidate.selectedSets.every((e) => typeof e === 'string')
    && Array.isArray(candidate.selectedSlots) && candidate.selectedSlots.every((e) => slotOptions.includes(e as number))
    && Array.isArray(candidate.selectedVerdicts)
    && candidate.selectedVerdicts.every((e) => runeVerdictOrder.includes(e as RuneVerdict))
    && Array.isArray(candidate.selectedPresets) && candidate.selectedPresets.every((e) => typeof e === 'string')
    && Array.isArray(candidate.selectedMains) && candidate.selectedMains.every((e) => typeof e === 'number')
    && Array.isArray(candidate.selectedStars) && candidate.selectedStars.every((e) => starOptions.includes(e as number))
    && Array.isArray(candidate.selectedQualities)
    && candidate.selectedQualities.every((e) => qualityOptions.includes(e as RuneDefaultGrade))
    && level(candidate.lowestLevel) && level(candidate.highestLevel)
    && (candidate.lowestLevel as number) <= (candidate.highestLevel as number)
    && Array.isArray(candidate.selectedPlaces)
    && candidate.selectedPlaces.every((e) => placeOptions.includes(e as RunePlace))
    && typeof candidate.showOnlyAncient === 'boolean'
    /* `null` is "a column heading is ordering", which is a stated value here and
       not an absent one, so it is accepted and anything else is rejected. */
    && (candidate.gameSort === null
      || runeGameSortKeys.includes(candidate.gameSort as RuneGameSortKey));
}

function cell(key: string, ...extra: Array<string | false | undefined>): string {
  const align = runeCleanupTableColumns.find((column) => column.key === key)?.align;
  return [alignmentClass(align), ...extra].filter(Boolean).join(' ');
}

const columns: readonly SortableColumn<RuneCleanupRow>[] = (() => {
  const column = (key: RuneCleanupSortKey, label: SortableColumn<RuneCleanupRow>['label'], accessibleLabel?: string) => ({
    key,
    label,
    accessibleLabel,
    align: runeCleanupTableColumns.find((entry) => entry.key === key)?.align,
    initialDirection: defaultRuneCleanupSortDirections[key] ? 'ascending' as const : 'descending' as const,
    compare: (left: RuneCleanupRow, right: RuneCleanupRow) =>
      compareRuneCleanupRows(left, right, key) || left.index - right.index,
    /* A dash is not a figure, so it sorts after every figure either way round. */
    absent: key === 'maxValue' ? (row: RuneCleanupRow) => !runeMaxValueShown(row)
      : key === 'chance' ? (row: RuneCleanupRow) => !runeChanceShown(row) : undefined,
  });
  return [
    column('set', 'Set'),
    column('slot', 'Slot'),
    column('level', 'Lv.'),
    column('main', 'Main'),
    column('innate', 'Innate'),
    column('subs', 'Sub properties'),
    column('location', 'Location'),
    column('preset', 'Best preset'),
    column('maxValue', <span className="table-heading-two-line" aria-label="Max value: the best end state it can reach against a perfect ordinary rune for that slot. An Ancient rune can exceed 100 per cent. The quality floor you set is a share of the ordinary runes a slot produces, so the Max value it comes to differs from slot to slot">Max<br />value</span>),
    column('chance', <span className="table-heading-two-line" aria-label="Chance to reach the final +15 quality floor; random substat rolls end at +12">Chance</span>),
    column('advice', 'Advice'),
    /* The game's own three orderings, driven by the Sort by dropdown. They carry
       `header: false` for the reason `artifact-list.tsx` does: they stay in this
       one list so the table has a single sort state, no heading claims to be the
       sorted one while one of them is active, and a click on any heading hands
       ordering straight back to the table. */
    ...runeGameSortKeys.map((key) => ({
      key,
      label: runeGameSortLabels[key],
      header: false as const,
      compare: (left: RuneCleanupRow, right: RuneCleanupRow) =>
        compareRuneGameSort(left, right, key) || left.index - right.index,
    })),
  ];
})();

/**
 * The verdict table — the answer the whole workspace exists to give.
 *
 * It is the answer the user came for; the Rune Set-up workspace holds the
 * controls that shape it. The calculation waits for the button rather than
 * running as sliders move: it reads every rune against every preset and every
 * build, and a table that re-ran itself under a dragging thumb would be a table
 * nobody could read.
 */
export function RuneRecommendations({ game, monsterPreferences, settings, presets, general, hardwareAcceleration, onOpenRune }: {
  game: ImportedGame | null;
  monsterPreferences: MonsterPreferences;
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
  general: GeneralSettings;
  /** Whether the graphics card may count the odds. The worker is told, not asked. */
  hardwareAcceleration: boolean;
  onOpenRune: OpenRuneOverlay;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.rune-cleanup', defaultRuneFilters, isRuneFilterState,
  );
  const { search, selectedSets, selectedSlots, selectedVerdicts, selectedPresets, selectedMains,
    selectedStars, selectedQualities, lowestLevel, highestLevel, selectedPlaces,
    showOnlyAncient, gameSort } = filters;

  /* The held result, and the settings it answers. A result is kept until the user
     asks for another one, so a slider moved after a calculation leaves the table
     standing and says it is out of date rather than silently changing under them. */
  const [result, setResult] = useState<{
    rows: RuneCleanupRow[];
    at: string;
    durationMs: number;
    backend: CalculationBackend;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /* A failed calculation says so and leaves the previous table standing. Clearing
     it would read as "no runes qualify", which is a different and wrong answer. */
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * Every rune the import holds, and the population every calculation judges.
   *
   * Every imported rune is judged independently. Equipped runes and runes at +15
   * are judged like any other; whether they are *on screen* is the filter strip's
   * business, and a filter cannot move a single figure.
   */
  const runes = useMemo(() => readRunes(game?.data), [game]);

  /* The same names the rest of the workspace uses, numbered where the roster holds
     more than one of a species, so a Location cell identifies the copy the rune is
     actually on rather than a species the account owns four of. */
  const monsterNames = useMemo(() => {
    const units = game?.data?.unit_list;
    return monsterCopyNames(Array.isArray(units) ? units as GameRecord[] : [], monsterPreferences);
  }, [game, monsterPreferences]);

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

  /* Leaving the page mid-calculation gives the processor back rather than
     finishing into a void. */
  useEffect(() => cancelRuneAdvice, []);

  async function calculate() {
    if (!base) return;
    setBusy(true);
    setFailure(null);
    const outcome = await calculateRuneAdvice({ runes, presets, settings, base, preferWebGpu: hardwareAcceleration });
    /* A newer request has taken over the busy state and the table, so this one
       returns without touching either. */
    if (outcome.status === 'superseded') return;
    setBusy(false);
    if (outcome.status === 'failed') { setFailure(outcome.message); return; }
    const { advice } = outcome;
    setResult({
      rows: runes.map((rune, index) => ({
        rune,
        index,
        advice: advice.get(rune.id) ?? {
          verdict: 'sell', reason: '', maxValue: 0, standing: 0, floorShare: 0, chance: 0, preset: null, rank: 'broken',
          craftedLines: null,
        },
        location: rune.occupiedId === null ? 'Inventory' : monsterNames[rune.occupiedId]?.name ?? null,
      })),
      at: new Date().toISOString(),
      durationMs: outcome.durationMs,
      backend: outcome.backend,
    });
  }

  const rows = useMemo(() => result?.rows ?? [], [result]);
  /* Offered from the account's own runes, so a filter never names a set or a main
     stat that no row can carry. */
  const setOptions = useMemo(
    () => [...new Set(runes.map((rune) => rune.setName))].sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name })),
    [runes],
  );
  const mainOptions = useMemo(
    () => [...new Set(runes.map((rune) => rune.mainStatId))].sort((a, b) => a - b)
      .map((statId) => ({ value: statId, label: runeStatName(statId) ?? '?' })),
    [runes],
  );
  const presetOptions = useMemo(
    () => presets.map((preset) => ({ value: preset.name, label: preset.name })),
    [presets],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedPlaces.length === 1
        && selectedPlaces[0] !== (row.rune.occupiedId === null ? 'inventory' : 'equipped')) return false;
      if (showOnlyAncient && !row.rune.ancient) return false;
      if (selectedSets.length && !selectedSets.includes(row.rune.setName)) return false;
      if (selectedSlots.length && !selectedSlots.includes(row.rune.slot)) return false;
      if (selectedStars.length && !selectedStars.includes(row.rune.stars)) return false;
      if (selectedQualities.length && !selectedQualities.includes(row.rune.defaultGrade)) return false;
      if (selectedVerdicts.length && !selectedVerdicts.includes(row.advice.verdict)) return false;
      if (selectedPresets.length && !selectedPresets.includes(row.advice.preset?.name ?? '')) return false;
      if (selectedMains.length && !selectedMains.includes(row.rune.mainStatId)) return false;
      if (row.rune.level < lowestLevel || row.rune.level > highestLevel) return false;
      if (!term) return true;
      return runeCleanupSearchText(row).includes(term);
    });
  }, [rows, search, selectedSets, selectedSlots, selectedStars, selectedQualities, selectedVerdicts,
    selectedPresets, selectedMains, lowestLevel, highestLevel, selectedPlaces, showOnlyAncient]);

  const { sorted, sort, toggle: toggleColumn, setSort } = useSortedRows(
    visible, columns, gameSort === null
      ? { key: 'maxValue', direction: 'descending' }
      : { key: gameSort, direction: 'ascending' },
  );

  /* Choosing one of the game's orderings takes the table over; clicking any
     column heading hands ordering back and clears the dropdown. One sort state
     throughout, so the two controls can never both claim to be ordering the
     rows.
     The direction is always `ascending` because each game ordering already
     states its own direction, in the sign of its sort key — the game offers one
     arrangement per option, not a pair to toggle between, so reversing it here
     would invent an order the panel does not have. */
  const sortingByGame = runeGameSortKeys.includes(sort.key as RuneGameSortKey);
  useEffect(() => {
    if (gameSort !== null) setSort({ key: gameSort, direction: 'ascending' });
    else if (sortingByGame) setSort({ key: 'maxValue', direction: 'descending' });
  }, [gameSort, setSort, sortingByGame]);

  function toggle(key: string) {
    setFilters((current) => ({ ...current, gameSort: null }));
    toggleColumn(key);
  }

  function toggleValue<T>(value: T, key: keyof RuneFilterState) {
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
    key: keyof RuneFilterState, display: (option: T) => ReactNode, className: string,
    accessibleName?: (option: T) => string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {options.map((option) => <FilterButton
        key={option}
        active={selected.includes(option)}
        aria-label={accessibleName?.(option)}
        onClick={() => toggleValue(option, key)}
      >{display(option)}</FilterButton>)}
    </div>
  </div>;

  if (!game) {
    return <section className="empty-state">
      <h2>Nothing to judge until a game file is imported.</h2>
      <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
    </section>;
  }
  if (!runes.length) {
    return <section className="empty-state">
      <h2>This import holds no runes JASWA can read.</h2>
      <p className="next-step">Report it from the rail if your account does have runes.</p>
    </section>;
  }
  if (!base) {
    return <section className="empty-state">
      <h2>No monster has reached level {40}.</h2>
      <p className="next-step">{noReferenceLineMessage}</p>
    </section>;
  }
  if (!presets.length) {
    return <section className="empty-state">
      <h2>There are no presets to judge runes against.</h2>
      <p className="next-step">Add one under Rune Set-up to say what a rune should be worth.</p>
    </section>;
  }

  return <div className="stack">
    <div className="list-actions">
      <p className="list-count">
        {result
          ? <><b>{visible.length.toLocaleString('en')}</b> of {rows.length.toLocaleString('en')} runes</>
          : <><b>{runes.length.toLocaleString('en')}</b> runes ready to judge</>}
      </p>
      <Button tone="primary" onClick={calculate} disabled={busy} busyLabel="Calculating">
        {result ? 'Recalculate' : 'Calculate'}
      </Button>
    </div>

    {!result
      ? <section className="empty-state">
        <h2>Nothing calculated yet.</h2>
        <p className="next-step">
          Press Calculate to put every rune on trial.<br />
          The standards they are judged by live in Rune Set-up.
        </p>
      </section>
      : <DataTablePage
        filterClassName="rune-filter-strip"
        tableClassName="rune-cleanup-grid"
        headerLabel="Rune verdict columns"
        tableLabel="Rune verdicts"
        columnGroup={<TableColumnGroup columns={runeCleanupTableColumns} />}
        header={<SortableHeader columns={columns} sort={sort} onToggle={toggle} />}
        filters={<>
          <div className="filter-group rune-filter-search">
            <span className="filter-label">Search</span>
            <div className="filter-group-controls">
              <div className="search-field">
                <span aria-hidden="true">⌕</span>
                <input value={search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Filter runes" aria-label="Filter runes by set, stat, preset or advice" />
                <FilterButton
                  onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                  hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
              </div>
            </div>
          </div>
          {/* Ordering, not filtering: it reproduces the game's own Sort by, so a
              box just arranged in Summoners War can be arranged the same way
              here and the two lists compared row for row. */}
          <div className="filter-group rune-filter-sort-by" role="group" aria-label="Sort runes the way the game does">
            <label className="filter-label" htmlFor="rune-sort-by">Sort by</label>
            <div className="filter-group-controls">
              <Dropdown id="rune-sort-by"
                value={gameSort ?? ''}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  gameSort: runeGameSortKeys.includes(event.target.value as RuneGameSortKey)
                    ? event.target.value as RuneGameSortKey
                    : null,
                }))}
                placeholder="Not sorted">
                {runeGameSortKeys.map((key) => <option key={key} value={key}>
                  {runeGameSortLabels[key]}
                </option>)}
              </Dropdown>
            </div>
          </div>
          {toggleGroup('Advice', 'Filter by advice', runeVerdictOrder, selectedVerdicts,
            'selectedVerdicts', (verdict) => runeVerdictLabels[verdict], 'rune-filter-advice')}
          <div className="filter-group rune-filter-ancient" role="group" aria-label="Show only Ancient runes">
            <span className="filter-label">Show only</span>
            <div className="filter-group-controls">
              <FilterButton active={showOnlyAncient}
                onClick={() => setFilters((current) => ({ ...current, showOnlyAncient: !current.showOnlyAncient }))}
              >Ancient</FilterButton>
            </div>
          </div>
            {toggleGroup('Stars', 'Filter by star count', starOptions, selectedStars,
              'selectedStars', (stars) => <span className="rune-star-choice" aria-hidden="true">
                <span className="rune-star-count">{stars}</span><StarIcon />
              </span>, 'rune-filter-stars', (stars) => `${stars} star${stars === 1 ? '' : 's'}`)}
          {toggleGroup('Quality', 'Filter by rune quality', qualityOptions, selectedQualities,
            'selectedQualities', (quality) => quality, 'rune-filter-quality')}
          {toggleGroup('Slot', 'Filter by slot', slotOptions, selectedSlots,
            'selectedSlots', (slot) => String(slot), 'rune-filter-slot')}
          {/* Three long vocabularies — twenty-two sets, a dozen main properties, a
              preset list that grows with use — each answered on one line rather
              than spelled out in full across the strip. */}
          <TokenChoiceField label="Set" description="Filter by rune set" empty="Any set"
            className="rune-filter-set" options={setOptions} chosen={selectedSets}
            onChange={(next) => setFilters((current) => ({ ...current, selectedSets: next }))} />
          <TokenChoiceField label="Main" description="Filter by main property" empty="Any main"
            className="rune-filter-main" options={mainOptions} chosen={selectedMains}
            onChange={(next) => setFilters((current) => ({ ...current, selectedMains: next }))} />
          <TokenChoiceField label="Preset" description="Filter by best-matching preset" empty="Any preset"
            className="rune-filter-preset" options={presetOptions} chosen={selectedPresets}
            onChange={(next) => setFilters((current) => ({ ...current, selectedPresets: next }))} />
          <div className="filter-group rune-filter-level" role="group" aria-label="Filter by power-up level">
            <span className="filter-label">Level</span>
            <div className="filter-group-controls">
              <RangeSlider minimum={0} maximum={runeMaximumLevel}
                lowerValue={lowestLevel} upperValue={highestLevel}
                label="Power-up level range"
                lowerLabel="Lowest power-up level" upperLabel="Highest power-up level"
                valueText={(value, end) => `${end === 'lower' ? 'Lowest' : 'Highest'} level +${value}`}
                onChange={(lower, upper) => setFilters((current) => ({
                  ...current, lowestLevel: lower, highestLevel: upper,
                }))} />
            </div>
          </div>
          {/* "Where the rune is", not "which runes count": every rune was judged
              before this strip was reached, and these two buttons decide only
              which of the answers are on screen. */}
          {toggleGroup('Where', 'Filter by where the rune is', placeOptions, selectedPlaces,
            'selectedPlaces', (place) => placeLabels[place], 'rune-filter-usage')}
          <FilterSummary visible={visible.length} total={rows.length} noun="runes"
            onReset={() => setFilters(defaultRuneFilters)} className="rune-filter-status" />
        </>}
      >
        <tbody>
          {sorted.length ? sorted.map((row) => <tr key={row.rune.id}>
            <td className={cell('set', qualityRuleHost)}>
              <RuneLink
                target={{ kind: 'account', runeId: row.rune.id }}
                label={`${row.rune.setName} rune, slot ${row.rune.slot}`}
                onOpen={onOpenRune}
              >
                <span className="rune-link-cell">
                  <QualityRule tier={row.rune.defaultGrade} />
                  <AncientName name={row.rune.setName} ancient={row.rune.ancient} />
                </span>
              </RuneLink>
            </td>
            <td className={cell('slot')}>{row.rune.slot}</td>
            <td className={cell('level')}>+{row.rune.level}</td>
            <td className={cell('main')}>{runeStatName(row.rune.mainStatId) ?? '—'}</td>
            <td className={cell('innate', row.rune.prefixStatId === null && 'muted')}>
              {row.rune.prefixStatId === null
                ? '—'
                : <RuneInnateLine className="rune-sub rune-innate" statId={row.rune.prefixStatId} value={row.rune.prefixValue} />}
            </td>
            <td className={cell('subs', 'rune-subs')}>
              {row.rune.subProperties.length === 0
                ? <span className="muted">—</span>
                : row.rune.subProperties.map((property, at) => <RuneSubLine key={at} property={property} />)}
            </td>
            <td className={cell('location', !row.location && 'muted')}
              title={row.location === null ? 'Worn by a monster this import does not contain' : undefined}>
              {row.location ?? 'Unknown monster'}
            </td>
            <td className={cell('preset', !row.advice.preset && 'muted')}>
              {row.advice.preset?.name ?? '—'}
            </td>
            {/* The two figures the verdict is made of, printed beside it so the
                advice is arguable rather than something to be taken on trust. */}
            <td className={cell('maxValue')}>
              {runeMaxValueShown(row) ? `${Math.round(row.advice.maxValue * 100)} %` : <span className="muted">—</span>}
            </td>
            {/* A rune at +12 has spent every substat upgrade it will ever get, so there is
                nothing left to be uncertain about and no odds to print. A dash says
                that; "100 %" beside a Keep would invite the reader to compare a
                settled fact with the gambles in the rows above it. */}
            <td className={cell('chance')}>
              {runeChanceShown(row) ? runeChanceText(row.advice.chance) : <span className="muted">—</span>}
            </td>
            {/* The verdict alone. The chance it rests on is the column beside it, so
                repeating it underneath only said the same number twice. */}
            <td className={cell('advice')}>
              <span className="rune-verdict" data-verdict={row.advice.verdict}>
                {runeVerdictLabels[row.advice.verdict]}
              </span>
            </td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={runeCleanupTableColumns.length}>
              No runes match these filters. Clear a filter to see more.
            </td>
          </tr>}
        </tbody>
      </DataTablePage>}

    {failure
      ? <p className="calculation-status" role="status" data-failed="">{failure}</p>
      : result && <CalculationStatus
        detail={<>{formatNumber(runes.length, general)} runes judged against {formatNumber(presets.length, general)} presets</>}
        durationMs={result.durationMs}
        backend={result.backend}
        general={general}
      />}
  </div>;
}
