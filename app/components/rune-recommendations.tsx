import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, FilterButton } from './button';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { RangeSlider } from './range-slider';
import { alignmentClass, runeCleanupTableColumns } from '../lib/table-layouts';
import { readRunes, runeMaximumLevel, runeStatName, runeSubValue } from '../lib/runes';
import { runeAdvice, runeVerdictLabels, runeVerdictOrder } from '../lib/rune-cleanup-advice';
import type { RuneVerdict } from '../lib/rune-cleanup-advice';
import { noReferenceLineMessage, referenceLines } from '../lib/rune-reference-stats';
import {
  compareRuneCleanupRows, defaultRuneCleanupSortDirections, runeCleanupSearchText,
} from '../lib/rune-cleanup-grid';
import type { RuneCleanupRow, RuneCleanupSortKey } from '../lib/rune-cleanup-grid';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import type { GameRecord } from '../lib/game-data';
import type { ImportedGame, RunePotentialSettings } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';

/* Nine of the game's own set names, and the slots and levels a rune can have.
   Listed rather than derived from the import so the filter strip does not change
   shape when a different account is loaded. */
const slotOptions = [1, 2, 3, 4, 5, 6];

type RuneFilterState = {
  search: string;
  selectedSets: string[];
  selectedSlots: number[];
  selectedVerdicts: RuneVerdict[];
  selectedPresets: string[];
  selectedMains: number[];
  lowestLevel: number;
  highestLevel: number;
  showEquipped: boolean;
  showStored: boolean;
};

const defaultRuneFilters: RuneFilterState = {
  search: '', selectedSets: [], selectedSlots: [], selectedVerdicts: [], selectedPresets: [],
  selectedMains: [], lowestLevel: 0, highestLevel: runeMaximumLevel,
  showEquipped: true, showStored: true,
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
    && level(candidate.lowestLevel) && level(candidate.highestLevel)
    && (candidate.lowestLevel as number) <= (candidate.highestLevel as number)
    && typeof candidate.showEquipped === 'boolean' && typeof candidate.showStored === 'boolean';
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
  });
  return [
    column('set', 'Set'),
    column('slot', 'Slot'),
    column('main', 'Main'),
    column('subs', 'Sub properties'),
    column('level', 'Lv.'),
    column('preset', 'Best preset'),
    column('maxValue', <span className="table-heading-two-line" aria-label="Max value: the best end state it can reach">Max<br />value</span>),
    column('chance', <span className="table-heading-two-line" aria-label="Chance to reach the threshold by +12">Chance</span>),
    column('advice', 'Advice'),
  ];
})();

/**
 * The verdict table — the answer the whole workspace exists to give.
 *
 * It sits **above** Settings and Presets because it is what the user came for; the
 * two panels below it are the controls that shape it. The calculation waits for the
 * button rather than running as sliders move: it reads every rune against every
 * preset and every build, and a table that re-ran itself under a dragging thumb
 * would be a table nobody could read.
 */
export function RuneRecommendations({ game, settings, presets }: {
  game: ImportedGame | null;
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.rune-cleanup', defaultRuneFilters, isRuneFilterState,
  );
  const { search, selectedSets, selectedSlots, selectedVerdicts, selectedPresets, selectedMains,
    lowestLevel, highestLevel, showEquipped, showStored } = filters;

  /* The held result, and the settings it answers. A result is kept until the user
     asks for another one, so a slider moved after a calculation leaves the table
     standing and says it is out of date rather than silently changing under them. */
  const [result, setResult] = useState<{ rows: RuneCleanupRow[]; at: string; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const runes = useMemo(() => readRunes(game?.data), [game]);
  const monsterNames = useMemo(() => {
    const names = new Map<string, string>();
    const units = game?.data?.unit_list;
    if (Array.isArray(units)) {
      for (const unit of units as GameRecord[]) {
        const id = unit?.unit_id;
        if (typeof id === 'number') names.set(String(id), String(unit.unit_master_id ?? id));
      }
    }
    return names;
  }, [game]);

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

  function calculate() {
    if (!base) return;
    setBusy(true);
    /* Off the click's own frame, so the button can paint its busy label before the
       main thread is taken for a second or two. */
    window.setTimeout(() => {
      const started = performance.now();
      const advice = runeAdvice(runes, presets, settings, base);
      setResult({
        rows: runes.map((rune, index) => ({
          rune,
          index,
          advice: advice.get(rune.id) ?? {
            verdict: 'sell', reason: '', maxValue: 0, chance: 0, preset: null, rank: 'broken',
          },
          wornBy: rune.occupiedId === null ? null : monsterNames.get(rune.occupiedId) ?? rune.occupiedId,
        })),
        at: new Date().toISOString(),
        ms: performance.now() - started,
      });
      setBusy(false);
    }, 0);
  }

  const rows = useMemo(() => result?.rows ?? [], [result]);
  const setOptions = useMemo(
    () => [...new Set(runes.map((rune) => rune.setName))].sort((a, b) => a.localeCompare(b)),
    [runes],
  );
  const mainOptions = useMemo(
    () => [...new Set(runes.map((rune) => rune.mainStatId))].sort((a, b) => a - b),
    [runes],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showEquipped && row.wornBy !== null) return false;
      if (!showStored && row.wornBy === null) return false;
      if (selectedSets.length && !selectedSets.includes(row.rune.setName)) return false;
      if (selectedSlots.length && !selectedSlots.includes(row.rune.slot)) return false;
      if (selectedVerdicts.length && !selectedVerdicts.includes(row.advice.verdict)) return false;
      if (selectedPresets.length && !selectedPresets.includes(row.advice.preset?.name ?? '')) return false;
      if (selectedMains.length && !selectedMains.includes(row.rune.mainStatId)) return false;
      if (row.rune.level < lowestLevel || row.rune.level > highestLevel) return false;
      if (!term) return true;
      return runeCleanupSearchText(row).includes(term);
    });
  }, [rows, search, selectedSets, selectedSlots, selectedVerdicts, selectedPresets, selectedMains,
    lowestLevel, highestLevel, showEquipped, showStored]);

  const { sorted, sort, toggle } = useSortedRows(
    visible, columns, { key: 'maxValue', direction: 'descending' },
  );

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
  ) => <div className={`filter-group ${className}`} role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {options.map((option) => <FilterButton
        key={option}
        active={selected.includes(option)}
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
      <p className="next-step">Add one under Presets below to say what a rune should be worth.</p>
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
          Press Calculate to judge every rune against every preset. Settings and Presets below decide what
          it is looking for.
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
          {toggleGroup('Advice', 'Filter by advice', runeVerdictOrder, selectedVerdicts,
            'selectedVerdicts', (verdict) => runeVerdictLabels[verdict], 'rune-filter-advice')}
          {toggleGroup('Slot', 'Filter by slot', slotOptions, selectedSlots,
            'selectedSlots', (slot) => String(slot), 'rune-filter-slot')}
          {toggleGroup('Set', 'Filter by rune set', setOptions, selectedSets,
            'selectedSets', (name) => name, 'rune-filter-set')}
          {toggleGroup('Main', 'Filter by main property', mainOptions, selectedMains,
            'selectedMains', (statId) => runeStatName(statId) ?? '?', 'rune-filter-main')}
          {toggleGroup('Preset', 'Filter by best-matching preset',
            presets.map((preset) => preset.name), selectedPresets,
            'selectedPresets', (name) => name, 'rune-filter-preset')}
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
          <div className="filter-group rune-filter-usage" role="group" aria-label="Choose which runes to include">
            <span className="filter-label">Where</span>
            <div className="filter-group-controls">
              <FilterButton active={showEquipped}
                onClick={() => setFilters((current) => ({ ...current, showEquipped: !current.showEquipped }))}
              >Equipped</FilterButton>
              <FilterButton active={showStored}
                onClick={() => setFilters((current) => ({ ...current, showStored: !current.showStored }))}
              >In the box</FilterButton>
            </div>
          </div>
          <FilterSummary visible={visible.length} total={rows.length} noun="runes"
            onReset={() => setFilters(defaultRuneFilters)} className="rune-filter-status" />
        </>}
      >
        <tbody>
          {sorted.length ? sorted.map((row) => <tr key={row.rune.id}>
            <td className={cell('set')}>{row.rune.setName}</td>
            <td className={cell('slot')}>{row.rune.slot}</td>
            <td className={cell('main')}>{runeStatName(row.rune.mainStatId) ?? '—'}</td>
            <td className={cell('subs', 'rune-subs')}>
              {row.rune.subProperties.length === 0
                ? <span className="muted">—</span>
                : row.rune.subProperties.map((property, at) => <span className="rune-sub" key={at}>
                  <span className="rune-sub-name">{runeStatName(property.statId) ?? '?'}</span>
                  <span className="rune-sub-value">{runeSubValue(property)}</span>
                </span>)}
            </td>
            <td className={cell('level')}>+{row.rune.level}</td>
            <td className={cell('preset', !row.advice.preset && 'muted')}>
              {row.advice.preset?.name ?? '—'}
            </td>
            {/* The two figures the verdict is made of, printed beside it so the
                advice is arguable rather than something to be taken on trust. */}
            <td className={cell('maxValue')}>
              {row.advice.preset ? `${Math.round(row.advice.maxValue * 100)} %` : <span className="muted">—</span>}
            </td>
            <td className={cell('chance')}>
              {row.advice.preset ? `${Math.round(row.advice.chance * 100)} %` : <span className="muted">—</span>}
            </td>
            <td className={cell('advice')} title={row.wornBy ? `Worn by monster ${row.wornBy}` : 'In the box'}>
              <span className="rune-verdict" data-verdict={row.advice.verdict}>
                {runeVerdictLabels[row.advice.verdict]}
              </span>
              <span className="rune-advice-reason">{row.advice.reason}</span>
            </td>
          </tr>) : <tr>
            <td className="table-empty-state" colSpan={runeCleanupTableColumns.length}>
              No runes match these filters. Clear a filter to see more.
            </td>
          </tr>}
        </tbody>
      </DataTablePage>}

    {result && <p className="calculation-status" role="status">
      {rows.length.toLocaleString('en')} runes judged against {presets.length} presets
      {' · '}{Math.round(result.ms).toLocaleString('en')} ms
    </p>}
  </div>;
}
