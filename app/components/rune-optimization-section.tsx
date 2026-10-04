import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { CalculationStatus } from './calculation-status';
import { FigureMarks } from './figure-marks';
import { buildIssueMarks, criticalRateMarks } from '../lib/figure-marks';
import { CheckboxRow, RadioLine } from './form-controls';
import { Dropdown } from './dropdown';
import { MonsterPortrait } from './monster-portrait';
import { Overlay } from './overlay';
import { PencilIcon } from './pencil-icon';
import type { OpenMonsterOverlay } from './monster-link';
import { PageHeader } from './page-chrome';
import { RuneBuildField } from './rune-build-field';
import { RuneBuildOverlay } from './rune-build-overlay';
import { buildIssueReading } from '../lib/rune-build-issues';
import type { OpenRuneOverlay } from './rune-link';
import { RuneSlotMainField } from './rune-slot-main-field';
import { StatRangeField } from './stat-range-field';
import { SortableHeader } from './sortable-table';
import { TableColumnGroup } from './data-table-page';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { WorkspacePage } from './workspace-page';
import { useRuneOptimizationWork } from './use-rune-optimization-work';
import { runeOptimizationFinishedWarning, runeOptimizationWorkWarning } from '../lib/rune-optimization-work';
import { cancelRuneOptimization, optimizeRuneBuilds, stopRuneOptimization } from '../lib/compute/rune-optimization-client';
import type { RuneOptimizationAnswer, RuneOptimizationPhase } from '../lib/compute/rune-optimization-protocol';
import { formatNumber } from '../lib/formatting';
import type { GeneralSettings } from '../lib/types';
import type { GameRecord } from '../lib/game-data';
import { runeSlotKeys } from '../lib/monster-defaults';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterNameCollator } from '../lib/monster-grid';
import { higherPriorityThan } from '../lib/monster-priority';
import { monsterCopyNames } from '../lib/monster-names';
import { monsterStatTargetKeys, readTargetField } from '../lib/monster-preferences';
import { calculateMonsterTotals, monsterTargetFigures } from '../lib/monster-stats';
import { craftRollAssumptions, craftRollLabels, itemGrades, readCraftItems } from '../lib/rune-craft-items';
import type { CraftItem, CraftRollAssumption } from '../lib/rune-craft-items';
import { estimateRuneOptimizationBuilds, figureIndex } from '../lib/rune-optimization-problem';
import type { RankFigure, RuneOptimizationInput, RuneOptimizationRequirements } from '../lib/rune-optimization-problem';
import { currentBuilds } from '../lib/rune-optimization-refresh';
import type { CurrentBuild } from '../lib/rune-optimization-refresh';
import { profileRequirements, sameList } from '../lib/rune-optimization-requirements';
import {
  craftUseLabels, craftUses, runeOptimizationDepthPlans, runeOptimizationDepthReach, runeOptimizationDepths,
  runeOptimizationMonsterKey, runeOptimizationResultCounts,
} from '../lib/rune-optimization-settings';
import type { CraftUse, RuneOptimizationSettings } from '../lib/rune-optimization-settings';
import { presetTargetColumns } from '../lib/rune-potential-presets';
import { runeSlotMainsBySlot } from '../lib/rune-slot-mains';
import { activeRuneSets } from '../lib/rune-sets';
import { runeBuildName } from '../lib/rune-set-pairs';
import { readRunes } from '../lib/runes';
import type { Rune } from '../lib/runes';
import { useSessionStorageState } from '../lib/session-storage-state';
import { runeOptimizationTableColumns, columnClasses } from '../lib/table-layouts';
import type { ImportedGame, ItemGrade, Preferences } from '../lib/types';

/**
 * **Rune Optimization — the page.** `docs/RUNE-OPTIMIZATION.md` is its contract.
 *
 * The page is a question and its answers. The question is the monster's profile —
 * builds, slot mains, targets, the figure to rank by — laid out for this one
 * calculation, where any part may be changed without touching the profile; how to
 * search is a separate panel of settings that hold for every monster. The answer is
 * a table of whole builds, ranked by the chosen figure and sortable by any other,
 * with the monster's current build pinned above it as the thing to beat.
 *
 * Nothing here calculates. The requirements come from `rune-optimization-requirements.ts`,
 * the search runs in workers behind `rune-optimization-client.ts`, and every figure
 * in the table is one the Monsters page would print for the same six runes.
 */

const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/** The eleven figures under the words the profile uses for them. */
const figureLabels: Readonly<Record<RankFigure, string>> = Object.fromEntries(
  presetTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
) as Record<RankFigure, string>;

const isString = (value: unknown): value is string => typeof value === 'string';
const searchPhaseWords: Record<RuneOptimizationPhase, string> = {
  candidates: 'Reading rune end states…', reducing: 'Checking rune candidates…',
  guiding: 'Finding promising builds…', searching: 'Searching…', retrying: 'Retrying with one worker…',
};

type MonsterOption = { unitId: string; masterId: string; name: string; record: GameRecord };

/* The question the table answers — the monster, the requirements and the settings
   as they stood when it was searched — and the account as the search read it:
   `runes` and `items`, which a build is re-read against when a sync brings
   back the work the player did from the table. */
type Calculation = {
  inputKey: string;
  unitId: string;
  requirements: RuneOptimizationRequirements;
  settings: RuneOptimizationSettings;
  spared: readonly string[];
  answer: RuneOptimizationAnswer;
  runes: ReadonlyMap<string, Rune>;
  items: ReadonlyMap<string, CraftItem>;
  resultCount: number;
  id: number;
};

type ResultRow = { index: number; build: CurrentBuild; name: string; issue: string };

/** A build whose rune has left the account has no figure, and sorts below every build that has one. */
const figureOf = (build: CurrentBuild, at: number) => build.figures?.[at] ?? -Infinity;

function buildNameOf(setIds: readonly number[]): string {
  return runeBuildName(activeRuneSets({ runes: setIds.map((setId) => ({ set_id: setId })) }).map((set) => set.name));
}

const countWords: ReadonlyArray<readonly [number, string]> = [
  [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'],
];

/* Two significant figures and a word: the estimate is an order of magnitude, and
   "2,147,483,648" would claim a precision it does not have. */
function roughCount(value: number, general: GeneralSettings): string {
  const [scale, word] = countWords.find(([at]) => value >= at) ?? [1, ''];
  const figure = formatNumber(Number((value / scale).toPrecision(2)), general);
  return word ? `${figure} ${word}` : figure;
}

/** A caption that is always one line and always present, so its wording can change without moving a field (`AGENTS.md` §2). */
function Provenance({ children }: { children: ReactNode }) {
  return <p className="rune-optimization-provenance">{children}</p>;
}

export function RuneOptimizationSection({ game, monsters, preferences, onUpdate, onOpenMonster, onOpenRune }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  onUpdate: (update: Partial<RuneOptimizationSettings>) => void;
  onOpenMonster: OpenMonsterOverlay;
  onOpenRune: OpenRuneOverlay;
}) {
  const settings = preferences.runeOptimization;
  const general = preferences.general;
  const [unitId, setUnitId] = useSessionStorageState<string>(runeOptimizationMonsterKey, '', isString);
  const [edits, setEdits] = useState<{ unitId: string; requirements: RuneOptimizationRequirements } | null>(null);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<RuneOptimizationPhase>('candidates');
  const [error, setError] = useState('');
  /* The build last opened stays marked in the table after its overlay closes, so
     the reader comes back to the row they were reading rather than to the top. */
  const [chosenBuild, setChosenBuild] = useState<number | null>(null);
  const [showingBuild, setShowingBuild] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const buildOpener = useRef<HTMLElement | null>(null);

  /* A search the user walked away from gives the processor back. */
  useEffect(() => () => cancelRuneOptimization(), []);

  const names = useMemo(() => monsterCopyNames(monsters, preferences.monsterPreferences), [monsters, preferences.monsterPreferences]);
  const options = useMemo<MonsterOption[]>(() => monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => {
      const id = String(monster.unit_id);
      return { unitId: id, masterId: String(monster.unit_master_id ?? ''), name: names[id]?.name ?? id, record: monster };
    })
    .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId)),
  [monsters, names]);
  const selected = options.find((option) => option.unitId === unitId);
  const buildMonster = useMemo(() => {
    if (!selected) return { unitId, masterId: '', name: '', initial: '?' };
    const display = monsterPresentation(selected.masterId);
    return { unitId: selected.unitId, masterId: selected.masterId, name: selected.name, imageFilename: display.imageFilename, initial: display.shortName };
  }, [selected, unitId]);
  const wearers = useMemo(() => new Map(options.map((option) => [option.unitId, { name: option.name, masterId: option.masterId }])), [options]);
  const describeBuild = useCallback((build: CurrentBuild) => buildIssueReading(build, (id) => wearers.get(id)?.name), [wearers]);

  const profile = useMemo(() => (selected
    ? profileRequirements(selected.unitId, selected.masterId, preferences.monsterPreferences[selected.unitId])
    : undefined), [selected, preferences.monsterPreferences]);
  const requirements = edits !== null && edits.unitId === unitId ? edits.requirements : profile?.requirements;

  const runes = useMemo(() => (game ? readRunes(game.data) : []), [game]);
  const runesById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);
  const craftItems = useMemo(() => (game ? readCraftItems(game.data) : []), [game]);
  const itemsById = useMemo(() => new Map(craftItems.map((item) => [item.id, item])), [craftItems]);
  const alwaysCrits = requirements?.alwaysCrits ?? false;

  /* The priority list is resolved here, into the copies this one may not take from,
     so the search reads one list of wearers and never the switch or the order. */
  const sparing = settings.runesOnOtherMonsters && !settings.includeHigherPriority;
  const spared = useMemo(() => (sparing ? higherPriorityThan(preferences.monsterPriority, unitId) : []),
    [sparing, preferences.monsterPriority, unitId]);
  const input = useMemo<RuneOptimizationInput | undefined>(() => (selected && requirements ? {
    unitId: selected.unitId, monster: selected.record, runes, holds: preferences.runeHolds, spared, craftItems, requirements, settings,
  } : undefined), [selected, requirements, runes, preferences.runeHolds, spared, craftItems, settings]);
  const estimate = useMemo(() => (input ? estimateRuneOptimizationBuilds(input) : undefined), [input]);
  const trial = useRuneOptimizationWork(input, preferences.hardwareAcceleration, state === 'calculating');
  /* The question on screen. The account is never part of it: the player follows the
     table by moving, gemming, grinding and locking runes, and a sync or a lock that
     brings that back updates the builds (`rune-optimization-refresh.ts`). Listing
     fewer builds is the same table cut shorter. */
  const { resultCount, ...searchSettings } = settings;
  const inputKey = JSON.stringify({ unitId, requirements, settings: searchSettings, spared });
  /* A table stays on screen while its monster is chosen, whatever is changed above
     it: it is still the answer to the question it was asked, read with that
     question's own requirements, and the warning beside Find builds says the
     question on screen is now a different one. */
  const current = calculation !== undefined && calculation.unitId === unitId && selected ? calculation : undefined;
  const stale = current !== undefined && (current.inputKey !== inputKey || current.resultCount < resultCount);
  /* Once the user has asked again, the warning has been acted on: a search running
     under it would read as the new search answering the old question. */
  const warnStale = stale && state !== 'calculating';
  /* A build is held to the stat ranges on screen, not to those it was searched
     under: moving a range after the search dims every row now outside it, so the
     table answers the bounds the player is looking at. Its figures are still
     counted the way the search counted them, crits included; a CRI Rate range
     the Always crits switch has since set aside stops counting. */
  const tableAlwaysCritsCount = current?.requirements.alwaysCrits;
  const screenTargets = requirements?.targets;
  const screenCeilings = requirements?.ceilings;
  const tableLimits = useMemo(() => {
    if (tableAlwaysCritsCount === undefined || !screenTargets || !screenCeilings) return undefined;
    const withoutCriRate = (limits: Partial<Record<RankFigure, number>>) => {
      if (!alwaysCrits) return limits;
      const rest = { ...limits };
      delete rest.criRate;
      return rest;
    };
    return {
      targets: withoutCriRate(screenTargets), ceilings: withoutCriRate(screenCeilings),
      alwaysCrits: tableAlwaysCritsCount,
      alwaysElementAdvantage: current?.requirements.alwaysElementAdvantage ?? false,
      critLead: current?.requirements.critLead,
    };
  }, [tableAlwaysCritsCount, screenTargets, screenCeilings, alwaysCrits, current]);
  const builds = useMemo(() => (current && selected && tableLimits
    ? currentBuilds(current.answer.builds.slice(0, resultCount), {
      unitId: selected.unitId, monster: selected.record, requirements: tableLimits, settings: current.settings, spared: current.spared,
      before: { runes: current.runes, items: current.items },
      now: { runes: runesById, items: itemsById, holds: preferences.runeHolds },
    })
    : undefined), [current, selected, tableLimits, resultCount, runesById, itemsById, preferences.runeHolds]);
  const figuresNow = useCallback((bonuses: RuneOptimizationRequirements) => {
    if (!selected) return undefined;
    const figures = monsterTargetFigures(calculateMonsterTotals(selected.record), bonuses);
    return monsterStatTargetKeys.map((key) => figures[key]);
  }, [selected]);
  const currentFigures = useMemo(() => requirements ? figuresNow(requirements) : undefined, [figuresNow, requirements]);
  /* The table's `Now` row is counted the way its builds were. */
  const tableNowFigures = useMemo(() => current ? figuresNow(current.requirements) : undefined, [figuresNow, current]);
  const currentBuild = selected ? runeBuildName(activeRuneSets(selected.record).map((set) => set.name)) : '';

  function change(update: (current: RuneOptimizationRequirements) => RuneOptimizationRequirements) {
    if (!requirements) return;
    setEdits({ unitId, requirements: update(requirements) });
  }

  function chooseMonster(next: string) {
    setUnitId(next);
    setEdits(null);
    setChosenBuild(null);
  }

  function openBuild(index: number, opener: HTMLElement) {
    buildOpener.current = opener;
    setChosenBuild(index);
    setShowingBuild(true);
  }

  function closeBuild() {
    setShowingBuild(false);
    const opener = buildOpener.current;
    buildOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }

  async function calculate() {
    if (!input || !requirements) return;
    const searched = {
      unitId, requirements, settings, spared, runes: runesById, items: itemsById, resultCount,
    };
    trial.cancel();
    setState('calculating');
    setPhase('candidates');
    setError('');
    setProgress(0);
    setChosenBuild(null);
    const outcome = await optimizeRuneBuilds(input, preferences.hardwareAcceleration, setProgress, setPhase, trial.problem);
    if (outcome.status === 'superseded') { setState('idle'); return; }
    if (outcome.status === 'failed') { setError(outcome.message); setState('error'); return; }
    trial.record(outcome.answer);
    setCalculation((previous) => ({ inputKey, answer: outcome.answer, ...searched, id: (previous?.id ?? 0) + 1 }));
    setState('idle');
  }

  if (!game) {
    return <WorkspacePage header={<OptimizationHeader />}>
      <section className="empty-state">
        <h2>Finds the rune builds that meet what a monster&apos;s profile asks for.</h2>
        <p className="next-step">Import your game data first. The search reads every rune you own, so there is nothing to combine without them.</p>
      </section>
    </WorkspacePage>;
  }

  const plan = runeOptimizationDepthPlans[settings.depth];
  const depthStep = runeOptimizationDepths.indexOf(settings.depth) + 1;
  const workWarning = !input ? { tone: null, text: 'Choose a monster to check the actual search.' }
    : trial.finished ? runeOptimizationFinishedWarning(trial.finished)
    : trial.failed ? { tone: null, text: 'Search trial unavailable. Completion time is uncertain.' }
      : runeOptimizationWorkWarning(trial.work, plan.seconds * 1000);
  const workDetails = trial.work ? `After reduction: ${trial.work.slots.join(' × ')} choices by slot; ${trial.work.physicalRunes} physical runes, ${trial.work.variants} end states; ${trial.work.figures} judged figures, ${trial.work.ceilings} ceilings; up to ${trial.work.freeSlots} slots without a required set. Gems, Grindstones, stock limits and Intangible follow this calculation's settings.` : undefined;
  const changed = (same: boolean) => (same ? undefined : 'Changed for this calculation');
  const edited = edits !== null && edits.unitId === unitId;
  const display = selected ? monsterPresentation(selected.masterId) : undefined;

  return <WorkspacePage header={<OptimizationHeader />}>
    <div className="rune-optimization">
      <div className="panel rune-optimization-monster-panel">
        <div className="filter-group rune-optimization-monster">
          <label className="filter-label" htmlFor="rune-optimization-monster">Monster</label>
          {/* The portrait sits inside the field, at the start of the name it
              belongs to. Its box is there with no monster chosen too, so choosing
              one fills a space rather than pushing the name along (`AGENTS.md` §2). */}
          <div className="rune-optimization-monster-select">
            <MonsterPortrait imageFilename={display?.imageFilename} initial={display?.shortName ?? ''}
              name={selected?.name ?? ''} decorative />
            <Dropdown id="rune-optimization-monster" value={selected ? unitId : ''} placeholder="Choose a monster"
              onChange={(event) => chooseMonster(event.target.value)}>
              {options.map((option) => <option key={option.unitId} value={option.unitId}>{option.name}</option>)}
            </Dropdown>
          </div>
          {/* Always on screen and only enabled with a monster to open, so the
              panel keeps its height whether or not one is chosen. */}
          <Button size="compact" className="rune-optimization-open-preset" disabled={!selected}
            aria-haspopup="dialog"
            onClick={(event) => {
              if (selected) onOpenMonster({ kind: 'copy', unitId: selected.unitId, masterId: selected.masterId }, event.currentTarget);
            }}>
            <PencilIcon /><span>Open preset</span>
          </Button>
        </div>

        {/* How hard to look, beside the button that starts looking: these two are
            read at the moment of searching, and nowhere else on the page. */}
        <div className="rune-optimization-search">
          <div className="filter-group rune-optimization-depth">
            <div className="rune-optimization-depth-control">
              <label className="filter-label" htmlFor="rune-optimization-depth">Depth</label>
              <input id="rune-optimization-depth" type="range" min="1" max="10" step="1" value={depthStep}
                aria-valuetext={`${depthStep} of 10. ${runeOptimizationDepthReach[settings.depth]}`}
                aria-describedby="rune-optimization-depth-estimate rune-optimization-work-warning"
                onChange={(event) => {
                  const step = event.currentTarget.valueAsNumber;
                  const depth = Number.isInteger(step) ? runeOptimizationDepths[step - 1] : undefined;
                  if (depth !== undefined) onUpdate({ depth });
                }} />
              <output htmlFor="rune-optimization-depth">{depthStep} / 10</output>
            </div>
            {/* Written for someone who has never seen the cut: how much the depth
                looks through, and the longest it may take — "up to", because most
                searches finish well inside it. */}
            <div id="rune-optimization-depth-estimate"><Provenance>{`${estimate === undefined
              ? runeOptimizationDepthReach[settings.depth]
              : `Before reduction: around ${roughCount(estimate, general)} combinations`} · search up to ${plan.seconds < 60
              ? `${plan.seconds} s` : `${plan.seconds / 60} min`}`}</Provenance></div>
            <p id="rune-optimization-work-warning" className="rune-optimization-work-warning type-caption"
              role="status" data-tone={workWarning.tone ?? 'neutral'} title={workDetails}>
              {workWarning.text || '\u00a0'}
            </p>
          </div>
          <div className="filter-group rune-optimization-count">
            <RadioLine name="rune-optimization-count" legend="Builds listed" current={String(settings.resultCount)}
              options={runeOptimizationResultCounts.map((count) => ({ value: String(count), label: String(count) }))}
              onChange={(count) => onUpdate({ resultCount: Number(count) as RuneOptimizationSettings['resultCount'] })} />
          </div>
        </div>

        <div className="rune-optimization-actions">
          <div className="rune-optimization-action-row">
            <Button tone="primary" size="prominent" className="rune-optimization-find" busy={state === 'calculating'} busyLabel="Searching…"
              disabled={!input} onClick={() => void calculate()}>Find builds</Button>
            {/* Stopping is a footnote to searching, so it is a mark beside the
                button rather than a second button of the same weight. It is
                there in every state, and can only be pressed while a search runs. */}
            <Button tone="danger" size="prominent" className="rune-optimization-stop" disabled={state !== 'calculating'}
              aria-label="Stop the search" title="Stop the search and keep found builds" onClick={() => stopRuneOptimization()}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Button>
          </div>
          {/* Always in the panel and only shown when it applies, so nothing beside
              it moves (`AGENTS.md` §2). */}
          <p className="rune-optimization-stale" role="status" data-shown={warnStale ? 'true' : undefined}
            aria-hidden={warnStale ? undefined : true}>
            The requirements or settings have changed since these builds were found. You should rebuild.
          </p>
          {/* At the foot of the panel, under the button that started the work:
              where the eye already is when the search is running. */}
          <div className="rune-optimization-status">
            {state === 'calculating'
              ? <p className="calculation-status rune-optimization-searching" role="status">{searchPhaseWords[phase]} {phase === 'searching' ? `${formatNumber(Math.round(progress * 100), general)} %` : ''}</p>
              : state === 'error'
                ? <p className="calculation-status" role="status">{error}</p>
                : current
                ? <CalculationStatus twoLines durationMs={current.answer.durationMs} backend={current.answer.backend} general={general}
                  detail={`${formatNumber(current.answer.combinations, general)} builds checked · ${formatNumber(current.answer.report.runes, general)} runes considered`} />
                : <p className="calculation-status" role="status">{selected ? 'Not calculated yet.' : ''}</p>}
          </div>
        </div>
      </div>

      {selected && requirements && profile && <section className="panel rune-optimization-requirements"
        aria-label="Requirements for this calculation">
        <div className="rune-optimization-question">
          <div className="filter-group rune-optimization-builds">
            <span className="filter-label">Builds</span>
            <RuneBuildField chosen={requirements.builds}
              onChange={(next) => change((state) => ({ ...state, builds: next }))} />
            <Provenance>{changed(sameList(requirements.builds, profile.requirements.builds))
              ?? (profile.requirements.builds.length === 0 ? 'The preset names no build, so any will do' : '')}</Provenance>
          </div>
          <div className="rune-optimization-slot-row">
            {runeSlotKeys.map((key) => <div className="filter-group rune-optimization-slot" key={key}>
              <span className="filter-label">Slot {slotNumbers[key]}</span>
              <RuneSlotMainField slot={slotNumbers[key]} options={runeSlotMainsBySlot[key]}
                chosen={requirements.slotMains[key]} className="rune-optimization-slot-field"
                onChange={(next) => change((state) => ({ ...state, slotMains: { ...state.slotMains, [key]: next } }))} />
              <Provenance>{changed(sameList(requirements.slotMains[key], profile.requirements.slotMains[key]))
                ?? (profile.sources.slots[key] === 'user' ? '' : 'What most players wear')}</Provenance>
            </div>)}
            <div className="filter-group rune-optimization-rank">
              <label className="filter-label" htmlFor="rune-optimization-rank">Rank by</label>
              <Dropdown id="rune-optimization-rank" value={requirements.rankBy}
                onChange={(event) => change((state) => ({ ...state, rankBy: event.target.value as RankFigure }))}>
                {monsterStatTargetKeys.map((key) => <option key={key} value={key}>{figureLabels[key]}</option>)}
              </Dropdown>
              <Provenance>{changed(requirements.rankBy === profile.requirements.rankBy)
                ?? (profile.sources.rankBy === 'profile' ? '' : 'Chosen from the monster’s type')}</Provenance>
            </div>
          </div>
          <div className="filter-group rune-optimization-targets" role="group" aria-label="Stats">
            <span className="filter-label">Stats</span>
            <div className="stat-ranges">
              {monsterStatTargetKeys.map((key) => {
                /* A monster that always crits is never asked for CRI Rate, so the
                   fields say so by standing still rather than by vanishing. */
                const crits = key === 'criRate' && alwaysCrits;
                const limit = (end: 'targets' | 'ceilings') => (raw: string) => {
                  const value = readTargetField(key, raw);
                  change((state) => {
                    const limits = { ...state[end] };
                    if (value === undefined) delete limits[key];
                    else limits[key] = value;
                    return { ...state, [end]: limits };
                  });
                };
                return <StatRangeField key={key} figure={key} label={figureLabels[key]}
                  atLeast={requirements.targets[key]} atMost={requirements.ceilings[key]}
                  onAtLeast={limit('targets')} onAtMost={limit('ceilings')}
                  disabled={crits} title={crits ? 'Always crits, so no CRI Rate is needed' : undefined}
                  current={<>
                    {currentFigures ? formatNumber(currentFigures[figureIndex(key)], general) : '—'}
                    {key === 'criRate' && <FigureMarks marks={requirements ? criticalRateMarks(requirements) : []} />}
                  </>} />;
              })}
            </div>
            <Provenance>{changed(monsterStatTargetKeys.every((key) => requirements.targets[key] === profile.requirements.targets[key]
              && requirements.ceilings[key] === profile.requirements.ceilings[key])) ?? ''}</Provenance>
          </div>
          {/* Under the question it undoes, and always there: disabled until
              something here differs from the preset. */}
          <div className="rune-optimization-reset">
            <Button size="compact" disabled={!edited} onClick={() => setConfirmingReset(true)}>Reset to preset</Button>
          </div>
        </div>

        <aside className="rune-optimization-settings" aria-label="Settings">
          <div className="filter-group rune-optimization-sets">
            <span className="filter-label">Any set</span>
            <CheckboxRow label="Allow broken sets" checked={requirements.allowBroken}
              onChange={(checked) => change((state) => ({ ...state, allowBroken: checked }))} />
            <CheckboxRow label="Allow Intangible runes" checked={requirements.allowIntangible}
              onChange={(checked) => change((state) => ({ ...state, allowIntangible: checked }))} />
            <CheckboxRow label="Allow Immemorial Gems and Grindstones" checked={requirements.allowImmemorial}
              onChange={(checked) => change((state) => ({ ...state, allowImmemorial: checked }))} />
            <Provenance>{changed(requirements.allowBroken === profile.requirements.allowBroken
              && requirements.allowIntangible === profile.requirements.allowIntangible
              && requirements.allowImmemorial === profile.requirements.allowImmemorial) ?? ''}</Provenance>
          </div>
          <CraftSetting legend="Gems" name="rune-optimization-gems" use={settings.gems} grade={settings.gemGrade} roll={settings.gemRollAssumption}
            onUse={(gems) => onUpdate({ gems })} onGrade={(gemGrade) => onUpdate({ gemGrade })} onRoll={(gemRollAssumption) => onUpdate({ gemRollAssumption })} />
          <CraftSetting legend="Grindstones" name="rune-optimization-grinds" use={settings.grinds} grade={settings.grindGrade} roll={settings.grindRollAssumption}
            onUse={(grinds) => onUpdate({ grinds })} onGrade={(grindGrade) => onUpdate({ grindGrade })} onRoll={(grindRollAssumption) => onUpdate({ grindRollAssumption })} />
          <div className="filter-group rune-optimization-sources">
            <span className="filter-label">Runes</span>
            {/* Both worded as what ticking them adds, and both start off. Neither
                disables the other: the second is simply moot while the first is on. */}
            <CheckboxRow label="Only use runes from inventory" checked={!settings.runesOnOtherMonsters}
              onChange={(inventoryOnly) => onUpdate({ runesOnOtherMonsters: !inventoryOnly })} />
            <CheckboxRow label="Include runes from higher-priority monsters" checked={settings.includeHigherPriority}
              onChange={(includeHigherPriority) => onUpdate({ includeHigherPriority })} />
            <CheckboxRow label="Count unfinished runes at their +15 main stat" checked={settings.unfinishedAtMaximum}
              onChange={(unfinishedAtMaximum) => onUpdate({ unfinishedAtMaximum })} />
          </div>
        </aside>
      </section>}

      {/* The preset's answers replace every change made here, which cannot be
          undone, so it is asked once. The safe answer takes focus. */}
      {confirmingReset && <Overlay labelledBy="rune-optimization-reset-title" describedBy="rune-optimization-reset-text"
        className="speed-confirm" onClose={() => setConfirmingReset(false)}>
        <div className="overlay-body">
          <div>
            <p className="eyebrow">Reset to preset</p>
            <h2 id="rune-optimization-reset-title">Put back what the preset says?</h2>
          </div>
          <p id="rune-optimization-reset-text">
            Every change made here for this calculation — builds, slots, ranking, stats and the set allowances — goes back to the monster’s preset.
          </p>
          <div className="dialog-actions">
            <Button autoFocus onClick={() => setConfirmingReset(false)}>Keep my changes</Button>
            <Button tone="danger" onClick={() => { setEdits(null); setConfirmingReset(false); }}>Reset to preset</Button>
          </div>
        </div>
      </Overlay>}

      {calculation && calculation.unitId === unitId && !selected && state !== 'calculating' && <p className="notice warning" role="status">
        This monster is no longer in the account, so its builds have nowhere to go. Choose another monster.
      </p>}
      {current && !current.answer.complete && <p className="notice warning" role="status">
        {current.answer.stoppedBy === 'user'
          ? 'The search was stopped. The builds it found are kept below.'
          : 'The search reached its time limit. The builds it found are kept below.'}
        {' '}The remaining combinations have not been ruled out.
      </p>}

      {current && builds && selected && tableNowFigures && <Results key={current.id} answer={current.answer} builds={builds} rankBy={current.requirements.rankBy}
        currentBuild={currentBuild} currentFigures={tableNowFigures} general={general}
        describe={describeBuild}
        chosen={chosenBuild} onChoose={openBuild} />}
    </div>

    {builds && showingBuild && chosenBuild !== null && builds[chosenBuild] && <RuneBuildOverlay
      index={chosenBuild} buildName={buildNameOf(builds[chosenBuild].runes.map((rune) => rune.setId))}
      moves={builds[chosenBuild].moves} runes={builds[chosenBuild].runes} short={builds[chosenBuild].short}
      runesById={runesById} monster={buildMonster} wearer={(id) => wearers.get(id)}
      general={general} onClose={closeBuild} onOpenRune={onOpenRune} onOpenMonster={onOpenMonster} />}
  </WorkspacePage>;
}

function OptimizationHeader() {
  return <PageHeader title="Rune Optimization"
    tagline="Six slots, thousands of runes, one answer. Let your computer do the arithmetic so you can go back to pretending it was intuition." />;
}

function CraftSetting({ legend, name, use, grade, roll, onUse, onGrade, onRoll }: {
  legend: string;
  name: string;
  use: CraftUse;
  grade: ItemGrade;
  roll: CraftRollAssumption;
  onUse: (use: CraftUse) => void;
  onGrade: (grade: ItemGrade) => void;
  onRoll: (roll: CraftRollAssumption) => void;
}) {
  /* Both selects stay mounted and only disable, so choosing None cannot close up
     the row under the click (`AGENTS.md` §2). A grade is only a question for a
     theoretical item — a held one has its own. */
  return <div className={`filter-group rune-optimization-craft ${name}`}>
    <RadioLine name={name} legend={legend} current={use}
      options={craftUses.map((value) => ({ value, label: craftUseLabels[value] }))} onChange={onUse} />
    <div className="rune-optimization-craft-choices">
      <Dropdown aria-label={`${legend}: grade`} value={grade} disabled={use !== 'theoretical'}
        onChange={(event) => onGrade(event.target.value as ItemGrade)}>
        {itemGrades.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </Dropdown>
      <Dropdown aria-label={`${legend}: roll`} value={roll} disabled={use === 'none'}
        onChange={(event) => onRoll(event.target.value as CraftRollAssumption)}>
        {craftRollAssumptions.map((entry) => <option key={entry} value={entry}>{craftRollLabels[entry]} roll</option>)}
      </Dropdown>
    </div>
  </div>;
}

function Results({ answer, builds, rankBy, currentBuild, currentFigures, general, describe, chosen, onChoose }: {
  answer: RuneOptimizationAnswer;
  builds: readonly CurrentBuild[];
  rankBy: RankFigure;
  currentBuild: string;
  currentFigures: readonly number[];
  general: Preferences['general'];
  /** What changed under a build since the search, in words; empty where nothing did. */
  describe: (build: CurrentBuild) => string;
  chosen: number | null;
  onChoose: (index: number, opener: HTMLElement) => void;
}) {
  const rows = useMemo<ResultRow[]>(() => builds.map((build, index) => ({
    index, build, name: buildNameOf(build.runes.map((rune) => rune.setId)), issue: describe(build),
  })), [builds, describe]);
  const columns = useMemo<SortableColumn<ResultRow>[]>(() => [
    { key: 'index', label: '#', align: 'left', compare: (left, right) => left.index - right.index },
    { key: 'build', label: 'Build', align: 'left', compare: (left, right) => left.name.localeCompare(right.name) },
    { key: 'moves', label: 'Moves', align: 'right', compare: (left, right) => left.build.moves - right.build.moves },
    ...monsterStatTargetKeys.map((key): SortableColumn<ResultRow> => ({
      key, label: figureLabels[key], align: 'right', initialDirection: 'descending',
      compare: (left, right) => figureOf(left.build, figureIndex(key)) - figureOf(right.build, figureIndex(key)),
    })),
  ], []);
  const { sorted, sort, toggle } = useSortedRows(rows, columns, { key: rankBy, direction: 'descending' },
    (left, right) => left.index - right.index);
  const cell = columnClasses(columns);
  const slots = answer.report.slots;

  return <section className="rune-optimization-results" aria-labelledby="rune-optimization-results-title">
    <h3 id="rune-optimization-results-title" className="type-heading">Builds</h3>
    <table className="grid-table rune-optimization-table" aria-label="Rune builds">
      <TableColumnGroup columns={runeOptimizationTableColumns} />
      <SortableHeader columns={columns} sort={sort} onToggle={toggle} />
      <tbody>
        <tr className="rune-optimization-current">
          <td className={cell('index')}>Now</td>
          <td className={cell('build')}>{currentBuild || 'No runes equipped'}</td>
          <td className={cell('moves')}>—</td>
          {monsterStatTargetKeys.map((key) => <td key={key} className={cell(key)}>
            {formatNumber(currentFigures[figureIndex(key)], general)}
          </td>)}
        </tr>
        {sorted.length === 0 && <tr><td className="table-empty-state" colSpan={columns.length}>
          {!answer.complete
            ? 'No build found before the search stopped. This does not rule out a build that meets your requirements. Try greater depth or narrower requirements.'
            : slots.some((slot) => slot.kept === 0)
            ? `No build meets every requirement. No rune can fill slot ${slots.filter((slot) => slot.kept === 0).map((slot) => slot.slot).join(', ')} under these requirements. Widen the stat ranges, slot mains or builds.`
            : answer.report.keep !== null
              ? 'No build found in this guided shortlist. Try greater depth or widen the requirements.'
              : 'No build meets every requirement. Lower a target, or allow more builds.'}
        </td></tr>}
        {/* The whole row opens the build; the number is the same way in for the
            keyboard, and the element focus returns to when the overlay closes. */}
        {/* A build that no longer holds keeps its row, dimmed and marked, so the
            reader does not lose the one they were following. */}
        {sorted.map((row) => <tr key={row.index} data-chosen={chosen === row.index ? 'true' : undefined}
          data-stale={row.issue === '' ? undefined : 'true'}
          onClick={(event) => onChoose(row.index, event.currentTarget.querySelector('button') ?? event.currentTarget)}>
          <td className={cell('index')}>
            <button type="button" className="rune-optimization-choose" aria-haspopup="dialog"
              aria-label={`Show build ${row.index + 1}`} onClick={(event) => { event.stopPropagation(); onChoose(row.index, event.currentTarget); }}>
              {row.index + 1}
            </button>
          </td>
          <td className={cell('build')}>
            <span className="rune-optimization-build-name">
              <span className="rune-optimization-build-text">{row.name}</span>
              <FigureMarks marks={buildIssueMarks(row.issue)} reserve={1} />
            </span>
          </td>
          <td className={cell('moves')}>{formatNumber(row.build.moves, general)}</td>
          {monsterStatTargetKeys.map((key) => <td key={key} className={cell(key)}
            title={row.build.figures === null ? 'A rune in this build is no longer in the account' : undefined}>
            {row.build.figures === null ? '—' : formatNumber(row.build.figures[figureIndex(key)], general)}
          </td>)}
        </tr>)}
      </tbody>
    </table>
  </section>;
}
