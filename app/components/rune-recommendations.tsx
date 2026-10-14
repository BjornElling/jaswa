import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AncientName } from './ancient-mark';
import { EngravedPlace } from './engraved-place';
import { FigureMarks } from './figure-marks';
import { engravedSaleMarks } from '../lib/figure-marks';
import { CalculationStatus } from './calculation-status';
import { Dropdown } from './dropdown';
import { Button, FilterButton, LabelSwap } from './button';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { QualityRule } from './quality-rule';
import { qualityRuleHost } from './quality-rule-host';
import { SortableHeader } from './sortable-table';
import { useRowOpener } from './use-row-opener';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { RangeSlider } from './range-slider';
import { TokenChoiceField } from './token-choice-field';
import { alignmentClass, runeCleanupTableColumns } from '../lib/table-layouts';
import { formatNumber } from '../lib/formatting';
import { readRunes, runeMaximumLevel, runeStatName } from '../lib/runes';
import { monsterCopyNamesIn } from '../lib/monster-names';
import { engravingLines } from '../lib/presets';
import { usePresets } from '../lib/presets-context';
import type { MonsterPreferences } from '../lib/monster-preferences';
import { runeVerdictLabels, runeVerdictOrder, withRuneSellProtection } from '../lib/rune-cleanup-advice';
import type { RuneVerdict } from '../lib/rune-cleanup-advice';
import {
  calculateRuneAdvice, cancelRuneAdvice, cancelRuneAdviceRefresh, refreshRuneAdvice,
} from '../lib/compute/rune-advice-client';
import { rememberRuneAdvice } from '../lib/compute/rune-advice-memory';
import { noReferenceLineMessage, referenceLines } from '../lib/rune-reference-stats';
import { runeCleanupStandardsChanged } from '../lib/rune-cleanup-session';
import type { RuneCleanupArrangement, RuneCleanupResult, RuneCleanupSession } from '../lib/rune-cleanup-session';
import {
  heldRuneAdvice, inArrangedOrder, runesToJudgeAgain, shownRuneAdvice, withFreshAdvice,
} from '../lib/rune-cleanup-refresh';
import {
  compareRuneCleanupRows, compareRuneGameSort, defaultRuneCleanupSortDirections,
  runeChanceShown, runeChanceText, runeCleanupSearchText, runeGameSortKeys, runeGameSortLabels,
  runeMaxValueShown, shownRuneVerdict, shownRuneVerdictLabel,
} from '../lib/rune-cleanup-grid';
import { filteredRuneVerdict, runeHoldVerdict } from '../lib/rune-holds';
import type { RuneHolds } from '../lib/rune-holds';
import type { RuneCleanupRow, RuneCleanupSortKey, RuneGameSortKey } from '../lib/rune-cleanup-grid';
import type { Rune, RuneDefaultGrade } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { GameRecord } from '../lib/game-data';
import type { GeneralSettings, ImportedGame, RunePotentialSettings } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';
import { RuneLink } from './rune-link';
import type { OpenRuneOverlay } from './rune-link';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import { StarIcon } from './star-icon';

/* The slots, star counts and levels a rune can have.
   Listed rather than derived from the import so the filter strip does not change
   shape when a different account is loaded. */
const slotOptions = [1, 2, 3, 4, 5, 6];
const starOptions = [1, 2, 3, 4, 5, 6];
/* The requested quality filter deliberately leaves Magic out of its short row;
   when no quality is chosen, Magic runes remain included with every other rune. */
const qualityOptions: readonly RuneDefaultGrade[] = ['Normal', 'Rare', 'Hero', 'Legend'];

type RuneFilterState = {
  search: string;
  selectedSets: string[];
  selectedSlots: number[];
  selectedVerdicts: RuneVerdict[];
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
const placeOptions = ['engraved', 'inventory'] as const;
type RunePlace = typeof placeOptions[number];
const placeLabels: Readonly<Record<RunePlace, string>> = { engraved: 'Engraved', inventory: 'Inventory' };

/* The table opens in the game's own Obtained order, newest first, so it reads
   like the box the player just left in Summoners War. */
const defaultRuneFilters: RuneFilterState = {
  search: '', selectedSets: [], selectedSlots: [], selectedVerdicts: [],
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
    column('role', 'Best role'),
    column('maxValue', <span className="table-heading-two-line" aria-label="Max value: the best end state it can reach against a perfect ordinary rune for that slot. An Ancient rune can exceed 100 per cent. The quality floor you set is a share of the ordinary runes a slot produces, so the Max value it comes to differs from slot to slot">Max<br />value</span>),
    column('chance', <span className="table-heading-two-line" aria-label="Chance to reach the final +15 quality floor; random substat rolls end at +12">Chance</span>),
    column('advice', 'Advice'),
    /* The game's own three orderings, driven by the Use game-sorting dropdown. They carry
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
 * It is the answer the user came for; the Rune Settings workspace holds the
 * controls that shape it. The calculation waits for the button rather than
 * running as sliders move: it reads every rune against every role and every
 * build, and a table that re-ran itself under a dragging thumb would be a table
 * nobody could read. What the player does in the game is different: a sync judges
 * only the runes it changed, and the rows keep their places (`rune-cleanup-refresh.ts`).
 */
export function RuneRecommendations({ game, profiles, runeHolds, lockedRunes, settings, roles, general, hardwareAcceleration, onOpenRune, onUpdate, session }: {
  session: RuneCleanupSession;
  game: ImportedGame | null;
  profiles: MonsterPreferences;
  /** The runes the user has said are not to be sold, which print their own word over the advice. */
  runeHolds: RuneHolds;
  /** The runes locked to a monster anywhere (`rune-locks.ts`), which do the same. */
  lockedRunes: ReadonlySet<string>;
  settings: RunePotentialSettings;
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  roles: RuneRole[];
  general: GeneralSettings;
  /** Whether the graphics card may count the odds. The worker is told, not asked. */
  hardwareAcceleration: boolean;
  onOpenRune: OpenRuneOverlay;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.rune-cleanup', defaultRuneFilters, isRuneFilterState,
  );
  const { search, selectedSets, selectedSlots, selectedVerdicts, selectedMains,
    selectedStars, selectedQualities, lowestLevel, highestLevel, selectedPlaces,
    showOnlyAncient, gameSort } = filters;

  /* The held result, and the standards it answers: the roles, settings and
     reference lines it was judged by. A result is kept until the user asks for
     another one, so a slider moved after a calculation leaves the table standing
     rather than silently changing under them. What the account does to its runes
     meanwhile is laid over it rune by rune, judged by those same standards
     (`rune-cleanup-refresh.ts`). */
  const [snapshot] = useState(session.read);
  const [result, setResult] = useState<RuneCleanupResult | null>(snapshot?.result ?? null);
  const [busy, setBusy] = useState(false);
  /* At most one re-reading in flight. A sync arriving meanwhile is picked up when
     it lands, by comparing again, so nothing is lost and nothing is superseded
     half-way through a box of power-ups. */
  const refreshing = useRef(false);
  const [refreshRound, setRefreshRound] = useState(0);
  /* The runes a re-reading failed on, so it is not retried in a loop; the next
     sync tries again. */
  const [refreshFailedFor, setRefreshFailedFor] = useState<readonly Rune[] | null>(null);
  /* A failed calculation says so and leaves the previous table standing. Clearing
     it would read as "no runes qualify", which is a different and wrong answer. */
  const [failure, setFailure] = useState<string | null>(snapshot?.failure ?? null);
  const rowOpener = useRowOpener();

  /**
   * Every rune the import holds, and the population every calculation judges.
   *
   * Every imported rune is judged independently. Engraved runes and runes at +15
   * are judged like any other; whether they are *on screen* is the filter strip's
   * business, and a filter cannot move a single figure.
   */
  const runes = useMemo(() => readRunes(game?.data), [game]);

  /* The same names the rest of the workspace uses, numbered where the roster holds
     more than one of a species, so a Location cell identifies the copy the rune is
     actually on rather than a species the account owns four of. */
  const reading = usePresets();
  const namesIn = useMemo(() => {
    const units = game?.data?.unit_list;
    return monsterCopyNamesIn(Array.isArray(units) ? units as GameRecord[] : [], profiles, reading.presets);
  }, [game, profiles, reading.presets]);

  /* Every place a rune is engraved, in Default and in each preset, read from
     the one resolution the page made (`presets-context.ts`). */
  const monsterName = useCallback((unitId: string, presetId: string) => namesIn(unitId, presetId) ?? 'A monster not in this import', [namesIn]);
  const placeOf = useCallback((runeId: string, gone: boolean) => {
    const places = gone ? [] : reading.runes.get(runeId) ?? [];
    return {
      location: gone ? 'Sold' as const : places.length > 0 ? 'Engraved' as const : 'Inventory' as const,
      places,
      placeText: engravingLines(places, reading.presets, monsterName).join(' '),
    };
  }, [reading, monsterName]);

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

  /* Leaving the page mid-calculation gives the processor back rather than
     finishing into a void. */
  useEffect(() => () => { cancelRuneAdvice(); cancelRuneAdviceRefresh(); }, []);

  const account = game?.data?.wizard_id === undefined ? '' : String(game.data.wizard_id);
  const held = game !== null && result !== null && result.account === account ? result : null;
  const standardsChanged = held !== null && runeCleanupStandardsChanged(held, roles, settings, base);
  const runesById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);

  const canCalculate = Boolean(game && runes.length && base && roles.length);

  async function calculate() {
    if (!canCalculate || !base) return;
    setBusy(true);
    setFailure(null);
    /* A whole calculation answers every rune, so a re-reading still in flight has
       nothing left to add. */
    cancelRuneAdviceRefresh();
    const outcome = await calculateRuneAdvice({ runes, roles, settings, base, preferWebGpu: hardwareAcceleration });
    /* A newer request has taken over the busy state and the table, so this one
       returns without touching either. */
    if (outcome.status === 'superseded') return;
    setBusy(false);
    if (outcome.status === 'failed') { setFailure(outcome.message); return; }
    setRefreshFailedFor(null);
    setResult((previous) => ({
      id: (previous?.id ?? 0) + 1, account, entries: heldRuneAdvice(runes, outcome.advice), roles, settings, base,
      durationMs: outcome.durationMs, backend: outcome.backend,
    }));
  }

  /* The account moved under the held result: judge again the runes that changed
     or arrived, by the result's own standards, and lay the answers over it. */
  useEffect(() => {
    if (held === null || busy || refreshing.current || refreshFailedFor === runes) return;
    const changed = runesToJudgeAgain(held.entries, runes);
    if (changed.length === 0) return;
    refreshing.current = true;
    const { id } = held;
    void refreshRuneAdvice({
      runes: changed, roles: held.roles, settings: held.settings, base: held.base, preferWebGpu: hardwareAcceleration,
    }).then((outcome) => {
      if (outcome.status === 'failed') setRefreshFailedFor(runes);
      if (outcome.status !== 'done') return;
      setResult((previous) => (previous?.id === id
        ? { ...previous, entries: withFreshAdvice(previous.entries, changed, outcome.advice) }
        : previous));
    }).finally(() => {
      refreshing.current = false;
      setRefreshRound((round) => round + 1);
    });
  }, [held, busy, runes, refreshFailedFor, refreshRound, hardwareAcceleration]);

  /* The overlay reads a rune's answer from here instead of asking for it again —
     but only while the table answers the standards on screen, and only for a rune
     whose answer still fits it. */
  useEffect(() => {
    if (held === null || !game?.data || standardsChanged) return;
    const fitting = shownRuneAdvice(held.entries, runesById).filter((entry) => !entry.gone && runesById.get(entry.rune.id) === entry.rune);
    rememberRuneAdvice({ data: game.data, settings, roles }, fitting.map((entry) => entry.rune),
      new Map(fitting.map((entry) => [entry.rune.id, entry.advice])));
  }, [held, game, roles, settings, standardsChanged, runesById]);

  /* A hold is the user's, not the calculation's, so it is laid over the held result
     on every change rather than frozen into it at Calculate. Where the rune sits is
     read the same way: moving it updates the engraving safeguard immediately. */
  const rows = useMemo<RuneCleanupRow[]>(
    () => (held === null ? [] : shownRuneAdvice(held.entries, runesById)).map(({ rune, advice, index, gone }) => {
      const place = placeOf(rune.id, gone);
      return {
        rune, advice: withRuneSellProtection(rune, advice, settings, place.places), index, gone,
        ...place,
        hold: gone ? null : runeHoldVerdict(runeHolds[rune.id], lockedRunes.has(rune.id)),
      };
    }),
    [held, runesById, placeOf, runeHolds, lockedRunes, settings],
  );
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.rune.id, row])), [rows]);
  const owned = held ? rows.filter((row) => !row.gone).length : runes.length;
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
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedPlaces.length === 1
        && selectedPlaces[0] !== (row.location === 'Engraved' ? 'engraved' : 'inventory')) return false;
      if (showOnlyAncient && !row.rune.ancient) return false;
      if (selectedSets.length && !selectedSets.includes(row.rune.setName)) return false;
      if (selectedSlots.length && !selectedSlots.includes(row.rune.slot)) return false;
      if (selectedStars.length && !selectedStars.includes(row.rune.stars)) return false;
      if (selectedQualities.length && !selectedQualities.includes(row.rune.defaultGrade)) return false;
      if (selectedVerdicts.length && !selectedVerdicts.includes(filteredRuneVerdict(shownRuneVerdict(row)))) return false;
      if (selectedMains.length && !selectedMains.includes(row.rune.mainStatId)) return false;
      if (row.rune.level < lowestLevel || row.rune.level > highestLevel) return false;
      if (!term) return true;
      return runeCleanupSearchText(row).includes(term);
    });
  }, [rows, search, selectedSets, selectedSlots, selectedStars, selectedQualities, selectedVerdicts,
    selectedMains, lowestLevel, highestLevel, selectedPlaces, showOnlyAncient]);

  const { sorted, sort, toggle: toggleColumn, setSort } = useSortedRows(
    visible, columns, snapshot?.sort ?? (gameSort === null
      ? { key: 'maxValue', direction: 'descending' }
      : { key: gameSort, direction: 'ascending' }),
  );

  /* Choosing one of the game's orderings takes the table over; clicking any
     column heading hands ordering back and clears the dropdown. One sort state
     throughout, so the two controls can never both claim to be ordering the
     rows.
     The direction is always `ascending` because each game ordering already
     states its own direction, in the sign of its sort key — the game offers one
     arrangement per option, not a pair to toggle between, so reversing it here
     would invent an order the panel does not have. */
  /* The order on screen is taken when the reader arranges the table — a sort, a
     filter, a calculation — and held while syncs change the runes under it, so a
     rune just powered up or sold does not jump away from the row being read. */
  const arrangement = JSON.stringify({ filters, sort, result: held?.id ?? null });
  const [arranged, setArranged] = useState<RuneCleanupArrangement | null>(snapshot?.arranged ?? null);
  /* Save only committed screen state. The owner outlives navigation, while the
     page and its workers can still unmount normally. A cancelled request never
     replaces the last completed table or leaves the next visit busy. */
  useLayoutEffect(() => { session.remember({ result, sort, arranged, failure }); }, [session, result, sort, arranged, failure]);
  if (held !== null && arranged?.key !== arrangement) {
    setArranged({ key: arrangement, ids: sorted.map((row) => row.rune.id), known: new Set(rowsById.keys()) });
  }
  const shown = held !== null && arranged?.key === arrangement
    ? inArrangedOrder(sorted, rowsById, arranged, (row) => row.rune.id)
    : sorted;
  const shownOwned = shown.filter((row) => !row.gone).length;

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

  const emptyState = !game
    ? { title: 'Nothing to judge until a game file is imported.', detail: 'Go to Home and drop in the JSON file exported from Summoners War.' }
    : !runes.length
      ? { title: 'This import holds no runes JASWA can read.', detail: 'Report it from the rail if your account does have runes.' }
      : !base
        ? { title: 'No monster has reached level 40.', detail: noReferenceLineMessage }
        : !roles.length
          ? { title: 'There are no roles to judge runes against.', detail: 'Add one under Rune Settings to say what a rune should be worth.' }
          : !held
            ? { title: 'Nothing calculated yet.', detail: 'Press Calculate to put every rune on trial. The standards they are judged by live in Rune Settings.' }
            : null;

  return <>
    <DataTablePage
        filterClassName="rune-filter-strip"
        tableClassName="rune-cleanup-grid"
        headerLabel="Rune verdict columns"
        tableLabel="Rune verdicts"
        columnGroup={<TableColumnGroup columns={runeCleanupTableColumns} />}
        header={<SortableHeader columns={columns} sort={sort} onToggle={toggle} />}
        filters={<>
          <div className="rune-filter-column">
            <div className="filter-group rune-filter-search">
              <span className="filter-label">Search</span>
              <div className="filter-group-controls">
                <div className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input value={search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Filter runes" aria-label="Filter runes by set, stat, role or advice" />
                  <FilterButton
                    onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                    hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
                </div>
              </div>
            </div>
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
            {toggleGroup('Slot', 'Filter by slot', slotOptions, selectedSlots,
              'selectedSlots', (slot) => String(slot), 'rune-filter-slot')}
          </div>
          <div className="rune-filter-column">
            <TokenChoiceField label="Main" description="Filter by main property" empty="Any main"
              className="rune-filter-main" options={mainOptions} chosen={selectedMains}
              onChange={(next) => setFilters((current) => ({ ...current, selectedMains: next }))} />
            {/* Two long vocabularies — rune sets and main properties — each answered on one line rather
                than spelled out in full across the strip. */}
            <TokenChoiceField label="Set" description="Filter by rune set" empty="Any set"
              className="rune-filter-set" options={setOptions} chosen={selectedSets}
              onChange={(next) => setFilters((current) => ({ ...current, selectedSets: next }))} />
            <div className="filter-group rune-filter-ancient" role="group" aria-label="Show only Ancient runes">
              <span className="filter-label">Show only</span>
              <div className="filter-group-controls">
                <FilterButton active={showOnlyAncient}
                  onClick={() => setFilters((current) => ({ ...current, showOnlyAncient: !current.showOnlyAncient }))}
                >Ancient</FilterButton>
              </div>
            </div>
          </div>
          <div className="rune-filter-column">
              {toggleGroup('Stars', 'Filter by star count', starOptions, selectedStars,
                'selectedStars', (stars) => <span className="rune-star-choice" aria-hidden="true">
                  <span className="rune-star-count">{stars}</span><StarIcon />
                </span>, 'rune-filter-stars', (stars) => `${stars} star${stars === 1 ? '' : 's'}`)}
            {toggleGroup('Quality', 'Filter by rune quality', qualityOptions, selectedQualities,
              'selectedQualities', (quality) => quality, 'rune-filter-quality')}
            {/* Location narrows the answers on screen; every imported rune still
                enters the calculation. */}
            {toggleGroup('Location', 'Filter by location', placeOptions, selectedPlaces,
              'selectedPlaces', (place) => placeLabels[place], 'rune-filter-usage')}
            {toggleGroup('Advice', 'Filter by advice', runeVerdictOrder, selectedVerdicts,
              'selectedVerdicts', (verdict) => runeVerdictLabels[verdict], 'rune-filter-advice')}
          </div>
          <div className="rune-filter-column">
            <div className="filter-group rune-speed-protection" role="group" aria-label="Never sell if...">
              <span className="filter-label">Never sell if...</span>
              <div className="filter-group-controls">
                <div className="checkbox-row">
                  <input id="rune-speed-protection" type="checkbox" aria-label="Pre-grind spd ≥"
                    checked={settings.neverSellPreGrindSpeed}
                    onChange={(event) => onUpdate({ neverSellPreGrindSpeed: event.target.checked })} />
                  <label htmlFor={settings.neverSellPreGrindSpeed ? 'rune-speed-protection' : undefined}
                    aria-disabled={!settings.neverSellPreGrindSpeed}>Pre-grind spd ≥</label>
                </div>
                <input className="rune-speed-minimum type-body" type="text" inputMode="numeric" maxLength={2}
                  disabled={!settings.neverSellPreGrindSpeed}
                  aria-label="Minimum pre-grind speed" value={settings.preGrindSpeedMinimum ?? ''}
                  onChange={(event) => {
                    const text = event.target.value;
                    if (text === '') { onUpdate({ preGrindSpeedMinimum: null }); return; }
                    if (!/^\d{1,2}$/.test(text)) return;
                    const value = Number(text);
                    if (Number.isFinite(value)) onUpdate({ preGrindSpeedMinimum: value });
                  }} />
              </div>
              <div className="filter-group-controls">
                <div className="checkbox-row">
                  <input id="rune-potential-protection" type="checkbox" aria-label="Potential value ≥"
                    checked={settings.neverSellPotentialValue}
                    onChange={(event) => onUpdate({ neverSellPotentialValue: event.target.checked })} />
                  <label htmlFor={settings.neverSellPotentialValue ? 'rune-potential-protection' : undefined}
                    aria-disabled={!settings.neverSellPotentialValue}>Potential value ≥</label>
                </div>
                <input className="rune-speed-minimum type-body" type="text" inputMode="numeric" maxLength={3}
                  disabled={!settings.neverSellPotentialValue}
                  aria-label="Minimum potential value" value={settings.potentialValueMinimum ?? ''}
                  onChange={(event) => {
                    const text = event.target.value;
                    if (text === '') { onUpdate({ potentialValueMinimum: null }); return; }
                    if (!/^\d{1,3}$/.test(text)) return;
                    const value = Number(text);
                    if (Number.isFinite(value)) onUpdate({ potentialValueMinimum: value });
                  }} />
                <span>%</span>
              </div>
              <div className="filter-group-controls">
                <div className="checkbox-row">
                  <input id="rune-engraving-protection" type="checkbox" aria-label="Engraved on ≥"
                    checked={settings.neverSellEngravedPlacements}
                    onChange={(event) => onUpdate({ neverSellEngravedPlacements: event.target.checked })} />
                  <label htmlFor={settings.neverSellEngravedPlacements ? 'rune-engraving-protection' : undefined}
                    aria-disabled={!settings.neverSellEngravedPlacements}>Engraved on ≥</label>
                </div>
                <input className="rune-speed-minimum rune-engraving-minimum type-body" type="text" inputMode="numeric" maxLength={1}
                  disabled={!settings.neverSellEngravedPlacements}
                  aria-label="Minimum engraving count" value={settings.engravedPlacementsMinimum ?? ''}
                  onChange={(event) => {
                    const text = event.target.value;
                    if (text === '') { onUpdate({ engravedPlacementsMinimum: null }); return; }
                    if (!/^[1-9]$/.test(text)) return;
                    const value = Number(text);
                    if (Number.isFinite(value)) onUpdate({ engravedPlacementsMinimum: value });
                  }} />
                <span>mons.</span>
              </div>
            </div>
            {/* Ordering, not filtering: it reproduces the game's own Sort by, so a
                box just arranged in Summoners War can be arranged the same way
                here and the two lists compared row for row. */}
            <div className="filter-group rune-filter-sort-by" role="group" aria-label="Sort runes the way the game does">
              <label className="filter-label" htmlFor="rune-sort-by">Use game-sorting</label>
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
          </div>
          <div className="rune-filter-actions">
            <FilterSummary visible={shownOwned} total={owned} noun="runes"
              onReset={() => setFilters(defaultRuneFilters)} className="rune-filter-status" />
            <Button tone="primary" onClick={calculate} busy={busy} disabled={!canCalculate}
              title={canCalculate ? undefined : emptyState?.title}>
              <LabelSwap showing={busy ? 'busy' : held ? 'again' : 'first'}
                faces={{ first: 'Calculate', again: 'Recalculate', busy: 'Calculating' }} />
            </Button>
          </div>
        </>}
      >
        <tbody>
          {shown.length ? shown.map((row) => <tr key={row.rune.id} {...rowOpener}
            data-stale={row.gone ? 'true' : undefined}>
            <td className={cell('set', qualityRuleHost)}>
              {/* A sold rune opens as it last was: the account has no rune by that id to open. */}
              <RuneLink
                target={row.gone ? { kind: 'generated', rune: row.rune } : { kind: 'account', runeId: row.rune.id }}
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
            <td className={cell('location')}>
              <EngravedPlace places={row.places} sold={row.gone} presets={reading.presets} monsterName={monsterName} showDefaultMonster />
            </td>
            <td className={cell('role', !row.advice.role && 'muted')}>
              {row.advice.role?.name ?? '—'}
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
              <span className="rune-verdict-line">
                <span className="rune-verdict" data-verdict={shownRuneVerdict(row)}>
                  {shownRuneVerdictLabel(row)}
                </span>
                <FigureMarks marks={engravedSaleMarks(shownRuneVerdict(row), row.places.length)} reserve={1} />
              </span>
            </td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={runeCleanupTableColumns.length}>
              {emptyState ? <>
                <span>{emptyState.title}</span><br />
                <span>{emptyState.detail}</span>
              </> : 'No runes match these filters. Clear a filter to see more.'}
            </td>
          </tr>}
        </tbody>
      </DataTablePage>

    {failure || (held && refreshFailedFor === runes)
      ? <p className="calculation-status" role="status" data-failed="">
        {failure ?? 'JASWA could not judge the runes changed in the game. Recalculate to try again.'}
      </p>
      : held && <CalculationStatus
        detail={<>{formatNumber(owned, general)} runes judged against {formatNumber(held.roles.length, general)} roles</>}
        durationMs={held.durationMs}
        backend={held.backend}
        general={general}
      />}
    <div className="type-caption" role="status">
      <LabelSwap showing={standardsChanged ? 'changed' : 'current'} faces={{
        current: '\u00a0',
        changed: 'Standards changed. Recalculate to use the current roles, settings and reference stats.',
      }} />
    </div>
  </>;
}
