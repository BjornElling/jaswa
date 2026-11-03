import { filterIncludes, filterPair } from '../lib/filter-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AncientName } from './ancient-mark';
import { Button, FilterButton, InlineButton, LabelSwap } from './button';
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
  craftSetLabel, itemGrades, missingCraftItems } from '../lib/rune-craft-items';
import type { CraftItem, CraftRollAssumption } from '../lib/rune-craft-items';
import { craftChangeOptions, craftFilterFields, craftKinds, craftSuggestionCounts, craftViewOffers, defaultCraftViewChoice } from '../lib/craft-view-choices';
import type { CraftViewChoice, CraftViewMode } from '../lib/craft-view-choices';
import { craftItemRange } from '../lib/rune-craft-end-state';
import { runeStatIds, runeStatName, runeLineStat, runeLineFigure } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { GeneralSettings, ItemGrade, RunePotentialSettings } from '../lib/types';
import { referenceLines } from '../lib/rune-reference-stats';
import type { CraftBenchmark, CraftRecommendation, CraftRecommendationRequest, CraftCalculation, CraftRecommendations } from '../lib/rune-craft-recommendations';
import { craftCalculationKey, craftExtensionRequests, craftItemKey, craftRecommendationRankings, craftRuneKey, craftMatchesChangeFilter,
  desirableGemStats, extendCraftCalculation, gemStatReferences, heldCraftBenchmark, reconcileCraftCalculation,
  isHeldCraft, onDesirableGemStat, runeAsItStands, wantedCraftItems } from '../lib/rune-craft-recommendations';
import type { CraftRecommendationResponse } from '../lib/compute/craft-recommendation-protocol';
import { useRuneKeepers } from './use-rune-keepers';
import { craftIgnoreKey } from '../lib/craft-ignores';
import type { CraftIgnore } from '../lib/craft-ignores';

type State = CraftViewChoice;

/** `Legend Violent · SPD Grind`, with the Ancient mark drawn rather than spelled. */
function CraftItemName({ item }: { item: CraftItem }) {
  return <>
    {item.grade} <AncientName name={item.setName ?? craftLineageLabels.immemorial} ancient={item.lineage === 'ancient'} />
    {' · '}{item.statName} {craftKindLabels[item.kind]}
  </>;
}

/** What Ignore on this card waves away: the rune, and the item's kind and stat, whatever its grade or set. */
/* Most wanted's own length, apart from the rankings': its box keeps this many
   rows whatever the answer, so the column beside it never changes height. */
const wantedLength = 10;
const ignoreOf = (row: CraftRecommendation): CraftIgnore => ({ runeId: row.rune.id, kind: row.item.kind, statId: row.item.statId });

/* An Immemorial item rolls what the set's own item rolls, so What's missing
   names the set's item and says on its title that either will do. */
const immemorialAlternative = (item: CraftItem) => item.amount === 0 && item.lineage === 'standard'
  ? `An Immemorial ${item.statName} ${craftKindLabels[item.kind]} of this grade fits too` : undefined;

export function CraftItemBestUse({ mode, items, runes, monsters, profiles, roles, general, settings, hardwareAcceleration, onOpenRune, calculation, onCalculated, ignores, onIgnore, choice: state, onChoiceChange: setState }: {
  mode: CraftViewMode;
  items: readonly CraftItem[]; runes: readonly Rune[]; monsters: readonly GameRecord[];
  profiles: MonsterPreferences; roles: readonly RuneRole[]; general: GeneralSettings;
  settings: RunePotentialSettings; hardwareAcceleration: boolean; onOpenRune: OpenRuneOverlay;
  calculation: CraftCalculation | null; onCalculated: (value: CraftCalculation | null) => void;
  /** The same waved-away suggestions in every Gems & Grinds view. */
  ignores: readonly CraftIgnore[];
  /** Adds an entry, or with `null` clears the shared list. */
  onIgnore: (entry: CraftIgnore | null) => void;
  /** This view's question and filters, saved with the preferences so they outlast a restart. */
  choice: CraftViewChoice;
  onChoiceChange: (update: (current: CraftViewChoice) => CraftViewChoice) => void;
}) {
  const choices = craftViewOffers[mode];
  const kind = state.kind;
  const prefix = `craft-${mode}`;
  const alreadyLabel = kind === 'grindstone' ? 'Stat already grinded' : "Can change gem'ed stat?";
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
  /* What's missing judges every absent item; the box's views judge the absent
     Legend Gems too, unseen, so every Gem stat has an entrant in its rune's contest. */
  const missing = useMemo(() => mode === 'missing' ? missingCraftItems(items, runes)
    : gemStatReferences(runes), [mode, items, runes]);
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
  /* Reconciliation plans the next answer. It must not publish a partial one:
     a changed rune can still lead the same ranking once its new answer is in. */
  const reconciled = useMemo(() => request && calculation?.key === calculationKey
    ? reconcileCraftCalculation(calculation, [...request.items, ...request.missing], request.runes) : null, [request, calculation, calculationKey]);
  const extensions = useMemo(() => request && reconciled ? craftExtensionRequests(request, reconciled) : [], [request, reconciled]);
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
    const asks = extensions;
    /* Removals and quantity-only changes need no worker, but must retire the
       old snapshot too: a later addition must not bring a sold rune back. */
    const items = [...request.items, ...request.missing];
    const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((key, at) => key === right[at]);
    if (!asks.length && same(calculation.items, items.map(craftItemKey)) && same(calculation.runes, request.runes.map(craftRuneKey))
      && reconciled.result.candidates.length === calculation.result.candidates.length
      && reconciled.result.candidates.every((row, at) => row === calculation.result.candidates[at])) return;
    let current = true;
    /* Started from a microtask, as the worker's own answers are, so the effect never sets state as it runs. */
    void Promise.resolve().then(() => {
      if (!current) return;
      if (asks.length) run(request, asks, (results) => extendCraftCalculation(calculation, results, items, request.runes));
      else onCalculated(extendCraftCalculation(calculation, [], items, request.runes));
    });
    return () => { current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is redeclared every render; the answer it extends is in the list.
  }, [request, calculation, reconciled, extensions, work?.request]);
  const update = <K extends keyof State,>(key: K, value: State[K]) => setState((previous) => ({ ...previous, [key]: value }));
  const toggle = <K extends 'lineages' | 'grades' | 'already',>(key: K, value: State[K][number]) => setState((previous) => {
    const chosen = previous[key] as readonly string[];
    return { ...previous, [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value] };
  });
  const choiceGroup = <T extends string,>(label: string, area: string, values: readonly T[], isActive: (value: T) => boolean,
    onToggle: (value: T) => void, display: (value: T) => string, title?: (value: T) => string, accessibleLabel = label, shownLabel: ReactNode = label) =>
    <div className={`filter-group craft-view-${area}`} role="group" aria-label={accessibleLabel}>
      <span className="filter-label">{shownLabel}</span>
      <div className="filter-group-controls">{values.map((value) => <FilterButton key={value} active={isActive(value)}
        title={title?.(value)} onClick={() => onToggle(value)}>{display(value)}</FilterButton>)}</div>
    </div>;
  /* Keep one complete answer on screen until every extension has finished,
     including on failure. Clear and a different calculation question still
     discard it explicitly. */
  const result = reconciled ? extensions.length ? calculation?.result : reconciled.result : undefined;
  const adviceInputs = useMemo(() => ({ data: { unit_list: monsters } as GameRecord, settings, roles }), [monsters, settings, roles]);
  /* Asked only once there is an answer to narrow, so the filter alone never
     starts Rune Clean-up's worker on an empty page. */
  const keepers = useRuneKeepers({ enabled: mode === 'selected' && state.keepOnly && result !== undefined,
    runes, inputs: adviceInputs, base, hardwareAcceleration });
  /* The runes the rankings may show: Clean-up's answer, or while it is being
     brought up to date the one before it, so an update never empties the page. */
  const keepSet = keepers.state === 'ready' ? keepers.keep : keepers.state === 'pending' ? keepers.previous : null;
  const keepersSettled = keepers.state === 'off' || keepSet !== null;
  const ignored = useMemo(() => new Set(ignores.map(craftIgnoreKey)), [ignores]);
  const desirable = useMemo(() => result
    ? desirableGemStats(result.candidates, (row) => ignored.has(craftIgnoreKey(ignoreOf(row)))) : new Map<string, ReadonlySet<number>>(),
  [result, ignored]);
  /* The box's best on each rune comes from the whole answer, so a filter that
     hides a held item cannot lower the bar a missing one has to clear. A held Gem
     of a lesser stat is not part of it: it is never suggested, so the box cannot
     count it as done. */
  const benchmark = useMemo<CraftBenchmark>(() => mode === 'missing' && result
    ? heldCraftBenchmark(result.candidates.filter((row) => onDesirableGemStat(row, desirable))) : runeAsItStands,
  [mode, result, desirable]);
  const visible = useMemo(() => result?.candidates.filter((row) => row.item.kind === kind
    && isHeldCraft(row) === (mode !== 'missing')
    && onDesirableGemStat(row, desirable)
    && (!selected || row.item.id === selected.id)
    && filterIncludes(state.lineages, row.item.lineage, choices.lineages)
    && filterIncludes(state.grades, row.item.grade, choices.grades)
    && (!state.statId || String(row.item.statId) === state.statId)
    && (!state.set || row.rune.setName === state.set)
    && craftMatchesChangeFilter(row.rune, row.item, { grinded: state.already, gemChange: state.gemChange })
    && filterPair(hasRunePlacement(placements.runes.get(row.rune.id) ?? emptyRunePlacement), state.showEngraved, state.showInventory)
    && (keepSet === null || keepSet.has(row.rune.id))
    && !ignored.has(craftIgnoreKey(ignoreOf(row)))) ?? [],
  [result, kind, mode, selected, desirable, state.lineages, state.grades, state.statId, state.set, state.already, state.gemChange, state.showEngraved, state.showInventory, placements, choices, keepSet, ignored]);
  const rankings = useMemo(() => craftRecommendationRankings(visible, state.count, benchmark), [visible, state.count, benchmark]);
  const wanted = useMemo(() => mode === 'missing' ? wantedCraftItems(visible, wantedLength, benchmark) : [], [mode, visible, benchmark]);
  const empty = base === null ? 'A level 40 monster is needed to score runes.' : !roles.length ? 'Add a role in Rune Clean-up to judge these runes.'
    : mode === 'missing' ? (!runes.length ? 'Import runes to see what they are missing.' : null)
      : !items.length ? 'Import gems and grindstones to calculate.' : null;
  function runeCard(row: CraftRecommendation) {
    const rune = row.rune;
    return <article className="craft-recommendation" key={rune.id}>
      <div className="craft-recommendation-head">
        <h4 className="craft-recommendation-title" title={immemorialAlternative(row.item)}><CraftItemName item={row.item} /></h4>
        <InlineButton onClick={() => onIgnore(ignoreOf(row))}
          aria-label={`Ignore ${row.item.statName} ${craftKindLabels[row.item.kind]} on this ${rune.setName} rune`}
          title={`Stop suggesting ${row.item.statName} ${craftKindLabels[row.item.kind]}s for this rune throughout Gems & Grinds`}>Ignore</InlineButton>
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

  /* The buttons that ask, in Rune Optimization's order: Clear results, Calculate, and its stop as a mark beside it rather than a second button of its weight. */
  const actions = <div className="craft-calculation-actions">
    <Button disabled={!current && !result} onClick={clear}>Clear results</Button>
    <Button tone="primary" size="prominent" className="craft-calculate" busy={current?.busy} busyLabel="Calculating…" disabled={Boolean(empty) || current?.busy}
      onClick={calculate}>Calculate</Button>
    <Button tone="danger" size="prominent" className="craft-cancel" disabled={!current?.busy}
      aria-label="Cancel the calculation" title="Cancel the calculation" onClick={clear}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </Button>
  </div>;
  const status = <div className="craft-calculation-status">
    {current?.busy || current?.error || !result
      ? <p className={current?.busy ? 'calculation-status craft-calculating' : 'calculation-status'} role="status">{current?.busy ? `Calculating… ${Math.floor(current.progress * 100)} %` : current?.error ?? empty ?? ''}</p>
      : keepers.state === 'pending' || keepers.state === 'failed'
        ? <p className="calculation-status" role="status">{keepers.state === 'failed' ? keepers.message
          /* Clean-up's own words for its two phases, so the wait reads the same on both pages. */
          : keepers.calibration !== null
            ? `Calibrating Rune Clean-up… ${format(Math.round(keepers.calibration * 100))} % · only needed once`
            : `Asking Rune Clean-up which runes it keeps… ${format(Math.floor(keepers.progress * 100))} %`}</p>
        : <CalculationStatus twoLines durationMs={result.durationMs} backend={result.backend} general={general} detail={`${format(result.comparisons)} build comparisons`} />}
  </div>;
  /* Kept in the column before there is an answer, quiet until there is one, so
     the column has its shape from the start. */
  const answered = Boolean(result && keepersSettled);
  const wantedBox = <section className={answered ? 'statistics craft-wanted' : 'statistics craft-wanted pending'} aria-label="Most wanted">
    <h4>Most wanted</h4>
    <p className="statistics-lead">{!answered ? 'Calculate to see which items your box lacks.'
      : wanted.length ? 'The items your box lacks, by the runes they lift most.'
        : 'Your box already holds the best item for every rune shown.'}</p>
    <table className="craft-wanted-table">
      <thead><tr>
        <th scope="col">Item</th>
        <th scope="col" title="Runes on which this is the missing item that lifts them furthest past your box">Runes</th>
        <th scope="col" title="The largest score gain over your box on one of those runes">Gain</th>
      </tr></thead>
      <tbody>{Array.from({ length: wantedLength }, (_, at) => {
        const entry = answered ? wanted[at] : undefined;
        return entry ? <tr key={entry.item.id}>
          <td title={immemorialAlternative(entry.item)}><CraftItemName item={entry.item} /></td>
          <td>{format(entry.runes)}</td>
          <td>+{score(entry.topGain)}</td>
        </tr> : <tr key={`empty-${at}`} aria-hidden="true"><td /><td /><td /></tr>;
      })}</tbody>
    </table>
  </section>;
  const resets = <div className="filter-panel-actions craft-view-actions">
    <Button className="filter-reset" onClick={() => setState((previous) => ({ ...previous,
      ...Object.fromEntries(craftFilterFields.map((field) => [field, defaultCraftViewChoice[field]])) }))}
    aria-label={`Reset ${{ recommendations: 'recommendations', selected: 'best use', missing: "what's missing" }[mode]} filters`}>Reset filters</Button>
    {/* Kept mounted while there is nothing to reset, so the panel never changes height. */}
    <Button className="filter-reset" disabled={!ignores.length} onClick={() => onIgnore(null)}
      title={ignores.length ? `Suggest again the ${format(ignores.length)} ignored throughout Gems & Grinds` : 'Nothing is ignored in Gems & Grinds'}>Reset ignored</Button>
  </div>;

  return <div className="craft-best-use" data-mode={mode}>
    <div className="craft-controls">
    {/* The question: which kind of item, which stack where there is one to
        choose and what each roll is assumed to give. Everything in the panel
        below only narrows the answer. */}
    <div className="filter-panel craft-question">
      {choiceGroup('Item', 'kind', craftKinds, (value) => kind === value, (value) => update('kind', value),
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
    </div>
    <div className="filter-panel craft-best-use-filters">
      {choiceGroup('Family', 'lineage', choices.lineages, (value) => state.lineages.includes(value), (value) => toggle('lineages', value),
        (value) => craftLineageLabels[value])}
      {choiceGroup('Grade', 'grade', choices.grades, (value) => state.grades.includes(value), (value) => toggle('grades', value),
        (value) => value.slice(0, 3).toUpperCase(), (value) => value)}
      <div className="filter-group craft-view-stat"><label className="filter-label" htmlFor={`${prefix}-stat`}>Stat</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-stat`} value={state.statId} placeholder="Any stat" aria-label="Narrow the list to one stat" onChange={(event) => update('statId', event.target.value)}>
          {runeStatIds.map((id) => <option key={id} value={id}>{runeStatName(id)}</option>)}</Dropdown></div></div>
      {/* The slider runs over the stops, not the counts, so each stop is one step of the hand. */}
      <div className="filter-group craft-view-count"><span className="filter-label">No. of suggestions</span><div className="filter-group-controls">
        <ValueSlider minimum={0} maximum={craftSuggestionCounts.length - 1} value={Math.max(0, craftSuggestionCounts.indexOf(state.count))}
          label="Number of runes listed in each ranking" valueText={(at) => `${craftSuggestionCounts[at]} runes in each ranking`}
          valueLabel={(at) => String(craftSuggestionCounts[at])}
          onChange={(at) => update('count', craftSuggestionCounts[at] ?? defaultCraftViewChoice.count)} /></div></div>
      <div className="filter-group craft-view-set"><label className="filter-label" htmlFor={`${prefix}-set`}>Rune set</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-set`} value={state.set ?? ''} placeholder="Any rune set" aria-label="Filter candidate runes by set"
          onChange={(event) => update('set', event.target.value)}>{sets.map((set) => <option key={set}>{set}</option>)}</Dropdown></div></div>
      {choiceGroup('Location', 'location', ['showEngraved', 'showInventory'] as const, (key) => state[key], (key) => update(key, !state[key]),
        (key) => key === 'showEngraved' ? 'Engraved' : 'Inventory', undefined, 'Choose rune locations')}
      {/* One group, two questions: the Grindstone's is an inclusive filter, the
          Gem's a permission with exactly one answer always standing. */}
      {choiceGroup(alreadyLabel, 'already', craftChangeOptions,
        (value) => kind === 'gem' ? state.gemChange === value : state.already.includes(value),
        (value) => kind === 'gem' ? update('gemChange', value) : toggle('already', value),
        (value) => value === 'yes' ? 'Yes' : 'No', kind === 'gem'
          ? (value) => value === 'yes' ? 'Allow changing an existing Gem to another stat' : 'Keep the existing Gem stat; a better same-stat Gem is still allowed'
          : undefined, alreadyLabel,
        /* Both wordings keep their room, so switching the item kind cannot move the groups beside this one. */
        <LabelSwap faces={{ grindstone: 'Stat already grinded', gem: "Can change gem'ed stat?" }} showing={kind} />)}
      {/* Rune Clean-up's calculated Keep, read past the sell safeguards: Power up,
          Re-app, Refine and a rune kept only by a safeguard all stay out. */}
      {mode === 'selected' && choiceGroup('Only keep-runes', 'keep', ['yes'] as const, () => state.keepOnly,
        () => update('keepOnly', !state.keepOnly), () => 'Yes', () => 'Only runes whose calculated Rune Clean-up verdict is Keep')}
    </div>
    </div>
    <aside className="craft-side">
      <div className="craft-side-actions">{actions}{status}{resets}</div>
      {mode === 'missing' && wantedBox}
    </aside>
    {result && keepersSettled && <div className="craft-best-use-results" data-kind={kind}>
      {ranking('Highest score', rankings.highestScore)}{ranking('Highest gain', rankings.highestGain)}
      {kind === 'grindstone' && <div className="craft-stat-rankings">{rankings.highestStat.size ? [...rankings.highestStat].sort(([a], [b]) => a - b).map(([stat, rows]) =>
        <div key={stat}>{ranking('Highest stat', rows, runeStatName(stat))}</div>) : ranking('Highest stat', [])}</div>}
    </div>}
  </div>;
}
