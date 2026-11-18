import { filterIncludes } from '../../domain/shared/filter-selection';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AncientName } from '../../ui/gear/ancient-mark';
import { EngravedPlace } from '../../ui/gear/engraved-place';
import { FigureMarks } from '../../ui/figure-marks';
import { engravedSaleMarks } from '../../domain/shared/figure-marks';
import { CalculationActions, CalculationNote } from '../../ui/calculation-actions';
import { CalculationStatus } from '../../ui/calculation-status';
import { Dropdown } from '../../ui/dropdown';
import { FilterButton, LabelSwap } from '../../ui/button';
import { DataTablePage, TableColumnGroup } from '../../ui/data-table-page';
import { FilterSummary } from '../../ui/filter-summary';
import { QualityRule } from '../../ui/quality-rule';
import { qualityRuleHost } from '../../ui/quality-rule-host';
import { SortableHeader } from '../../ui/sortable-table';
import { useRowOpener } from '../../ui/use-row-opener';
import { useSortedRows } from '../../ui/use-sorted-rows';
import type { SortableColumn } from '../../ui/use-sorted-rows';
import { RangeSlider } from '../../ui/range-slider';
import { TokenChoiceField } from '../../ui/forms/token-choice-field';
import { alignmentClass, runeCleanupTableColumns } from '../../ui/table-layouts';
import { formatNumber } from '../../domain/shared/formatting';
import { runeMaximumLevel, runeStatName } from '../../domain/runes/runes';
import { monsterCopyNamesIn } from '../../domain/monsters/monster-names';
import { engravingLines } from '../../domain/placements/presets';
import { emptyRunePlacement, hasRunePlacement } from '../../domain/placements/rune-placement';
import { usePresets } from '../../ui/presets-context';
import type { MonsterPreferences } from '../../domain/profiles/monster-preferences';
import { runeQualityText, runeVerdictLabels, withRuneSellProtection } from '../../domain/runes/cleanup/rune-cleanup-advice';
import type { RuneVerdict } from '../../domain/runes/rune-verdict';
import {
  calculateRuneAdvice, cancelRuneAdvice, cancelRuneAdviceRefresh, refreshRuneAdvice,
} from '../../workspace/jobs/rune-advice-client';
import { rememberRuneAdvice } from '../../workspace/jobs/rune-advice-memory';
import { combineCalculationBackends } from '../../domain/shared/calculation-summary';
import { noReferenceLineMessage, referenceLines } from '../../domain/reference/rune-reference-stats';
import { runeCalculationKey, runeCalculationKeyForRune } from '../../domain/runes/rune-calculation-inputs';
import { runeCleanupStandardsChanged } from './rune-cleanup-session';
import type { RuneCleanupArrangement, RuneCleanupResult, RuneCleanupSession } from './rune-cleanup-session';
import {
  heldRuneAdvice, inArrangedOrder, runesToJudgeAgain, shownRuneAdvice, withFreshAdvice,
} from '../../domain/runes/cleanup/rune-cleanup-refresh';
import {
  compareRuneCleanupRows, compareRuneGameSort, defaultRuneCleanupSortDirections,
  runeChanceShown, runeChanceText, runeCleanupSearchText, runeGameSortKeys, runeGameSortLabels,
  runeMaxValueShown, shownRuneVerdict, shownRuneVerdictLabel,
} from '../../domain/runes/cleanup/rune-cleanup-grid';
import { filteredRuneVerdict, runeHoldVerdict } from '../../domain/profiles/rune-holds';
import type { RuneHolds } from '../../domain/profiles/rune-holds';
import type { RuneCleanupRow, RuneCleanupSortKey, RuneGameSortKey } from '../../domain/runes/cleanup/rune-cleanup-grid';
import type { Rune, RuneRarity } from '../../domain/runes/runes';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import type { GameRecord } from '../../domain/account/game-record';
import type { GeneralSettings, ImportedGame, RunePotentialSettings } from '../../domain/model';
import { useSessionStorageState } from '../../ui/session-state';
import { RuneLink } from '../../ui/gear/rune-link';
import type { OpenRuneOverlay } from '../../ui/gear/rune-link';
import { RuneInnateLine, RuneSubLine } from '../../ui/gear/rune-sub-line';
import { StarIcon } from '../../ui/star-icon';

/* The slots, star counts and levels a rune can have.
   Listed rather than derived from the import so the filter strip does not change
   shape when a different account is loaded. */
const slotOptions = [1, 2, 3, 4, 5, 6];
const noRunes: readonly Rune[] = [];
const noMonsters: readonly GameRecord[] = [];
const starOptions = [1, 2, 3, 4, 5, 6];
/* The requested rarity filter deliberately leaves Magic out of its short row;
   when no rarity is chosen, Magic runes remain included with every other rune. */
const rarityOptions: readonly RuneRarity[] = ['Normal', 'Rare', 'Hero', 'Legend'];

type RuneFilterState = {
  search: string;
  selectedSets: string[];
  selectedSlots: number[];
  selectedVerdicts: RuneVerdict[];
  selectedMains: number[];
  selectedStars: number[];
  selectedRarities: RuneRarity[];
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

/* The Advice filter asks one question of the two rerolls: which runes go to a stone.
   Its `reapp` option stands for both, and the rows still say which stone. */
const adviceFilterOptions: readonly RuneVerdict[] = ['power-up', 'keep', 'reapp', 'sell', 'unavailable'];
const adviceFilterLabel = (verdict: RuneVerdict) => (verdict === 'reapp' ? 'Re-app/refine' : runeVerdictLabels[verdict]);
const adviceFilterOf = (verdict: RuneVerdict): RuneVerdict => (verdict === 'refine' ? 'reapp' : verdict);

/* The table opens in the game's own Obtained order, newest first, so it reads
   like the box the player just left in Summoners War. */
const defaultRuneFilters: RuneFilterState = {
  search: '', selectedSets: [], selectedSlots: [], selectedVerdicts: [],
  selectedMains: [], selectedStars: [], selectedRarities: [], lowestLevel: 0,
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
    && candidate.selectedVerdicts.every((e) => adviceFilterOptions.includes(e as RuneVerdict))
    && Array.isArray(candidate.selectedMains) && candidate.selectedMains.every((e) => typeof e === 'number')
    && Array.isArray(candidate.selectedStars) && candidate.selectedStars.every((e) => starOptions.includes(e as number))
    && Array.isArray(candidate.selectedRarities)
    && candidate.selectedRarities.every((e) => rarityOptions.includes(e as RuneRarity))
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
      : key === 'quality' ? (row: RuneCleanupRow) => row.advice.qualityShare === null
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
    column('maxValue', <span className="table-heading-two-line" aria-label="Max value: the best end state it can reach against a perfect ordinary rune for that slot. An Ancient rune can exceed 100 per cent.">Max<br />value</span>),
    column('quality', <span title="Top share for Best role at the best reachable +15 score">Quality</span>),
    column('chance', <span className="table-heading-two-line" aria-label="Chance that at least one permitted build reaches its quality bar">Chance</span>),
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
    selectedStars, selectedRarities, lowestLevel, highestLevel, selectedPlaces,
    showOnlyAncient, gameSort } = filters;

  /* Navigation keeps answers and arrangement. Changed inputs replace only the
     affected answers, while the rows retain the reader's working order. */
  const [snapshot] = useState(session.read);
  const [result, setResult] = useState<RuneCleanupResult | null>(snapshot?.result ?? null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showQuality, setShowQuality] = useState(snapshot?.showQuality ?? false);
  const [preparation, setPreparation] = useState<number | null>(null);
  const [progressKey, setProgressKey] = useState<string | null>(null);
  /* A failed input is retried only after another change or an explicit Calculate. */
  const [refreshFailedFor, setRefreshFailedFor] = useState<{ runes: readonly Rune[]; key: string } | null>(null);
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
  const runes = game?.snapshot.runes ?? noRunes;

  /* The same names the rest of the workspace uses, numbered where the roster holds
     more than one of a species, so a Location cell identifies the copy the rune is
     actually on rather than a species the account owns four of. */
  const reading = usePresets();
  const namesIn = useMemo(() => {
    const units = game?.snapshot.monsters.map((entry) => entry.record) ?? noMonsters;
    return monsterCopyNamesIn(units, profiles, reading.presets);
  }, [game?.snapshot, profiles, reading.presets]);

  /* Every place a rune is engraved, in Scenario and in each preset, read from
     the one resolution the page made (`presets-context.ts`). */
  const monsterName = useCallback((unitId: string, presetId: string) => namesIn(unitId, presetId) ?? 'A monster not in this import', [namesIn]);
  const placeOf = useCallback((runeId: string, gone: boolean) => {
    const placement = gone ? emptyRunePlacement : reading.runes.get(runeId) ?? emptyRunePlacement;
    return {
      location: gone ? 'Sold' as const : hasRunePlacement(placement) ? 'Engraved' as const : 'Inventory' as const,
      placement,
      placeText: engravingLines(placement.places, reading.presets, monsterName).join(' '),
    };
  }, [reading, monsterName]);

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

  /* Leaving the page mid-calculation gives the processor back rather than
     finishing into a void. */
  useEffect(() => () => { cancelRuneAdvice(); cancelRuneAdviceRefresh(); }, []);

  const account = game?.snapshot.accountId ?? '';
  const held = game !== null && result !== null && result.account === account ? result : null;
  const standardsChanged = held !== null && runeCleanupStandardsChanged(held, roles, settings, base);
  const runesById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);

  const standardsKey = runeCalculationKey({ roles, settings, base });
  const currentStandardsKey = useRef(standardsKey);
  useLayoutEffect(() => { currentStandardsKey.current = standardsKey; }, [standardsKey]);
  const refreshFailed = refreshFailedFor?.runes === runes && refreshFailedFor.key === standardsKey;
  const updatingStandards = standardsChanged && Boolean(base && roles.length) && !refreshFailed;
  const reportingProgress = busy || updatingStandards;
  const canCalculate = Boolean(game && runes.length && base && roles.length);
  const readCalculationInputs = useEffectEvent(() => ({ roles, settings, base, hardwareAcceleration }));

  async function calculate() {
    if (!canCalculate || !base) return;
    setBusy(true);
    setProgress(0);
    setPreparation(null);
    setProgressKey(standardsKey);
    setFailure(null);
    /* A whole calculation answers every rune, so a re-reading still in flight has
       nothing left to add. */
    cancelRuneAdviceRefresh();
    const outcome = await calculateRuneAdvice({ runes, roles, settings, base, preferWebGpu: hardwareAcceleration },
      setProgress, setPreparation);
    /* A newer request has taken over the busy state and the table, so this one
       returns without touching either. */
    if (outcome.status === 'superseded') return;
    setBusy(false);
    if (currentStandardsKey.current !== standardsKey) {
      setFailure('Standards changed during calculation. Calculate again to use the current inputs.');
      return;
    }
    if (outcome.status === 'failed') { setFailure(outcome.message); return; }
    setRefreshFailedFor(null);
    setResult((previous) => ({
      id: (previous?.id ?? 0) + 1, account, entries: heldRuneAdvice(runes, outcome.advice), roles, settings, base,
      durationMs: outcome.durationMs, backend: outcome.backend,
    }));
  }

  /* Stopping keeps the verdicts from before Calculate: the worker answers the
     cancelled request `superseded`, which leaves the table alone. */
  function cancel() {
    cancelRuneAdvice();
    setBusy(false);
  }

  function clear() {
    cancelRuneAdviceRefresh();
    setResult(null);
    setFailure(null);
    setRefreshFailedFor(null);
  }

  /* Role and reference changes can alter the quality references. Set-specific
     preferences leave other sets valid, so only their rows enter the worker. */
  useEffect(() => {
    const { roles, settings, base, hardwareAcceleration } = readCalculationInputs();
    if (held === null || busy || refreshFailed || !base || roles.length === 0) return;
    const inputs = { roles, settings, base };
    const changedIds = new Set(runesToJudgeAgain(held.entries, runes).map((rune) => rune.id));
    const candidates = [...runes, ...[...held.entries.values()]
      .filter((entry) => !runesById.has(entry.rune.id)).map((entry) => entry.rune)];
    const keys = new Map<string, [string, string]>();
    const changed = candidates.filter((rune) => {
      if (changedIds.has(rune.id)) return true;
      // A set shares one dependency key, however many runes the box contains.
      let pair = keys.get(rune.setName);
      if (!pair) {
        pair = [runeCalculationKeyForRune(held, rune), runeCalculationKeyForRune(inputs, rune)];
        keys.set(rune.setName, pair);
      }
      return pair[0] !== pair[1];
    });
    if (changed.length === 0) {
      if (!standardsChanged) return;
      const timer = window.setTimeout(() => {
        setResult((previous) => previous === held ? { ...previous, roles, settings, base } : previous);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const updatedIds = new Set(changed.map((rune) => rune.id));
    const replacesEveryAnswer = [...held.entries.keys()].every((id) => updatedIds.has(id));
    let disposed = false;
    let settled = false;
    const timer = window.setTimeout(() => {
      setProgress(0);
      setProgressKey(standardsKey);
      void refreshRuneAdvice({ runes: changed, roles, settings, base, preferWebGpu: hardwareAcceleration },
        (fraction) => { if (!disposed) setProgress(fraction); }).then((outcome) => {
        settled = true;
        if (disposed || outcome.status === 'superseded') return;
        if (outcome.status === 'failed') { setRefreshFailedFor({ runes, key: standardsKey }); return; }
        setFailure(null);
        setResult((previous) => previous === held
          ? { ...previous, roles, settings, base, entries: withFreshAdvice(previous.entries, changed, outcome.advice),
            backend: replacesEveryAnswer ? outcome.backend : combineCalculationBackends([previous.backend, outcome.backend]),
            ...(standardsChanged ? { durationMs: outcome.durationMs } : {}) }
          : previous);
      });
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (!settled) cancelRuneAdviceRefresh();
    };
  }, [held, busy, runes, runesById, refreshFailed, standardsKey, standardsChanged]);

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
        rune, advice: withRuneSellProtection(rune, advice, settings, place.placement), index, gone,
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
    const sets = setOptions.map((option) => option.value);
    const mains = mainOptions.map((option) => option.value);
    return rows.filter((row) => {
      if (!filterIncludes(selectedPlaces, row.location === 'Engraved' ? 'engraved' : 'inventory', placeOptions)) return false;
      if (showOnlyAncient && !row.rune.ancient) return false;
      if (!filterIncludes(selectedSets, row.rune.setName, sets)) return false;
      if (!filterIncludes(selectedSlots, row.rune.slot, slotOptions)) return false;
      if (!filterIncludes(selectedStars, row.rune.stars, starOptions)) return false;
      if (!filterIncludes(selectedRarities, row.rune.rarity, rarityOptions)) return false;
      if (!filterIncludes(selectedVerdicts, adviceFilterOf(filteredRuneVerdict(shownRuneVerdict(row))), adviceFilterOptions)) return false;
      if (!filterIncludes(selectedMains, row.rune.mainStatId, mains)) return false;
      if (row.rune.level < lowestLevel || row.rune.level > highestLevel) return false;
      if (!term) return true;
      return runeCleanupSearchText(row).includes(term);
    });
  }, [rows, search, selectedSets, selectedSlots, selectedStars, selectedRarities, selectedVerdicts,
    selectedMains, lowestLevel, highestLevel, selectedPlaces, showOnlyAncient, setOptions, mainOptions]);

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
  useLayoutEffect(() => { session.remember({ result, sort, showQuality, arranged, failure }); }, [session, result, sort, showQuality, arranged, failure]);
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
    ? { title: 'Nothing to judge until account data is imported.', detail: 'Go to Home to connect the helper or import a game file.' }
    : !runes.length
      ? { title: 'This import holds no runes JASWA can read.', detail: 'Report it from the rail if your account does have runes.' }
      : !base
        ? { title: 'No monster has reached level 40.', detail: noReferenceLineMessage }
        : !roles.length
          ? { title: 'There are no roles to judge runes against.', detail: 'Add one under Rune Settings to say what a rune should be worth.' }
          : !held
            ? { title: 'Nothing calculated yet.', detail: 'Press Calculate to put every rune on trial. The standards they are judged by live in Rune Settings.' }
            : null;

  const displayedColumns = showQuality ? columns : columns.filter(({ key }) => key !== 'quality');
  const tableLayout = showQuality ? runeCleanupTableColumns : runeCleanupTableColumns.filter(({ key }) => key !== 'quality');
  return <>
    <DataTablePage
        filterClassName="rune-filter-strip"
        tableClassName="rune-cleanup-grid"
        headerLabel="Rune verdict columns"
        tableLabel="Rune verdicts"
        columnGroup={<TableColumnGroup columns={tableLayout} />}
        header={<SortableHeader columns={displayedColumns} sort={sort} onToggle={toggle} />}
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
            {/* Two long vocabularies — rune sets and main properties — each answered on one line rather
                than spelled out in full across the strip. */}
            <TokenChoiceField label="Set" description="Filter by rune set" empty="Any set"
              className="rune-filter-set" options={setOptions} chosen={selectedSets}
              onChange={(next) => setFilters((current) => ({ ...current, selectedSets: next }))} />
            <TokenChoiceField label="Main" description="Filter by main property" empty="Any main"
              className="rune-filter-main" options={mainOptions} chosen={selectedMains}
              onChange={(next) => setFilters((current) => ({ ...current, selectedMains: next }))} />
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
            {toggleGroup('Rarity', 'Filter by rune rarity', rarityOptions, selectedRarities,
              'selectedRarities', (rarity) => rarity, 'rune-filter-rarity')}
            {/* Location narrows the answers on screen; every imported rune still
                enters the calculation. */}
            {toggleGroup('Location', 'Filter by location', placeOptions, selectedPlaces,
              'selectedPlaces', (place) => placeLabels[place], 'rune-filter-usage')}
            {toggleGroup('Advice', 'Filter by advice', adviceFilterOptions, selectedVerdicts,
              'selectedVerdicts', adviceFilterLabel, 'rune-filter-advice')}
          </div>
          <div className="rune-filter-column">
            <div className="filter-group rune-speed-protection" role="group" aria-label="Never sell if...">
              <span className="filter-label">Never sell if...</span>
              <div className="filter-group-controls">
                <div className="checkbox-row">
                  <input id="rune-speed-protection" type="checkbox" aria-label="Pre-grind SPD ≥"
                    checked={settings.neverSellPreGrindSpeed}
                    onChange={(event) => onUpdate({ neverSellPreGrindSpeed: event.target.checked })} />
                  <label htmlFor={settings.neverSellPreGrindSpeed ? 'rune-speed-protection' : undefined}
                    aria-disabled={!settings.neverSellPreGrindSpeed}>Pre-grind SPD ≥</label>
                </div>
                <input className="rune-speed-minimum type-body" type="text" inputMode="numeric" maxLength={2}
                  disabled={!settings.neverSellPreGrindSpeed}
                  aria-label="Minimum pre-grind SPD" value={settings.preGrindSpeedMinimum ?? ''}
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
                  <input id="rune-engraving-protection" type="checkbox" aria-label="Engraved in non-Scenario preset"
                    checked={settings.neverSellEngravedPlacements}
                    onChange={(event) => onUpdate({ neverSellEngravedPlacements: event.target.checked })} />
                  <label htmlFor="rune-engraving-protection">Engraved in non-Scenario preset</label>
                </div>
              </div>
              {/* The targets themselves are set in Rune Settings, under Re-app/refine target. */}
              <div className="filter-group-controls">
                <div className="checkbox-row">
                  <input id="rune-reapp-protection" type="checkbox" aria-label="Re-app/refine target"
                    checked={settings.neverSellReappTargets}
                    onChange={(event) => onUpdate({ neverSellReappTargets: event.target.checked })} />
                  <label htmlFor="rune-reapp-protection">Re-app/refine target</label>
                </div>
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
                <FilterButton active={showQuality} onClick={() => {
                  if (showQuality && sort.key === 'quality') setSort({ key: 'maxValue', direction: 'descending' });
                  setShowQuality(!showQuality);
                }}>Quality column</FilterButton>
              </div>
            </div>
          </div>
          {/* A re-reading after a standards change reports its progress here
              too, though it is not the button's own work and cannot be
              cancelled from it. */}
          <CalculationActions className="rune-filter-actions" busy={busy} canCalculate={canCalculate}
            calculateTitle={emptyState?.title} onCalculate={() => void calculate()} onCancel={cancel}
            canClear={held !== null || failure !== null} onClear={clear}
            status={reportingProgress
              ? <CalculationNote tone="busy">{preparation !== null
                ? `Preparing quality references… ${formatNumber(Math.round(preparation * 100), general)} %`
                : `Calculating… ${formatNumber(progressKey === standardsKey ? Math.round(progress * 100) : 0, general)} %`}</CalculationNote>
              : failure || (held && refreshFailed)
                ? <CalculationNote tone="failed">{failure ?? 'JASWA could not update the rune verdicts. Calculate again to try again.'}</CalculationNote>
                : held
                  ? <CalculationStatus twoLines
                    detail={<>{formatNumber(owned, general)} runes judged against {formatNumber(held.roles.length, general)} roles</>}
                    durationMs={held.durationMs} backend={held.backend} general={general} />
                  : <CalculationNote>{''}</CalculationNote>}
            resets={<FilterSummary visible={shownOwned} total={owned} noun="runes"
              onReset={() => setFilters(defaultRuneFilters)} className="rune-filter-status" />} />
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
                  <QualityRule tier={row.rune.rarity} />
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
              <EngravedPlace runePlacement={row.placement} sold={row.gone} presets={reading.presets} monsterName={monsterName} />
            </td>
            <td className={cell('role', !row.advice.role && 'muted')}>
              {row.advice.role?.name ?? '—'}
            </td>
            {/* The two figures the verdict is made of, printed beside it so the
                advice is arguable rather than something to be taken on trust. */}
            <td className={cell('maxValue')}>
              {runeMaxValueShown(row) ? `${Math.round(row.advice.maxValue * 100)} %` : <span className="muted">—</span>}
            </td>
            {showQuality && <td className={cell('quality', 'rune-quality-share')}>
              {runeQualityText(row.advice.qualityShare, row.advice.requirement)}
            </td>}
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
                <span className="rune-verdict" data-verdict={shownRuneVerdict(row)} title={row.advice.verdict === 'unavailable' ? row.advice.reason : undefined}>
                  {shownRuneVerdictLabel(row)}
                </span>
                <FigureMarks marks={engravedSaleMarks(shownRuneVerdict(row), row.placement.count)} reserve={1} />
              </span>
            </td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={tableLayout.length}>
              {emptyState ? <>
                <span>{emptyState.title}</span><br />
                <span>{emptyState.detail}</span>
              </> : 'No runes match these filters. Clear a filter to see more.'}
            </td>
          </tr>}
        </tbody>
      </DataTablePage>

    <div className="type-caption" role="status">
      <LabelSwap showing={!standardsChanged ? 'current' : refreshFailed ? 'failed'
        : !base || roles.length === 0 ? 'blocked' : 'changed'} faces={{
        current: '\u00a0',
        failed: 'Standards changed. Calculate again to retry the update.',
        blocked: 'Standards changed. Add a role and an account reference to update the verdicts.',
        changed: 'Standards changed. Updating the affected rune verdicts…',
      }} />
    </div>
  </>;
}
