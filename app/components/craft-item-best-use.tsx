import { filterIncludes, filterPair } from '../lib/filter-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AncientName } from './ancient-mark';
import { Button, FilterButton, InlineButton } from './button';
import { CalculationStatus } from './calculation-status';
import { Dropdown } from './dropdown';
import { EngravedPlace } from './engraved-place';
import { ValueSlider } from './range-slider';
import { RuneLink } from './rune-link';
import { RuneEmblem } from './rune-emblem';
import type { OpenRuneOverlay } from './rune-link';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import { formatDecimal, formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterCopyNamesIn } from '../lib/monster-names';
import { emptyRunePlacement, hasRunePlacement } from '../lib/rune-placement';
import { usePresets } from '../lib/presets-context';
import type { MonsterPreferences } from '../lib/monster-preferences';
import { craftKindLabels, craftLineageLabels, craftRollLabels, craftRollAssumptions,
  defaultCraftRollAssumption, craftSetLabel, itemGrades, missingCraftGrades, missingCraftItems,
  missingCraftLineages } from '../lib/rune-craft-items';
import type { CraftItem, CraftKind, CraftLineage, CraftRollAssumption } from '../lib/rune-craft-items';
import { craftItemRange } from '../lib/rune-craft-end-state';
import { runeStatIds, runeStatName, runeLineStat, runeLineFigure } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { GeneralSettings, ItemGrade, RunePotentialSettings } from '../lib/types';
import { referenceLines } from '../lib/rune-reference-stats';
import type { CraftBenchmark, CraftRecommendation, CraftRecommendationRequest, CraftCalculation, CraftRecommendations } from '../lib/rune-craft-recommendations';
import { craftCalculationKey, craftExtensionRequests, craftItemKey, craftRecommendationRankings, craftRuneKey, craftStatAlreadyChanged,
  extendCraftCalculation, heldCraftBenchmark, reconcileCraftCalculation,
  isHeldCraft, runeAsItStands, wantedCraftItems } from '../lib/rune-craft-recommendations';
import type { CraftRecommendationResponse } from '../lib/compute/craft-recommendation-protocol';
import { useSessionStorageState } from '../lib/session-storage-state';
import { useRuneKeepers } from './use-rune-keepers';
import { craftIgnoreKey } from '../lib/craft-ignores';
import type { CraftIgnore } from '../lib/craft-ignores';
import { readSettings, isBoolean, isOneOf, isWholeNumberIn } from '../lib/preference-reading';

/**
 * The three questions Gems & Grinds asks of one engine:
 * - `recommendations`: where the box's items do the most good;
 * - `selected`: where one chosen stack does the most good;
 * - `missing`: which items the box lacks would beat the best it can already do.
 */
export type CraftViewMode = 'recommendations' | 'selected' | 'missing';

const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
const alreadyOptions = ['yes', 'no'] as const;

/* What's missing names an item by its set, never Immemorial, and asks only
   about the grades worth chasing (`missingCraftItems`), so its two groups offer
   only those choices. */
const modeChoices: Record<CraftViewMode, { lineages: readonly CraftLineage[]; grades: readonly ItemGrade[]; storageKey: string }> = {
  recommendations: { lineages: craftLineages, grades: itemGrades, storageKey: 'jaswa.filters.craft-recommendations' },
  selected: { lineages: craftLineages, grades: itemGrades, storageKey: 'jaswa.filters.craft-best-use' },
  missing: { lineages: missingCraftLineages, grades: missingCraftGrades, storageKey: 'jaswa.filters.craft-missing' },
};

const defaultState = {
  kinds: ['grindstone'] as CraftKind[], lineages: [] as CraftLineage[], grades: [] as ItemGrade[],
  statId: '', selectedItemId: '', set: '', roll: defaultCraftRollAssumption,
  grindAfter: false, grindGrade: 'Legend' as ItemGrade, showEngraved: true, showInventory: true, count: 5,
  already: [] as Array<typeof alreadyOptions[number]>,
  /** Best use only: the runes Rune Clean-up's calculation itself keeps. */
  keepOnly: false,
};
type State = typeof defaultState;
/** Reset filters returns these and only these: the item kind, the chosen stack and the assumptions are the question, not a filter. */
const filterFields = ['lineages', 'grades', 'statId', 'set', 'showEngraved', 'showInventory', 'count', 'already', 'keepOnly'] as const;
const isString = (value: unknown) => typeof value === 'string';
const isListOf = <T,>(choices: readonly T[]) => (value: unknown) => Array.isArray(value) && value.every(isOneOf(choices));
const stateReaders = Object.fromEntries((Object.keys(modeChoices) as CraftViewMode[]).map((mode) => [mode, {
  read: (value: unknown): State => readSettings(value, defaultState, {
    kinds: (value) => Array.isArray(value) && value.length === 1 && isOneOf(craftKinds)(value[0]),
    lineages: isListOf(modeChoices[mode].lineages), grades: isListOf(modeChoices[mode].grades),
    statId: (value) => value === '' || runeStatIds.some((id) => String(id) === value),
    selectedItemId: isString, set: isString, roll: isOneOf(craftRollAssumptions), grindAfter: isBoolean,
    grindGrade: isOneOf(itemGrades), showEngraved: isBoolean, showInventory: isBoolean, count: isWholeNumberIn(1, 10),
    already: isListOf(alreadyOptions), keepOnly: isBoolean,
  }),
}])) as Record<CraftViewMode, { read: (value: unknown) => State }>;

/** `Legend Violent · SPD Grind`, with the Ancient mark drawn rather than spelled. */
function CraftItemName({ item }: { item: CraftItem }) {
  return <>
    {item.grade} <AncientName name={item.setName ?? craftLineageLabels.immemorial} ancient={item.lineage === 'ancient'} />
    {' · '}{item.statName} {craftKindLabels[item.kind]}
  </>;
}

/** What Ignore on this card waves away: the rune, and the item's kind and stat, whatever its grade or set. */
const ignoreOf = (row: CraftRecommendation): CraftIgnore => ({ runeId: row.rune.id, kind: row.item.kind, statId: row.item.statId });

/* An Immemorial item rolls what the set's own item rolls, so What's missing
   names the set's item and says on its title that either will do. */
const immemorialAlternative = (item: CraftItem) => item.amount === 0 && item.lineage === 'standard'
  ? `An Immemorial ${item.statName} ${craftKindLabels[item.kind]} of this grade fits too` : undefined;

export function CraftItemBestUse({ mode, items, runes, monsters, profiles, roles, general, settings, hardwareAcceleration, onOpenRune, calculation, onCalculated, ignores, onIgnore }: {
  mode: CraftViewMode;
  items: readonly CraftItem[]; runes: readonly Rune[]; monsters: readonly GameRecord[];
  profiles: MonsterPreferences; roles: readonly RuneRole[]; general: GeneralSettings;
  settings: RunePotentialSettings; hardwareAcceleration: boolean; onOpenRune: OpenRuneOverlay;
  calculation: CraftCalculation | null; onCalculated: (value: CraftCalculation | null) => void;
  /** This view's waved-away suggestions, or `null` where the view offers no Ignore. */
  ignores: readonly CraftIgnore[] | null;
  /** Adds an entry, or with `null` clears this view's list. */
  onIgnore?: (entry: CraftIgnore | null) => void;
}) {
  const choices = modeChoices[mode];
  const [state, setState] = useSessionStorageState(choices.storageKey, defaultState, stateReaders[mode]);
  const kind = state.kinds.length === 1 ? state.kinds[0] : 'grindstone';
  const prefix = `craft-${mode}`;
  const alreadyLabel = kind === 'grindstone' ? 'Stat already grinded' : "Stat already gem'ed";
  const format = (value: number) => formatNumber(value, general);
  const score = (value: number) => `${formatDecimal(value, general)} %`;
  const placements = usePresets();
  const namesIn = useMemo(() => monsterCopyNamesIn(monsters, profiles, placements.presets), [monsters, profiles, placements.presets]);
  const sets = useMemo(() => [...new Set(runes.map((rune) => rune.setName))].sort(), [runes]);
  const offered = useMemo(() => items.filter((item) => item.kind === kind
    && filterIncludes(state.lineages, item.lineage, choices.lineages)
    && filterIncludes(state.grades, item.grade, choices.grades)
    && (!state.statId || String(item.statId) === state.statId)), [items, kind, state.lineages, state.grades, state.statId, choices]);
  const groups = useMemo(() => {
    const found = new Map<string, CraftItem[]>();
    for (const item of offered) { const label = craftSetLabel(item); const group = found.get(label) ?? []; group.push(item); found.set(label, group); }
    return [...found].sort(([a], [b]) => a.localeCompare(b));
  }, [offered]);
  const selected = mode === 'selected' ? offered.find((item) => item.id === state.selectedItemId) : undefined;
  const base = useMemo(() => {
    const lines = referenceLines({ unit_list: monsters });
    return lines ? new Map([...lines].map(([type, line]) => [type, line.stats])) : null;
  }, [monsters]);
  const missing = useMemo(() => mode === 'missing' ? missingCraftItems(items, runes) : [], [mode, items, runes]);
  const grindPossible = [...items, ...missing].some((item) => item.kind === 'gem' &&
    craftItemRange('grindstone', item.lineage, item.statId, state.grindGrade) !== undefined);
  const request = useMemo<CraftRecommendationRequest | null>(() => base ? {
    items, missing, runes, roles, base, settings, roll: state.roll,
    grindAfter: state.grindAfter ? { grade: state.grindGrade } : null,
    preferGpu: hardwareAcceleration,
  } : null, [base, items, missing, runes, roles, settings, state.roll, state.grindAfter, state.grindGrade, hardwareAcceleration]);
  const calculationKey = useMemo(() => request ? craftCalculationKey(request) : '', [request]);
  const worker = useRef<Worker | null>(null);
  const workerRequest = useRef<CraftRecommendationRequest | null>(null);
  const [work, setWork] = useState<{ request: CraftRecommendationRequest; busy: boolean; progress: number; error?: string } | null>(null);
  const current = work?.request === request ? work : null;
  useEffect(() => () => {
    // A late cleanup of an older question must not terminate its replacement.
    if (workerRequest.current !== request) return;
    worker.current?.terminate(); worker.current = null; workerRequest.current = null;
  }, [request]);
  /* The remembered answer, brought up to the account as it is now: an item or rune
     gone takes its rows with it at once, and what is new is judged alone (below) —
     so neither a spent stone nor a live sync ever empties the page, and the reader
     stays where they were. */
  const reconciled = useMemo(() => request && calculation?.key === calculationKey
    ? reconcileCraftCalculation(calculation, [...request.items, ...request.missing], request.runes) : null, [request, calculation, calculationKey]);
  function clear() { worker.current?.terminate(); worker.current = null; workerRequest.current = null; setWork(null); onCalculated(null); }
  /**
   * Asks the worker each of `asks` in turn on behalf of `request`, whose status it
   * reports, and stores what `settle` makes of the answers once all are in.
   */
  function run(request: CraftRecommendationRequest, asks: readonly CraftRecommendationRequest[],
    settle: (results: CraftRecommendations[]) => CraftCalculation) {
    worker.current?.terminate();
    const running = new Worker(new URL('../lib/compute/craft-recommendation-worker.ts', import.meta.url), { type: 'module' });
    worker.current = running;
    workerRequest.current = request;
    setWork({ request, busy: true, progress: 0 });
    const results: CraftRecommendations[] = [];
    running.onmessage = (event: MessageEvent<CraftRecommendationResponse>) => {
      if (worker.current !== running) return;
      const message = event.data;
      if (message.type === 'progress') {
        const progress = (results.length + message.fraction) / asks.length;
        setWork((previous) => previous?.request === request ? { ...previous, progress } : previous);
        return;
      }
      if (message.type === 'result') results.push(message.result);
      if (message.type === 'result' && results.length < asks.length) { running.postMessage(asks[results.length]); return; }
      setWork({ request, busy: false, progress: 1,
        ...(message.type === 'error' ? { error: message.message } : {}) });
      if (message.type === 'result') onCalculated(settle(results));
      running.terminate(); worker.current = null; workerRequest.current = null;
    };
    running.onerror = () => {
      if (worker.current !== running) return;
      setWork({ request, busy: false, progress: 0, error: 'The craft worker could not finish. Try calculating again.' });
      running.terminate(); worker.current = null; workerRequest.current = null;
    };
    running.postMessage(asks[0]);
  }
  function calculate() {
    if (!request) return;
    run(request, [request], ([result]) => ({ key: calculationKey,
      items: [...request.items, ...request.missing].map(craftItemKey), runes: request.runes.map(craftRuneKey), result }));
  }
  /* Only what the answer has never judged is asked, once per account state: a
     failed extension is reported rather than retried in a loop. */
  useEffect(() => {
    if (!request || !calculation || !reconciled || work?.request === request) return;
    const asks = craftExtensionRequests(request, reconciled);
    if (!asks.length) return;
    const { addedItems, addedRunes } = reconciled;
    let current = true;
    /* Started from a microtask, as the worker's own answers are, so the effect never sets state as it runs. */
    void Promise.resolve().then(() => {
      if (!current) return;
      run(request, asks, (results) => extendCraftCalculation(calculation, results, addedItems, addedRunes));
    });
    return () => { current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is redeclared every render; the answer it extends is in the list.
  }, [request, calculation, reconciled, work?.request]);
  const update = <K extends keyof State,>(key: K, value: State[K]) => setState((previous) => ({ ...previous, [key]: value }));
  const toggle = <K extends 'lineages' | 'grades' | 'already',>(key: K, value: State[K][number]) => setState((previous) => {
    const chosen = previous[key] as readonly string[];
    return { ...previous, [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value] };
  });
  const choiceGroup = <T extends string,>(label: string, area: string, values: readonly T[], isActive: (value: T) => boolean,
    onToggle: (value: T) => void, display: (value: T) => string, title?: (value: T) => string, accessibleLabel = label) =>
    <div className={`filter-group craft-view-${area}`} role="group" aria-label={accessibleLabel}>
      <span className="filter-label">{label}</span>
      <div className="filter-group-controls">{values.map((value) => <FilterButton key={value} active={isActive(value)}
        title={title?.(value)} onClick={() => onToggle(value)}>{display(value)}</FilterButton>)}</div>
    </div>;
  const result = reconciled?.result;
  const adviceInputs = useMemo(() => ({ data: { unit_list: monsters } as GameRecord, settings, roles }), [monsters, settings, roles]);
  /* Asked only once there is an answer to narrow, so the filter alone never
     starts Rune Clean-up's worker on an empty page. */
  const keepers = useRuneKeepers({ enabled: mode === 'selected' && state.keepOnly && result !== undefined,
    runes, inputs: adviceInputs, base, hardwareAcceleration });
  /* The runes the rankings may show: Clean-up's answer, or while it is being
     brought up to date the one before it, so an update never empties the page. */
  const keepSet = keepers.state === 'ready' ? keepers.keep : keepers.state === 'pending' ? keepers.previous : null;
  const keepersSettled = keepers.state === 'off' || keepSet !== null;
  const ignored = useMemo(() => new Set((ignores ?? []).map(craftIgnoreKey)), [ignores]);
  /* The box's best on each rune comes from the whole answer, so a filter that
     hides a held item cannot lower the bar a missing one has to clear. */
  const benchmark = useMemo<CraftBenchmark>(() => mode === 'missing' && result ? heldCraftBenchmark(result.candidates) : runeAsItStands,
    [mode, result]);
  const visible = useMemo(() => result?.candidates.filter((row) => row.item.kind === kind
    && isHeldCraft(row) === (mode !== 'missing')
    && (!selected || row.item.id === selected.id)
    && filterIncludes(state.lineages, row.item.lineage, choices.lineages)
    && filterIncludes(state.grades, row.item.grade, choices.grades)
    && (!state.statId || String(row.item.statId) === state.statId)
    && (!state.set || row.rune.setName === state.set)
    && filterIncludes(state.already, craftStatAlreadyChanged(row.rune, row.item) ? 'yes' : 'no', alreadyOptions)
    && filterPair(hasRunePlacement(placements.runes.get(row.rune.id) ?? emptyRunePlacement), state.showEngraved, state.showInventory)
    && (keepSet === null || keepSet.has(row.rune.id))
    && !ignored.has(craftIgnoreKey(ignoreOf(row)))) ?? [],
  [result, kind, mode, selected, state.lineages, state.grades, state.statId, state.set, state.already, state.showEngraved, state.showInventory, placements, choices, keepSet, ignored]);
  const rankings = useMemo(() => craftRecommendationRankings(visible, state.count, benchmark), [visible, state.count, benchmark]);
  const wanted = useMemo(() => mode === 'missing' ? wantedCraftItems(visible, state.count, benchmark) : [], [mode, visible, state.count, benchmark]);
  const empty = base === null ? 'A level 40 monster is needed to score runes.' : !roles.length ? 'Add a role in Rune Clean-up to judge these runes.'
    : mode === 'missing' ? (!runes.length ? 'Import runes to see what they are missing.' : null)
      : !items.length ? 'Import gems and grindstones to calculate.' : null;
  function runeCard(row: CraftRecommendation) {
    const rune = row.rune;
    return <article className="craft-recommendation" key={rune.id}>
      <div className="craft-recommendation-head">
        <h4 className="craft-recommendation-title" title={immemorialAlternative(row.item)}><CraftItemName item={row.item} /></h4>
        {onIgnore && <InlineButton onClick={() => onIgnore(ignoreOf(row))}
          aria-label={`Ignore ${row.item.statName} ${craftKindLabels[row.item.kind]} on this ${rune.setName} rune`}
          title={`Stop suggesting ${row.item.statName} ${craftKindLabels[row.item.kind]}s for this rune here`}>Ignore</InlineButton>}
      </div>
      <header className="craft-rune-header">
        <RuneEmblem setName={rune.setName} slot={rune.slot} />
        <div className="craft-rune-identity">
          <RuneLink target={{ kind: 'account', runeId: rune.id }} label={`${rune.setName} rune, slot ${rune.slot}`} onOpen={onOpenRune}>
            <AncientName name={rune.setName} ancient={rune.ancient} />
          </RuneLink>
          <dl className="craft-rune-facts">{[['Slot', rune.slot], ['Grade', `${rune.stars}★`], ['Rarity', rune.rarity], ['Level', `+${rune.level}`]].map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </header>
      <dl className="craft-rune-location">
        <dt>Location</dt><dd><EngravedPlace runePlacement={placements.runes.get(rune.id) ?? emptyRunePlacement} presets={placements.presets}
          monsterName={(id: string, presetId: string) => namesIn(id, presetId) ?? 'A monster not in this import'} /></dd>
      </dl>
      <div className="craft-rune-properties">
        <div className="craft-rune-main type-body-emphasis" aria-label="Main property">
          {runeLineStat(rune.mainStatId)} {runeLineFigure(rune.mainStatId, rune.mainValue, format)}
        </div>
        <div className="craft-rune-innate" aria-label="Innate property">
          {rune.prefixStatId !== null
            ? <RuneInnateLine statId={rune.prefixStatId} value={rune.prefixValue} format={format} />
            : 'No innate'}
        </div>
        <span className="craft-after-label type-caption" aria-hidden="true">After</span>
        <table className="craft-recommendation-lines" aria-label="Craft improvement">
          <thead className="visually-hidden"><tr><th>Sub property</th><th>After</th></tr></thead>
          <tbody>{Array.from({ length: 4 }, (_, at) => <tr key={at}>
            <td>{rune.subProperties[at] ? <RuneSubLine property={rune.subProperties[at]} format={format} /> : '—'}</td>
            <td>{at === row.application.target.index ? <RuneSubLine property={row.application.result} format={format} showGrindStep /> : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <dl className="craft-evaluation">
        <div><dt>Best role</dt><dd>{row.after.role}</dd></div>
        <div><dt>Score</dt><dd className="craft-score-change"><span className="muted">{score(row.before.score)}</span> → {score(row.after.score)}</dd></div>
        {/* The bar the missing item cleared: the best the box's own items reach on this rune. */}
        {mode === 'missing' && <div><dt>Your box</dt><dd>{score(benchmark.score(row))}</dd></div>}
      </dl>
    </article>;
  }
  function ranking(title: string, rows: readonly CraftRecommendation[], suffix = '') {
    return <section className="craft-ranking" aria-label={title + suffix}>
      <h3>{title}{suffix && <span className="muted"> · {suffix}</span>}</h3>
      {rows.length ? rows.map(runeCard) : <p className="best-artifact-empty">No matching improvements.</p>}
    </section>;
  }

  return <div className="craft-best-use" data-mode={mode}>
    {/* The question: which kind of item, which stack where there is one to
        choose, what each roll is assumed to give, and the button that asks it.
        Everything in the panel below only narrows the answer. */}
    <div className="filter-panel craft-question">
      {choiceGroup('Item', 'kind', craftKinds, (value) => kind === value, (value) => update('kinds', [value]),
        (value) => value === 'gem' ? 'Enchanted gem' : 'Grindstone')}
      {mode === 'selected' && <div className="filter-group craft-view-select">
        <label className="filter-label" htmlFor={`${prefix}-item`}>Craft item</label><div className="filter-group-controls">
          <Dropdown id={`${prefix}-item`} value={selected?.id ?? ''} placeholder="Any item" aria-label="Choose a gem or grindstone to place"
            onChange={(event) => update('selectedItemId', event.target.value)}>
            {groups.map(([label, entries]) => <optgroup key={label} label={label}>{entries.map((item) => <option key={item.id} value={item.id}>
              {craftKindLabels[item.kind]} · {craftSetLabel(item)} · {item.statName} · {item.grade} · {format(item.amount)} held
            </option>)}</optgroup>)}</Dropdown></div></div>}
      <div className="filter-group craft-view-roll"><label className="filter-label" htmlFor={`${prefix}-roll`}>Assumed roll</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-roll`} value={state.roll} aria-label="How well the roll is assumed to land" onChange={(event) => update('roll', event.target.value as CraftRollAssumption)}>
          {craftRollAssumptions.map((roll) => <option key={roll} value={roll}>{craftRollLabels[roll]}</option>)}</Dropdown></div></div>
      <div className="filter-group craft-view-grind" role="group" aria-label="Grind the gemmed property afterwards" style={{ visibility: kind === 'gem' ? undefined : 'hidden' }}>
        <span className="filter-label">Then grind it</span><div className="filter-group-controls"><FilterButton active={state.grindAfter} disabled={!grindPossible}
          title={grindPossible ? 'Grind the gemmed property at the assumed grade and roll' : 'The offered item stats cannot be ground'} onClick={() => update('grindAfter', !state.grindAfter)}>Yes</FilterButton>
          <Dropdown value={state.grindGrade} disabled={!state.grindAfter || !grindPossible} aria-label="Grade of the grindstone to assume"
            onChange={(event) => update('grindGrade', event.target.value as ItemGrade)}>{itemGrades.map((grade) => <option key={grade}>{grade}</option>)}</Dropdown></div></div>
      <div className="craft-calculation-actions">
        <Button tone="primary" size="prominent" busy={current?.busy} busyLabel="Calculating…" disabled={Boolean(empty) || current?.busy}
          onClick={calculate}>Calculate</Button>
        <Button disabled={!current && !result} onClick={clear}>Clear results</Button>
        <Button disabled={!current?.busy} onClick={clear}>Cancel</Button>
      </div>
      <div className="craft-calculation-status">
        {current?.busy || current?.error || !result
          ? <p className="calculation-status" role="status">{current?.busy ? `Calculating… ${Math.floor(current.progress * 100)} %` : current?.error ?? empty ?? ''}</p>
          : keepers.state === 'pending' || keepers.state === 'failed'
            ? <p className="calculation-status" role="status">{keepers.state === 'failed' ? keepers.message
              /* Clean-up's own words for its two phases, so the wait reads the same on both pages. */
              : keepers.calibration !== null
                ? `Calibrating Rune Clean-up… ${format(Math.round(keepers.calibration * 100))} % · only needed once`
                : `Asking Rune Clean-up which runes it keeps… ${format(Math.floor(keepers.progress * 100))} %`}</p>
            : <CalculationStatus durationMs={result.durationMs} backend={result.backend} general={general} detail={`${format(result.comparisons)} build comparisons`} />}
      </div>
    </div>
    {/* Two rows with one subject each — the item, then the rune it goes on —
        and the length of every ranking with the way back beside them. */}
    <div className="filter-panel craft-best-use-filters">
      {choiceGroup('Family', 'lineage', choices.lineages, (value) => state.lineages.includes(value), (value) => toggle('lineages', value),
        (value) => craftLineageLabels[value])}
      {choiceGroup('Grade', 'grade', choices.grades, (value) => state.grades.includes(value), (value) => toggle('grades', value),
        (value) => value.slice(0, 3).toUpperCase(), (value) => value)}
      <div className="filter-group craft-view-stat"><label className="filter-label" htmlFor={`${prefix}-stat`}>Stat</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-stat`} value={state.statId} placeholder="Any stat" aria-label="Narrow the list to one stat" onChange={(event) => update('statId', event.target.value)}>
          {runeStatIds.map((id) => <option key={id} value={id}>{runeStatName(id)}</option>)}</Dropdown></div></div>
      <div className="filter-group craft-view-count"><span className="filter-label">Per ranking</span><div className="filter-group-controls">
        <ValueSlider minimum={1} maximum={10} value={state.count} label="Number of runes listed in each ranking" valueText={(value) => `${value} runes in each ranking`}
          onChange={(count) => update('count', count)} /></div></div>
      <div className="filter-group craft-view-set"><label className="filter-label" htmlFor={`${prefix}-set`}>Rune set</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-set`} value={state.set ?? ''} placeholder="Any rune set" aria-label="Filter candidate runes by set"
          onChange={(event) => update('set', event.target.value)}>{sets.map((set) => <option key={set}>{set}</option>)}</Dropdown></div></div>
      {choiceGroup('Location', 'location', ['showEngraved', 'showInventory'] as const, (key) => state[key], (key) => update(key, !state[key]),
        (key) => key === 'showEngraved' ? 'Engraved' : 'Inventory', undefined, 'Choose rune locations')}
      {choiceGroup(alreadyLabel, 'already', alreadyOptions, (value) => state.already.includes(value), (value) => toggle('already', value),
        (value) => value === 'yes' ? 'Yes' : 'No')}
      {/* Rune Clean-up's calculated Keep, read past the sell safeguards: Power up,
          Re-app, Refine and a rune kept only by a safeguard all stay out. */}
      {mode === 'selected' && choiceGroup('Only keep-runes', 'keep', ['yes'] as const, () => state.keepOnly,
        () => update('keepOnly', !state.keepOnly), () => 'Yes', () => 'Only runes whose calculated Rune Clean-up verdict is Keep')}
      <div className="filter-panel-actions craft-view-actions">
        <Button className="filter-reset" onClick={() => setState((previous) => ({ ...previous,
          ...Object.fromEntries(filterFields.map((field) => [field, defaultState[field]])) }))}
        aria-label={`Reset ${{ recommendations: 'recommendations', selected: 'best use', missing: "what's missing" }[mode]} filters`}>Reset filters</Button>
        {/* Kept mounted while there is nothing to reset, so the panel never changes height. */}
        {onIgnore && <Button className="filter-reset" disabled={!ignores?.length} onClick={() => onIgnore(null)}
          title={ignores?.length ? `Suggest again the ${format(ignores.length)} ignored here` : 'Nothing is ignored here'}>Reset ignored</Button>}
      </div>
    </div>
    {result && keepersSettled && <div className="craft-best-use-results" data-kind={kind}>
      {mode === 'missing' && <section className="craft-wanted" aria-label="Most wanted">
        <h3>Most wanted</h3>
        {wanted.length ? <table className="craft-wanted-table">
          <thead><tr>
            <th scope="col">Item</th>
            <th scope="col" title="Runes on which this is the missing item that lifts them furthest past your box">Runes</th>
            <th scope="col" title="The largest score gain over your box on one of those runes">Top gain</th>
          </tr></thead>
          <tbody>{wanted.map((entry) => <tr key={entry.item.id}>
            <td title={immemorialAlternative(entry.item)}><CraftItemName item={entry.item} /></td>
            <td>{format(entry.runes)}</td>
            <td>+{score(entry.topGain)}</td>
          </tr>)}</tbody>
        </table> : <p className="best-artifact-empty">Your box already holds the best item for every rune shown.</p>}
      </section>}
      {ranking('Highest score', rankings.highestScore)}{ranking('Highest gain', rankings.highestGain)}
      {kind === 'grindstone' && <div className="craft-stat-rankings">{rankings.highestStat.size ? [...rankings.highestStat].sort(([a], [b]) => a - b).map(([stat, rows]) =>
        <div key={stat}>{ranking('Highest stat', rows, runeStatName(stat))}</div>) : ranking('Highest stat', [])}</div>}
    </div>}
  </div>;
}
