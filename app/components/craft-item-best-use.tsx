import { filterIncludes, filterPair } from '../lib/filter-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AncientName } from './ancient-mark';
import { Button, FilterButton } from './button';
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
  defaultCraftRollAssumption, craftSetLabel, itemGrades } from '../lib/rune-craft-items';
import type { CraftItem, CraftKind, CraftLineage, CraftRollAssumption } from '../lib/rune-craft-items';
import { craftItemRange } from '../lib/rune-craft-end-state';
import { runeStatIds, runeStatName, runeLineStat, runeLineFigure } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { GeneralSettings, ItemGrade, RunePotentialSettings } from '../lib/types';
import { referenceLines } from '../lib/rune-reference-stats';
import type { CraftRecommendation, CraftRecommendationRequest, CraftCalculation } from '../lib/rune-craft-recommendations';
import { craftCalculationKey, craftRecommendationRankings, craftStatAlreadyChanged } from '../lib/rune-craft-recommendations';
import type { CraftRecommendationResponse } from '../lib/compute/craft-recommendation-protocol';
import { useSessionStorageState } from '../lib/session-storage-state';
import { readSettings, isBoolean, isOneOf, isWholeNumberIn } from '../lib/preference-reading';

const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
const alreadyOptions = ['yes', 'no'] as const;
const defaultState = {
  kinds: ['grindstone'] as CraftKind[], lineages: [] as CraftLineage[], grades: [] as ItemGrade[],
  statId: '', selectedItemId: '', set: '', roll: defaultCraftRollAssumption,
  grindAfter: false, grindGrade: 'Legend' as ItemGrade, showEngraved: true, showInventory: true, count: 5,
  already: [] as Array<typeof alreadyOptions[number]>,
};
type State = typeof defaultState;
const isString = (value: unknown) => typeof value === 'string';
const isListOf = <T,>(choices: readonly T[]) => (value: unknown) => Array.isArray(value) && value.every(isOneOf(choices));
function readState(value: unknown): State {
  return readSettings(value, defaultState, {
    kinds: (value) => Array.isArray(value) && value.length === 1 && isOneOf(craftKinds)(value[0]),
    lineages: isListOf(craftLineages), grades: isListOf(itemGrades), statId: (value) => value === '' || runeStatIds.some((id) => String(id) === value),
    selectedItemId: isString, set: isString, roll: isOneOf(craftRollAssumptions), grindAfter: isBoolean,
    grindGrade: isOneOf(itemGrades), showEngraved: isBoolean, showInventory: isBoolean, count: isWholeNumberIn(1, 10),
    already: isListOf(alreadyOptions),
  });
}
const stateReader = { read: readState };

export function CraftItemBestUse({ items, runes, monsters, profiles, roles, general, settings, hardwareAcceleration, onOpenRune, recommendations = false, calculation, onCalculated }: {
  items: readonly CraftItem[]; runes: readonly Rune[]; monsters: readonly GameRecord[];
  profiles: MonsterPreferences; roles: readonly RuneRole[]; general: GeneralSettings;
  settings: RunePotentialSettings; hardwareAcceleration: boolean; onOpenRune: OpenRuneOverlay; recommendations?: boolean;
  calculation: CraftCalculation | null; onCalculated: (value: CraftCalculation | null) => void;
}) {
  const [state, setState] = useSessionStorageState(recommendations ? 'jaswa.filters.craft-recommendations' : 'jaswa.filters.craft-best-use', defaultState, stateReader);
  const kind = state.kinds.length === 1 ? state.kinds[0] : 'grindstone';
  const prefix = recommendations ? 'craft-recommendations' : 'craft-best-use';
  const alreadyLabel = kind === 'grindstone' ? 'Stat already grinded' : "Stat already gem'ed";
  const format = (value: number) => formatNumber(value, general);
  const score = (value: number) => `${formatDecimal(value, general)} %`;
  const placements = usePresets();
  const namesIn = useMemo(() => monsterCopyNamesIn(monsters, profiles, placements.presets), [monsters, profiles, placements.presets]);
  const sets = useMemo(() => [...new Set(runes.map((rune) => rune.setName))].sort(), [runes]);
  const offered = useMemo(() => items.filter((item) => item.kind === kind
    && filterIncludes(state.lineages, item.lineage, craftLineages)
    && filterIncludes(state.grades, item.grade, itemGrades)
    && (!state.statId || String(item.statId) === state.statId)), [items, kind, state.lineages, state.grades, state.statId]);
  const groups = useMemo(() => {
    const found = new Map<string, CraftItem[]>();
    for (const item of offered) { const label = craftSetLabel(item); const group = found.get(label) ?? []; group.push(item); found.set(label, group); }
    return [...found].sort(([a], [b]) => a.localeCompare(b));
  }, [offered]);
  const selected = offered.find((item) => item.id === state.selectedItemId);
  const grindPossible = items.some((item) => item.kind === 'gem' &&
    craftItemRange('grindstone', item.lineage, item.statId, state.grindGrade) !== undefined);
  const base = useMemo(() => {
    const lines = referenceLines({ unit_list: monsters });
    return lines ? new Map([...lines].map(([type, line]) => [type, line.stats])) : null;
  }, [monsters]);
  const request = useMemo<CraftRecommendationRequest | null>(() => base ? {
    items, runes, roles, base, settings, roll: state.roll,
    grindAfter: state.grindAfter ? { grade: state.grindGrade } : null,
    preferGpu: hardwareAcceleration,
  } : null, [base, items, runes, roles, settings, state.roll, state.grindAfter, state.grindGrade, hardwareAcceleration]);
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
  function clear() { worker.current?.terminate(); worker.current = null; workerRequest.current = null; setWork(null); onCalculated(null); }
  function calculate() {
    if (!request) return;
    worker.current?.terminate();
    const running = new Worker(new URL('../lib/compute/craft-recommendation-worker.ts', import.meta.url), { type: 'module' });
    worker.current = running;
    workerRequest.current = request;
    setWork({ request, busy: true, progress: 0 });
    running.onmessage = (event: MessageEvent<CraftRecommendationResponse>) => {
      if (worker.current !== running) return;
      const message = event.data;
      if (message.type === 'progress') setWork((previous) => previous?.request === request ? { ...previous, progress: message.fraction } : previous);
      else {
        setWork({ request, busy: false, progress: 1,
          ...(message.type === 'error' ? { error: message.message } : {}) });
        if (message.type === 'result') onCalculated({ key: calculationKey, result: message.result });
        running.terminate(); worker.current = null; workerRequest.current = null;
      }
    };
    running.onerror = () => {
      if (worker.current !== running) return;
      setWork({ request, busy: false, progress: 0, error: 'The craft worker could not finish. Try calculating again.' });
      running.terminate(); worker.current = null; workerRequest.current = null;
    };
    running.postMessage(request);
  }
  const update = <K extends keyof State,>(key: K, value: State[K]) => setState((previous) => ({ ...previous, [key]: value }));
  const group = <T extends string,>(label: string, key: 'lineages' | 'grades', values: readonly T[], display: (value: T) => string, area: string) =>
    <div className={`filter-group craft-best-use-${area}`} role="group" aria-label={label}>
      <span className="filter-label">{label}</span><div className="filter-group-controls">{values.map((value) => <FilterButton key={value}
        active={(state[key] as string[]).includes(value)} onClick={() => setState((previous) => ({ ...previous,
          [key]: (previous[key] as string[]).includes(value) ? previous[key].filter((entry) => entry !== value) : [...previous[key], value] }))}>{display(value)}</FilterButton>)}</div>
    </div>;
  const result = calculation?.key === calculationKey ? calculation.result : undefined;
  const visible = useMemo(() => result?.candidates.filter((row) => row.item.kind === kind
    && (recommendations || !selected || row.item.id === selected.id)
    && filterIncludes(state.lineages, row.item.lineage, craftLineages)
    && filterIncludes(state.grades, row.item.grade, itemGrades)
    && (!state.statId || String(row.item.statId) === state.statId)
    && (!state.set || row.rune.setName === state.set)
    && filterIncludes(state.already, craftStatAlreadyChanged(row.rune, row.item) ? 'yes' : 'no', alreadyOptions)
    && filterPair(hasRunePlacement(placements.runes.get(row.rune.id) ?? emptyRunePlacement), state.showEngraved, state.showInventory)) ?? [],
  [result, kind, recommendations, selected, state.lineages, state.grades, state.statId, state.set, state.already, state.showEngraved, state.showInventory, placements]);
  const rankings = useMemo(() => craftRecommendationRankings(visible, state.count), [visible, state.count]);
  const empty = base === null ? 'A level 40 monster is needed to score runes.' : !roles.length ? 'Add a role in Rune Clean-up to judge these runes.'
    : !items.length ? 'Import gems and grindstones to calculate.' : null;
  function runeCard(row: CraftRecommendation) {
    const rune = row.rune;
    return <article className="craft-recommendation" key={rune.id}>
      <h4 className="craft-recommendation-title">
        {row.item.grade} <AncientName name={row.item.setName ?? 'Immemorial'} ancient={row.item.lineage === 'ancient'} />
        {' · '}{row.item.statName} {craftKindLabels[row.item.kind]}
      </h4>
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
      </dl>
    </article>;
  }
  function ranking(title: string, rows: readonly CraftRecommendation[], suffix = '') {
    return <section className="craft-ranking" aria-label={title + suffix}>
      <h3>{title}{suffix && <span className="muted"> · {suffix}</span>}</h3>
      {rows.length ? rows.map(runeCard) : <p className="best-artifact-empty">No matching improvements.</p>}
    </section>;
  }

  return <div className="craft-best-use" data-mode={recommendations ? 'recommendations' : 'selected'}>
    <div className="filter-panel craft-best-use-filters">
      <div className="filter-group craft-best-use-kind" role="group" aria-label="Item"><span className="filter-label">Item</span>
        <div className="filter-group-controls">{craftKinds.map((value) => <FilterButton key={value} active={kind === value}
          onClick={() => update('kinds', [value])}>{value === 'gem' ? 'Enchanted gem' : 'Grindstone'}</FilterButton>)}</div></div>
      {group('Family', 'lineages', craftLineages, (value) => craftLineageLabels[value], 'lineage')}
      {group('Grade', 'grades', itemGrades, (value) => value.slice(0, 3).toUpperCase(), 'grade')}
      <div className="filter-group craft-best-use-location" role="group" aria-label="Choose rune locations"><span className="filter-label">Location</span>
        <div className="filter-group-controls">{(['showEngraved', 'showInventory'] as const).map((key) => <FilterButton key={key} active={state[key]}
          onClick={() => update(key, !state[key])}>{key === 'showEngraved' ? 'Engraved' : 'Inventory'}</FilterButton>)}</div></div>
      <div className="filter-group craft-best-use-select" style={{ visibility: recommendations ? 'hidden' : undefined }}>
        <label className="filter-label" htmlFor={`${prefix}-item`}>Craft item</label><div className="filter-group-controls">
          <Dropdown id={`${prefix}-item`} value={selected?.id ?? ''} placeholder="Any item" aria-label="Choose a gem or grindstone to place"
            onChange={(event) => update('selectedItemId', event.target.value)}>
            {groups.map(([label, entries]) => <optgroup key={label} label={label}>{entries.map((item) => <option key={item.id} value={item.id}>
              {craftKindLabels[item.kind]} · {craftSetLabel(item)} · {item.statName} · {item.grade} · {format(item.amount)} held
            </option>)}</optgroup>)}</Dropdown></div></div>
      <div className="filter-group craft-best-use-count"><span className="filter-label"># of options</span><div className="filter-group-controls">
        <ValueSlider minimum={1} maximum={10} value={state.count} label="Number of runes listed in each ranking" valueText={(value) => `${value} runes in each ranking`}
          onChange={(count) => update('count', count)} /></div></div>
      <div className="filter-group craft-best-use-set"><label className="filter-label" htmlFor={`${prefix}-set`}>Rune set</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-set`} value={state.set ?? ''} placeholder="Any rune set" aria-label="Filter candidate runes by set"
          onChange={(event) => update('set', event.target.value)}>{sets.map((set) => <option key={set}>{set}</option>)}</Dropdown></div></div>
      <div className="filter-group craft-best-use-stat"><label className="filter-label" htmlFor={`${prefix}-stat`}>Stat</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-stat`} value={state.statId} placeholder="Any stat" aria-label="Narrow the list to one stat" onChange={(event) => update('statId', event.target.value)}>
          {runeStatIds.map((id) => <option key={id} value={id}>{runeStatName(id)}</option>)}</Dropdown></div></div>
      <div className="filter-group craft-best-use-already" role="group" aria-label={alreadyLabel}>
        <span className="filter-label">{alreadyLabel}</span><div className="filter-group-controls">
          {alreadyOptions.map((value) => <FilterButton key={value} active={state.already.includes(value)}
            onClick={() => update('already', state.already.includes(value) ? state.already.filter((entry) => entry !== value) : [...state.already, value])}>
            {value === 'yes' ? 'Yes' : 'No'}
          </FilterButton>)}
        </div>
      </div>
      <div className="filter-panel-actions craft-best-use-actions"><Button onClick={() => setState((previous) => ({ ...previous, kinds: defaultState.kinds, lineages: [], grades: [], statId: '', selectedItemId: '', set: '', showEngraved: true, showInventory: true, count: defaultState.count, already: [] }))} aria-label={recommendations ? 'Reset recommendations filters' : 'Reset best use filters'}>Reset filters</Button></div>
    </div>
    <div className="craft-calculation-settings">
      <div className="filter-group craft-best-use-roll"><label className="filter-label" htmlFor={`${prefix}-roll`}>Assumed roll</label><div className="filter-group-controls">
        <Dropdown id={`${prefix}-roll`} value={state.roll} aria-label="How well the roll is assumed to land" onChange={(event) => update('roll', event.target.value as CraftRollAssumption)}>
          {craftRollAssumptions.map((roll) => <option key={roll} value={roll}>{craftRollLabels[roll]}</option>)}</Dropdown></div></div>
      <div className="filter-group craft-best-use-grind" role="group" aria-label="Grind the gemmed property afterwards" style={{ visibility: kind === 'gem' ? undefined : 'hidden' }}>
        <span className="filter-label">Then grind it</span><div className="filter-group-controls"><FilterButton active={state.grindAfter} disabled={!grindPossible}
          title={grindPossible ? 'Grind the gemmed property at the assumed grade and roll' : 'The offered item stats cannot be ground'} onClick={() => update('grindAfter', !state.grindAfter)}>Yes</FilterButton>
          <Dropdown value={state.grindGrade} disabled={!state.grindAfter || !grindPossible} aria-label="Grade of the grindstone to assume"
            onChange={(event) => update('grindGrade', event.target.value as ItemGrade)}>{itemGrades.map((grade) => <option key={grade}>{grade}</option>)}</Dropdown></div></div>
    </div>
    <div className="craft-calculation-actions"><Button tone="primary" size="prominent" busy={current?.busy} busyLabel="Calculating…" disabled={Boolean(empty) || current?.busy}
      onClick={calculate}>Calculate</Button><Button disabled={!current && !result} onClick={clear}>Clear results</Button><Button disabled={!current?.busy} onClick={clear}>Cancel</Button></div>
    <div className="craft-calculation-status">
      {current?.busy || current?.error || !result
        ? <p className="calculation-status" role="status">{current?.busy ? `Calculating… ${Math.floor(current.progress * 100)} %` : current?.error ?? empty ?? ''}</p>
        : <CalculationStatus durationMs={result.durationMs} backend={result.backend} general={general} detail={`${format(result.comparisons)} build comparisons`} />}
    </div>
    {result && <div className="craft-best-use-results" data-kind={kind}>
      {ranking('Highest score', rankings.highestScore)}{ranking('Highest gain', rankings.highestGain)}
      {kind === 'grindstone' && <div className="craft-stat-rankings">{rankings.highestStat.size ? [...rankings.highestStat].sort(([a], [b]) => a - b).map(([stat, rows]) =>
        <div key={stat}>{ranking('Highest stat', rows, runeStatName(stat))}</div>) : ranking('Highest stat', [])}</div>}
    </div>}
  </div>;
}
