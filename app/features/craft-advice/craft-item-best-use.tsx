import { filterIncludes, filterPair } from '../../domain/shared/filter-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { askCraftRecommendations, CraftWorkerCrashed } from '../../workspace/jobs/craft-recommendation-client';
import type { CraftRecommendationJob } from '../../workspace/jobs/craft-recommendation-client';
import { isCalculationCancelled } from '../../workspace/jobs/cancellable-worker';
import type { ReactNode } from 'react';
import { AncientName } from '../../ui/gear/ancient-mark';
import { Button, FilterButton, InlineButton, LabelSwap } from '../../ui/button';
import { CalculationActions, CalculationNote } from '../../ui/calculation-actions';
import { calculationOutdated } from '../../ui/calculation-outdated';
import { CalculationStatus } from '../../ui/calculation-status';
import { Dropdown } from '../../ui/dropdown';
import { EngravedPlace } from '../../ui/gear/engraved-place';
import { RangeSlider, ValueSlider } from '../../ui/range-slider';
import { RuneLink } from '../../ui/gear/rune-link';
import { RuneEmblem } from '../../ui/gear/rune-emblem';
import type { OpenRuneOverlay } from '../../ui/gear/rune-link';
import { RuneInnateLine, RuneSubLine } from '../../ui/gear/rune-sub-line';
import { formatDecimal, formatNumber } from '../../domain/shared/formatting';
import type { GameRecord } from '../../domain/account/game-record';
import { monsterCopyNamesIn } from '../../domain/monsters/monster-names';
import { emptyRunePlacement, hasRunePlacement } from '../../domain/placements/rune-placement';
import { usePresets } from '../../ui/presets-context';
import type { MonsterPreferences } from '../../domain/profiles/monster-preferences';
import { craftKindLabels, craftLineageLabels, craftRollLabels, craftRollAssumptions,
  craftSetLabel, missingCraftItems } from '../../domain/runes/craft/rune-craft-items';
import type { CraftItem, CraftRollAssumption } from '../../domain/runes/craft/rune-craft-items';
import { craftChangeOptions, craftFilterFields, craftHighestRuneLevel, craftKinds, craftLowestRuneLevel, craftSuggestionCounts,
  craftViewOffers, defaultCraftViewChoice } from '../../domain/profiles/craft-view-choices';
import type { CraftViewChoice, CraftViewMode } from '../../domain/profiles/craft-view-choices';
import { runeStatIds, runeStatName, runeLineStat, runeLineFigure } from '../../domain/runes/runes';
import type { Rune } from '../../domain/runes/runes';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import type { GeneralSettings, RunePotentialSettings } from '../../domain/model';
import { referenceLines } from '../../domain/reference/rune-reference-stats';
import type { CraftBenchmark, CraftRecommendation, CraftRecommendationRequest, CraftCalculation, CraftRecommendations, GemStatChoice } from '../../domain/runes/craft-advice/rune-craft-recommendations';
import { grindLines, grindPlan, craftCalculationKey, craftExtensionRequests, craftItemKey, craftRecommendationRankings, craftRuneKey, craftMatchesChangeFilter,
  desirableGemStats, extendCraftCalculation, heldCraftBenchmark, reconcileCraftCalculation,
  isHeldCraft, onDesirableGemStat, runeAsItStands, wantedCraftItems } from '../../domain/runes/craft-advice/rune-craft-recommendations';
import { useRuneKeepers } from '../rune-cleanup/public';
import { craftIgnoreKey } from '../../domain/profiles/craft-ignores';
import type { CraftIgnore } from '../../domain/profiles/craft-ignores';

type State = CraftViewChoice;

/**
 * `Legend Violent · SPD`, with the Ancient mark drawn rather than spelled. The
 * kind is left out: the Item choice above already says which kind is listed, and
 * the stat is what tells one item from the next.
 */
function CraftItemName({ item }: { item: CraftItem }) {
  return <>
    {item.grade} <AncientName name={item.setName ?? craftLineageLabels.immemorial} ancient={item.lineage === 'ancient'} />
    {' · '}{item.statName}
  </>;
}

/* Most wanted's own length, apart from the rankings': its box keeps this many
   rows whatever the answer, so the column beside it never changes height. */
const wantedLength = 10;
/* One empty list for every render, so the request a view asks with stays the same object. */
const noItems: readonly CraftItem[] = [];
/** What Ignore on this card waves away: the rune, and the item's kind and stat, whatever its grade or set. */
const ignoreOf = (row: CraftRecommendation): CraftIgnore => ({ runeId: row.rune.id, kind: row.item.kind, statId: row.item.statId });
/** `SPD Gem`, `HP % Grind`: the stat named as a kind, so the two HP lines read apart. */
const ignoredName = (entry: CraftIgnore) => `${runeStatName(entry.statId) ?? `Stat ${entry.statId}`} ${craftKindLabels[entry.kind]}`;

/* An Immemorial item rolls what the set's own item rolls, so What's missing
   names the set's item and says on its title that either will do. */
const immemorialAlternative = (item: CraftItem) => item.amount === 0 && item.lineage === 'standard'
  ? `A ${item.grade} Immemorial ${item.statName} ${craftKindLabels[item.kind]} works too` : undefined;

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
  const keepWanted = mode === 'selected' && state.keepOnly;
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
  /* What's missing judges every absent item. Which Gem stat a rune should take is
     the placement rule's, carried on every row, so no view needs unseen entrants. */
  const missing = useMemo(() => mode === 'missing' ? missingCraftItems(items, runes) : noItems, [mode, items, runes]);
  const request = useMemo<CraftRecommendationRequest | null>(() => base ? {
    items, missing, runes, roles, base, settings, roll: state.roll, preferGpu: hardwareAcceleration,
  } : null, [base, items, missing, runes, roles, settings, state.roll, hardwareAcceleration]);
  const calculationKey = useMemo(() => request ? craftCalculationKey(request) : '', [request]);
  const job = useRef<CraftRecommendationJob | null>(null);
  const jobRequest = useRef<CraftRecommendationRequest | null>(null);
  const [work, setWork] = useState<{ request: CraftRecommendationRequest; busy: boolean; progress: number; error?: string } | null>(null);
  const current = work?.request === request ? work : null;
  useEffect(() => () => {
    // A late cleanup of an older question must not terminate its replacement.
    if (jobRequest.current !== request) return;
    job.current?.cancel(); job.current = null; jobRequest.current = null;
  }, [request]);
  /* Reconciliation plans the next answer. It must not publish a partial one:
     a changed rune can still lead the same ranking once its new answer is in. */
  const reconciled = useMemo(() => request && calculation?.key === calculationKey
    ? reconcileCraftCalculation(calculation, [...request.items, ...request.missing], request.runes) : null, [request, calculation, calculationKey]);
  const extensions = useMemo(() => request && reconciled ? craftExtensionRequests(request, reconciled) : [], [request, reconciled]);
  /* The question a cancel stopped, so the account-change extension below does
     not start the very work the user just cancelled. */
  const [stopped, setStopped] = useState<CraftRecommendationRequest | null>(null);
  function stop() { job.current?.cancel(); job.current = null; jobRequest.current = null; setWork(null); }
  function clear() { stop(); onCalculated(null); }
  /* Leaves the stored answer alone: whatever stood before Calculate stands again. */
  function cancel() { stop(); setStopped(request); }
  /**
   * Asks the worker each of `asks` in turn on behalf of `request`, whose status it
   * reports, and stores what `settle` makes of the answers once all are in.
   */
  function run(request: CraftRecommendationRequest, asks: readonly CraftRecommendationRequest[],
    settle: (results: CraftRecommendations[]) => CraftCalculation) {
    job.current?.cancel();
    const started = askCraftRecommendations(asks, (progress) =>
      setWork((previous) => previous?.request === request ? { ...previous, progress } : previous));
    job.current = started;
    jobRequest.current = request;
    setWork({ request, busy: true, progress: 0 });
    void started.result.then((results) => {
      if (job.current !== started) return;
      job.current = null; jobRequest.current = null;
      setWork({ request, busy: false, progress: 1 });
      onCalculated(settle(results));
    }, (error: unknown) => {
      if (job.current !== started || isCalculationCancelled(error)) return;
      job.current = null; jobRequest.current = null;
      setWork({ request, busy: false, progress: error instanceof CraftWorkerCrashed ? 0 : 1,
        error: error instanceof Error ? error.message : new CraftWorkerCrashed().message });
    });
  }  function calculate() {
    if (!request) return;
    const keepers = keepWanted;
    run(request, [request], ([result]) => ({ key: calculationKey, keepers,
      items: [...request.items, ...request.missing].map(craftItemKey), runes: request.runes.map(craftRuneKey), result }));
  }
  /* Only what the answer has never judged is asked, once per account state: a
     failed extension is reported rather than retried in a loop. */
  useEffect(() => {
    if (!request || !calculation || !reconciled || work?.request === request || stopped === request) return;
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
  }, [request, calculation, reconciled, extensions, work?.request, stopped]);
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
     including on failure. A different question hides it until Calculate
     (`AGENTS.md` §5) — another roll, role or setting, or *Only keep-runes* turned on
     after an answer that never asked Rune Clean-up — and asking the old one again
     shows it again. */
  const keepMissing = keepWanted && calculation !== null && !calculation.keepers;
  const result = reconciled && !keepMissing ? extensions.length ? calculation?.result : reconciled.result : undefined;
  const outdated = calculation !== null && result === undefined && !current?.busy;
  const adviceInputs = useMemo(() => ({ data: { unit_list: monsters } as GameRecord, settings, roles }), [monsters, settings, roles]);
  /* Asked only for an answer whose Calculate included it, so the filter alone never
     starts Rune Clean-up's worker; a sync afterwards asks only the runes it changed. */
  const keepers = useRuneKeepers({ enabled: keepWanted && result !== undefined,
    runes, inputs: adviceInputs, base, hardwareAcceleration });
  /* The runes the rankings may show: Clean-up's answer, or while it is being
     brought up to date the one before it, so an update never empties the page. */
  const keepSet = keepers.state === 'ready' ? keepers.keep : keepers.state === 'pending' ? keepers.previous : null;
  const keepersSettled = keepers.state === 'off' || keepSet !== null;
  const ignored = useMemo(() => new Set(ignores.map(craftIgnoreKey)), [ignores]);
  /* An old Ignore changes which Gem a card names without saying so, which reads as
     the overlay and the table disagreeing. Each card therefore lists what is waved
     away on its rune: Gems before Grinds, each by stat. */
  const ignoredByRune = useMemo(() => {
    const byRune = new Map<string, CraftIgnore[]>();
    for (const entry of ignores) byRune.set(entry.runeId, [...byRune.get(entry.runeId) ?? [], entry]);
    for (const entries of byRune.values()) entries.sort((a, b) =>
      Number(a.kind === 'grindstone') - Number(b.kind === 'grindstone') || a.statId - b.statId);
    return byRune;
  }, [ignores]);
  const desirable = useMemo(() => result
    ? desirableGemStats(result.candidates, (runeId, statId) => ignored.has(craftIgnoreKey({ runeId, kind: 'gem', statId })), state.gemChange)
    : new Map<string, readonly GemStatChoice[]>(),
  [result, ignored, state.gemChange]);
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
    && row.rune.level >= state.level.minimum && row.rune.level <= state.level.maximum
    && (keepSet === null || keepSet.has(row.rune.id))
    && !ignored.has(craftIgnoreKey(ignoreOf(row)))) ?? [],
  [result, kind, mode, selected, desirable, state.lineages, state.grades, state.statId, state.set, state.already, state.gemChange, state.showEngraved, state.showInventory, state.level, placements, choices, keepSet, ignored]);
  /* Read from the filtered rows, so a narrowed Family, Grade or Stat narrows a
     rune's plan exactly as it narrows the cards. What's missing asks which one
     item the box lacks, against the one best item it holds, so its cards stay
     one item each. */
  const lines = useMemo(() => mode === 'missing' ? undefined : grindLines(visible, benchmark), [mode, visible, benchmark]);
  const rankings = useMemo(() => craftRecommendationRankings(visible, state.count, benchmark, lines), [visible, state.count, benchmark, lines]);
  const wanted = useMemo(() => mode === 'missing' ? wantedCraftItems(visible, wantedLength, benchmark) : [], [mode, visible, benchmark]);
  const empty = base === null ? 'A level 40 monster is needed to score runes.' : !roles.length ? 'Add a role in Rune Clean-up to judge these runes.'
    : mode === 'missing' ? (!runes.length ? 'Import runes to see what they are missing.' : null)
      : !items.length ? 'Import gems and grindstones to calculate.' : null;
  /** `byStat`: the card stands in a Highest stat ranking, so its own stone is what it is about. */
  function runeCard(row: CraftRecommendation, byStat: boolean) {
    const rune = row.rune;
    /* Grinds on different lines are spent together, so a Grindstone card is the
       rune's whole plan: every line lifted alike, and one score with all of them in. */
    const plan = row.item.kind === 'grindstone' && lines ? grindPlan(row, lines) : undefined;
    const spent = plan?.lines ?? [row];
    const after = plan?.after ?? row.after;
    /* The title names one stone and counts the rest: the card's own in a stat
       ranking, elsewhere the one that adds most on its own. */
    const lead = byStat ? row : spent.reduce((best, entry) => entry.gain > best.gain ? entry : best, spent[0]);
    const byLine = new Map(spent.map((entry) => [entry.application.target.index, entry]));
    const ignoredOnRune = ignoredByRune.get(rune.id) ?? [];
    const afterCell = (at: number) => {
      const entry = byLine.get(at);
      return entry ? <RuneSubLine property={entry.application.result} format={format} showGrindStep /> : '—';
    };
    return <article className="craft-recommendation" key={rune.id}>
      <div className="craft-recommendation-head">
        <h4 className="craft-recommendation-title" title={immemorialAlternative(lead.item)}>
          <CraftItemName item={lead.item} />
          {spent.length > 1 && <span className="craft-item-quiet" title={['Also on this rune', ...spent.filter((entry) => entry !== lead)
            .map((entry) => `${entry.item.grade} ${entry.item.setName ?? craftLineageLabels.immemorial} · ${entry.item.statName}`)].join('\n')}>
            {' '}(+ {format(spent.length - 1)})</span>}
        </h4>
        <div className="craft-recommendation-aside">
          {/* The mark's box is there on every card, shown or not, so a rune gaining
              its first ignore moves neither the button nor the title (AGENTS.md §2). */}
          <span className="craft-ignored-mark" role={ignoredOnRune.length ? 'img' : undefined}
            aria-hidden={ignoredOnRune.length ? undefined : true}
            aria-label={ignoredOnRune.length ? `Ignored on this ${rune.setName} rune: ${ignoredOnRune.map(ignoredName).join(', ')}` : undefined}
            title={ignoredOnRune.length ? ['Ignored on this rune', ...ignoredOnRune.map(ignoredName)].join('\n') : undefined}
            data-shown={ignoredOnRune.length > 0 || undefined}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
              <circle cx="8" cy="8" r="2" />
              <path d="M2.5 13.5l11-11" />
            </svg>
          </span>
          <InlineButton onClick={() => onIgnore(ignoreOf(lead))}
            aria-label={`Ignore ${lead.item.statName} ${craftKindLabels[lead.item.kind]} on this ${rune.setName} rune`}
            title={`Stop suggesting ${lead.item.statName} ${craftKindLabels[lead.item.kind]}s for this rune, in every view`}>Ignore</InlineButton>
        </div>
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
            <td>{afterCell(at)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <dl className="craft-evaluation">
        <div><dt>Best role</dt><dd>{after.role}</dd></div>
        <div><dt>Score</dt><dd className="craft-score-change"><span className="muted">{score(row.before.score)}</span> → {score(after.score)}</dd></div>
        {/* The bar the missing item cleared: the best the box's own items reach on this rune. */}
        {mode === 'missing' && <div><dt>Your box</dt><dd>{score(benchmark.score(row))}</dd></div>}
      </dl>
    </article>;
  }
  function ranking(title: string, rows: readonly CraftRecommendation[], suffix = '') {
    return <section className="craft-ranking" aria-label={suffix ? `${title} · ${suffix}` : title}>
      <h3>{title}{suffix && <span className="muted"> · {suffix}</span>}</h3>
      {rows.length ? rows.map((row) => runeCard(row, Boolean(suffix))) : <p className="best-artifact-empty">No matching improvements.</p>}
    </section>;
  }

  const status = current?.busy ? <CalculationNote tone="busy">{`Calculating… ${Math.floor(current.progress * 100)} %`}</CalculationNote>
    : current?.error ? <CalculationNote tone="failed">{current.error}</CalculationNote>
      : !result ? <CalculationNote>{empty ?? ''}</CalculationNote>
        : keepers.state === 'failed' ? <CalculationNote tone="failed">{keepers.message}</CalculationNote>
          : keepers.state === 'pending'
            /* Clean-up's own words for its two phases, so the wait reads the same on both pages. */
            ? <CalculationNote tone="busy">{keepers.calibration !== null
              ? `Preparing rune quality references… ${format(Math.round(keepers.calibration * 100))} %`
              : `Asking Rune Clean-up which runes it keeps… ${format(Math.floor(keepers.progress * 100))} %`}</CalculationNote>
            : <CalculationStatus twoLines durationMs={result.durationMs} backend={result.backend} general={general} detail={`${format(result.comparisons)} build comparisons`} />;
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
        <th scope="col" title="Runes for which this is the best item you lack">Runes</th>
        <th scope="col" title="Its largest gain on one of those runes, beyond your box's best">Gain</th>
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
  const resets = <>
    <Button className="filter-reset" onClick={() => setState((previous) => ({ ...previous,
      ...Object.fromEntries(craftFilterFields.map((field) => [field, defaultCraftViewChoice[field]])) }))}
    aria-label={`Reset ${{ recommendations: 'recommendations', selected: 'best use', missing: "what's missing" }[mode]} filters`}>Reset filters</Button>
    {/* Kept mounted while there is nothing to reset, so the panel never changes height. */}
    <Button className="filter-reset" disabled={!ignores.length} onClick={() => onIgnore(null)}
      title={ignores.length ? `Bring back ${format(ignores.length)} ignored ${ignores.length === 1 ? 'suggestion' : 'suggestions'}` : 'Nothing is ignored'}>Reset ignored</Button>
  </>;

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
      <div className="filter-group craft-view-level" role="group" aria-label="Filter by rune level">
        <span className="filter-label">Level</span>
        <div className="filter-group-controls">
          <RangeSlider minimum={craftLowestRuneLevel} maximum={craftHighestRuneLevel}
            lowerValue={state.level.minimum} upperValue={state.level.maximum}
            label="Rune level range" lowerLabel="Lowest rune level" upperLabel="Highest rune level"
            valueText={(value, end) => `${end === 'lower' ? 'Lowest' : 'Highest'} level +${value}`}
            onChange={(minimum, maximum) => update('level', { minimum, maximum })} />
        </div>
      </div>
      {/* One group, two questions: the Grindstone's is an inclusive filter, the
          Gem's a permission with exactly one answer always standing. */}
      {choiceGroup(alreadyLabel, 'already', craftChangeOptions,
        (value) => kind === 'gem' ? state.gemChange === value : state.already.includes(value),
        (value) => kind === 'gem' ? update('gemChange', value) : toggle('already', value),
        (value) => value === 'yes' ? 'Yes' : 'No', kind === 'gem'
          ? (value) => value === 'yes' ? "A gem'ed stat may be swapped for another stat" : "Keep the gem'ed stat; only a higher roll of it"
          : undefined, alreadyLabel,
        /* Both wordings keep their room, so switching the item kind cannot move the groups beside this one. */
        <LabelSwap faces={{ grindstone: 'Stat already grinded', gem: "Can change gem'ed stat?" }} showing={kind} />)}
      {/* Rune Clean-up's calculated Keep, read past the sell safeguards: Power up,
          Re-app, Refine and a rune kept only by a safeguard all stay out. */}
      {mode === 'selected' && choiceGroup('Only keep-runes', 'keep', ['yes'] as const, () => state.keepOnly,
        () => update('keepOnly', !state.keepOnly), () => 'Yes', () => 'Only runes Rune Clean-up says to keep')}
    </div>
    </div>
    <aside className="craft-side">
      <CalculationActions className="craft-side-actions" busy={Boolean(current?.busy)} canCalculate={!empty}
        onCalculate={calculate} onCancel={cancel} canClear={Boolean(current || result)} onClear={clear}
        status={status} resets={resets} />
      {mode === 'missing' && wantedBox}
    </aside>
    {outdated && <section className="empty-state craft-best-use-outdated">
      <h2>{calculationOutdated.title}</h2>
      <p className="next-step">{calculationOutdated.detail}</p>
    </section>}
    {result && keepersSettled && <div className="craft-best-use-results" data-kind={kind}>
      {ranking('Highest score', rankings.highestScore)}{ranking('Highest gain', rankings.highestGain)}
      {kind === 'grindstone' && <div className="craft-stat-rankings">{rankings.highestStat.size ? [...rankings.highestStat].sort(([a], [b]) => a - b).map(([stat, rows]) =>
        <div key={stat}>{ranking('Highest stat', rows, runeStatName(stat))}</div>) : ranking('Highest stat', [])}</div>}
    </div>}
  </div>;
}
