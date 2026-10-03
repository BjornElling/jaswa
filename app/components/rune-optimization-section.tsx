import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { CalculationStatus } from './calculation-status';
import { CheckboxRow, RadioLine } from './form-controls';
import { Dropdown } from './dropdown';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { PageHeader } from './page-chrome';
import { RuneBuildField } from './rune-build-field';
import { RuneBuildOverlay } from './rune-build-overlay';
import type { OpenRuneOverlay } from './rune-link';
import { RuneSlotMainField } from './rune-slot-main-field';
import { SortableHeader } from './sortable-table';
import { TableColumnGroup } from './data-table-page';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { WorkspacePage } from './workspace-page';
import { cancelRuneOptimization, optimizeRuneBuilds } from '../lib/compute/rune-optimization-client';
import type { RuneOptimizationAnswer } from '../lib/compute/rune-optimization-protocol';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { runeSlotKeys } from '../lib/monster-defaults';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterCopyNames } from '../lib/monster-names';
import { monsterCompositeTargetMaximum, monsterStatTargetKeys } from '../lib/monster-preferences';
import { calculateMonsterTotals, monsterTargetFigures } from '../lib/monster-stats';
import { craftRollAssumptions, craftRollLabels, itemGrades, readCraftItems } from '../lib/rune-craft-items';
import type { CraftRollAssumption } from '../lib/rune-craft-items';
import { figureIndex } from '../lib/rune-optimization-problem';
import type { RankFigure, RuneOptimizationInput, RuneOptimizationRequirements } from '../lib/rune-optimization-problem';
import { currentBuilds } from '../lib/rune-optimization-refresh';
import type { CurrentBuild } from '../lib/rune-optimization-refresh';
import { profileRequirements, sameList } from '../lib/rune-optimization-requirements';
import {
  craftUseLabels, craftUses, runeOptimizationDepthLabels, runeOptimizationDepthPlans, runeOptimizationDepths,
  runeOptimizationResultCounts,
} from '../lib/rune-optimization-settings';
import type { CraftUse, RuneOptimizationSettings } from '../lib/rune-optimization-settings';
import { presetTargetColumns, presetTargetMaximum } from '../lib/rune-potential-presets';
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

type MonsterOption = { unitId: string; masterId: string; name: string; record: GameRecord };

/* `runes` is the account as the search read it, which a build is re-read against
   when a sync brings back the work the player did from the table. */
type Calculation = { inputKey: string; answer: RuneOptimizationAnswer; runes: ReadonlyMap<string, Rune>; id: number };

type ResultRow = { index: number; build: CurrentBuild; name: string };

/** A build whose rune has left the account has no figure, and sorts below every build that has one. */
const figureOf = (build: CurrentBuild, at: number) => build.figures?.[at] ?? -Infinity;

function buildNameOf(setIds: readonly number[]): string {
  return runeBuildName(activeRuneSets({ runes: setIds.map((setId) => ({ set_id: setId })) }).map((set) => set.name));
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
  const [unitId, setUnitId] = useSessionStorageState<string>('jaswa.runeOptimization.unitId', '', isString);
  const [edits, setEdits] = useState<{ unitId: string; requirements: RuneOptimizationRequirements } | null>(null);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  /* The build last opened stays marked in the table after its overlay closes, so
     the reader comes back to the row they were reading rather than to the top. */
  const [chosenBuild, setChosenBuild] = useState<number | null>(null);
  const [showingBuild, setShowingBuild] = useState(false);
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
  const wearers = useMemo(() => new Map(options.map((option) => [option.unitId, { name: option.name, masterId: option.masterId }])), [options]);

  const profile = useMemo(() => (selected
    ? profileRequirements(selected.unitId, selected.masterId, preferences.monsterPreferences[selected.unitId])
    : undefined), [selected, preferences.monsterPreferences]);
  const requirements = edits !== null && edits.unitId === unitId ? edits.requirements : profile?.requirements;

  const runes = useMemo(() => (game ? readRunes(game.data) : []), [game]);
  const runesById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);
  const craftItems = useMemo(() => (game ? readCraftItems(game.data) : []), [game]);

  const input = useMemo<RuneOptimizationInput | undefined>(() => (selected && requirements ? {
    unitId: selected.unitId, monster: selected.record, runes, holds: preferences.runeHolds, craftItems, requirements, settings,
  } : undefined), [selected, requirements, runes, preferences.runeHolds, craftItems, settings]);
  /* What the table answers. The import is not part of it: the player follows the
     table by moving, gemming and grinding runes, and a sync bringing that back must
     update the builds rather than throw them away (`rune-optimization-refresh.ts`). */
  const inputKey = JSON.stringify({ unitId, requirements, settings, holds: preferences.runeHolds });
  const current = calculation?.inputKey === inputKey ? calculation : undefined;
  const builds = useMemo(() => (current && selected
    ? currentBuilds(current.answer.builds, current.runes, runesById, selected.record, selected.unitId)
    : undefined), [current, selected, runesById]);
  const runesChanged = current !== undefined && current.runes !== runesById;

  const currentFigures = useMemo(() => {
    if (!selected) return undefined;
    const figures = monsterTargetFigures(calculateMonsterTotals(selected.record));
    return monsterStatTargetKeys.map((key) => figures[key]);
  }, [selected]);
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
    if (!input) return;
    const searched = runesById;
    setState('calculating');
    setProgress(0);
    setChosenBuild(null);
    const outcome = await optimizeRuneBuilds(input, preferences.hardwareAcceleration, setProgress);
    if (outcome.status === 'superseded') { setState('idle'); return; }
    if (outcome.status === 'failed') { setState('error'); setCalculation(undefined); return; }
    setCalculation((previous) => ({ inputKey, answer: outcome.answer, runes: searched, id: (previous?.id ?? 0) + 1 }));
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
  const changed = (same: boolean) => (same ? undefined : 'Changed for this calculation');

  return <WorkspacePage header={<OptimizationHeader />}>
    <div className="rune-optimization">
      <p className="lead">
        Choose a monster. Its profile says what the build must reach; change anything below for this calculation only — the profile itself stays as it is.
      </p>

      <div className="filter-panel rune-optimization-monster-panel">
        <div className="filter-group rune-optimization-monster">
          <label className="filter-label" htmlFor="rune-optimization-monster">Monster</label>
          <div className="filter-group-controls">
            <Dropdown id="rune-optimization-monster" value={selected ? unitId : ''} placeholder="Choose a monster"
              onChange={(event) => chooseMonster(event.target.value)}>
              {options.map((option) => <option key={option.unitId} value={option.unitId}>{option.name}</option>)}
            </Dropdown>
            {selected && <MonsterLink target={{ kind: 'copy', unitId: selected.unitId, masterId: selected.masterId }}
              name="Open profile" onOpen={onOpenMonster} />}
          </div>
        </div>
        <div className="filter-panel-actions rune-optimization-actions">
          <div className="rune-optimization-action-row">
            <Button tone="important" size="prominent" busy={state === 'calculating'} busyLabel="Searching…"
              disabled={!input} onClick={() => void calculate()}>Find builds</Button>
            <Button size="prominent" disabled={state !== 'calculating'} onClick={() => cancelRuneOptimization()}>Stop</Button>
          </div>
          <button type="button" className="filter-reset" disabled={edits === null || edits.unitId !== unitId}
            onClick={() => setEdits(null)}>Back to the profile</button>
        </div>
      </div>

      {selected && requirements && profile && <section className="filter-panel rune-optimization-requirements"
        aria-label="Requirements for this calculation">
        <div className="filter-group rune-optimization-builds">
          <span className="filter-label">Builds</span>
          <RuneBuildField chosen={requirements.builds}
            onChange={(next) => change((state) => ({ ...state, builds: next }))} />
          <Provenance>{changed(sameList(requirements.builds, profile.requirements.builds))
            ?? (profile.requirements.builds.length === 0 ? 'The profile names no build, so any will do' : 'From the profile')}</Provenance>
        </div>
        <div className="filter-group rune-optimization-intangible">
          <span className="filter-label">Intangible</span>
          <CheckboxRow label="Allow Intangible runes" checked={requirements.allowIntangible}
            onChange={(checked) => change((state) => ({ ...state, allowIntangible: checked }))} />
          <Provenance>{changed(requirements.allowIntangible === profile.requirements.allowIntangible) ?? 'From the profile'}</Provenance>
        </div>
        {runeSlotKeys.map((key) => <div className={`filter-group rune-optimization-${key}`} key={key}>
          <span className="filter-label">Slot {slotNumbers[key]}</span>
          <RuneSlotMainField slot={slotNumbers[key]} options={runeSlotMainsBySlot[key]}
            chosen={requirements.slotMains[key]} className="rune-optimization-slot-field"
            onChange={(next) => change((state) => ({ ...state, slotMains: { ...state.slotMains, [key]: next } }))} />
          <Provenance>{changed(sameList(requirements.slotMains[key], profile.requirements.slotMains[key]))
            ?? (profile.sources.slots[key] === 'user' ? 'From the profile' : 'What most players wear')}</Provenance>
        </div>)}
        <div className="filter-group rune-optimization-rank">
          <label className="filter-label" htmlFor="rune-optimization-rank">Rank by</label>
          <Dropdown id="rune-optimization-rank" value={requirements.rankBy}
            onChange={(event) => change((state) => ({ ...state, rankBy: event.target.value as RankFigure }))}>
            {monsterStatTargetKeys.map((key) => <option key={key} value={key}>{figureLabels[key]}</option>)}
          </Dropdown>
          <Provenance>{changed(requirements.rankBy === profile.requirements.rankBy)
            ?? (profile.sources.rankBy === 'profile' ? 'From the profile' : 'Chosen from the monster’s type')}</Provenance>
        </div>
        <div className="filter-group rune-optimization-targets" role="group" aria-label="At least">
          <span className="filter-label">At least</span>
          <div className="rune-optimization-target-row">
            {monsterStatTargetKeys.map((key) => <label className="rune-optimization-target" key={key}>
              <span className="overlay-stat-head">{figureLabels[key]}</span>
              <input className="rune-optimization-target-input" type="number" min={0} step={1} inputMode="numeric" placeholder="—"
                aria-label={`At least ${figureLabels[key]}`}
                value={requirements.targets[key] ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = Number(raw);
                  const ceiling = key === 'dmg' || key === 'ehp' || key === 'ehpD' ? monsterCompositeTargetMaximum : presetTargetMaximum;
                  change((state) => {
                    const targets = { ...state.targets };
                    /* Empty is absent — no floor — where `0` is a floor of nothing (`AGENTS.md` §3). */
                    if (raw === '' || !Number.isFinite(parsed)) delete targets[key];
                    else targets[key] = Math.min(ceiling, Math.max(0, Math.round(parsed)));
                    return { ...state, targets };
                  });
                }} />
              <span className="overlay-stat-current">{currentFigures ? formatNumber(currentFigures[figureIndex(key)], general) : '—'}</span>
            </label>)}
          </div>
          <Provenance>{changed(monsterStatTargetKeys.every((key) => requirements.targets[key] === profile.requirements.targets[key]))
            ?? 'From the profile. The figure under each field is what the monster has now.'}</Provenance>
        </div>
      </section>}

      <section className="filter-panel rune-optimization-settings" aria-label="How to search">
        <CraftSetting legend="Gems" name="rune-optimization-gems" use={settings.gems} grade={settings.gemGrade} roll={settings.gemRoll}
          onUse={(gems) => onUpdate({ gems })} onGrade={(gemGrade) => onUpdate({ gemGrade })} onRoll={(gemRoll) => onUpdate({ gemRoll })} />
        <CraftSetting legend="Grindstones" name="rune-optimization-grinds" use={settings.grinds} grade={settings.grindGrade} roll={settings.grindRoll}
          onUse={(grinds) => onUpdate({ grinds })} onGrade={(grindGrade) => onUpdate({ grindGrade })} onRoll={(grindRoll) => onUpdate({ grindRoll })} />
        <div className="filter-group rune-optimization-sources">
          <span className="filter-label">Runes</span>
          <CheckboxRow label="Take runes from other monsters" checked={settings.runesOnOtherMonsters}
            onChange={(runesOnOtherMonsters) => onUpdate({ runesOnOtherMonsters })} />
          <CheckboxRow label="Count unfinished runes at their +15 main stat" checked={settings.unfinishedAtMaximum}
            onChange={(unfinishedAtMaximum) => onUpdate({ unfinishedAtMaximum })} />
        </div>
        <div className="filter-group rune-optimization-depth">
          <RadioLine name="rune-optimization-depth" legend="Depth" current={settings.depth}
            options={runeOptimizationDepths.map((depth) => ({ value: depth, label: runeOptimizationDepthLabels[depth] }))}
            onChange={(depth) => onUpdate({ depth })} />
          <Provenance>{Number.isFinite(plan.keep)
            ? `Keeps the ${plan.keep} runes per slot and set that add most · stops after ${plan.seconds} s`
            : `Keeps every rune that could matter · stops after ${plan.seconds / 60} min`}</Provenance>
        </div>
        <div className="filter-group rune-optimization-count">
          <RadioLine name="rune-optimization-count" legend="Builds listed" current={String(settings.resultCount)}
            options={runeOptimizationResultCounts.map((count) => ({ value: String(count), label: String(count) }))}
            onChange={(count) => onUpdate({ resultCount: Number(count) as RuneOptimizationSettings['resultCount'] })} />
        </div>
      </section>

      <div className="rune-optimization-status">
        {state === 'calculating'
          ? <p className="calculation-status" role="status">Searching… {formatNumber(Math.round(progress * 100), general)} %</p>
          : current
            ? <CalculationStatus durationMs={current.answer.durationMs} backend={current.answer.backend} general={general}
              detail={`${formatNumber(current.answer.combinations, general)} builds checked · ${formatNumber(current.answer.report.runes, general)} runes considered`
                + (runesChanged ? ' · your runes changed since, and the builds follow them' : '')} />
            : <p className="calculation-status" role="status">{selected ? 'Not calculated yet.' : ''}</p>}
      </div>

      {state === 'error' && <p className="notice warning" role="status">JASWA could not search rune builds for this monster.</p>}
      {calculation && !current && state !== 'calculating' && <p className="notice warning" role="status">
        The requirements, the settings or the import changed. Find builds again to refresh this table.
      </p>}
      {current && !current.answer.complete && <p className="notice warning" role="status">
        The search stopped at its time limit before it had looked everywhere, so these are the best builds it found.
        Tighter requirements, or a quicker depth, let it finish.
      </p>}

      {current && builds && selected && currentFigures && <Results key={current.id} answer={current.answer} builds={builds} rankBy={requirements?.rankBy ?? 'ehp'}
        currentBuild={currentBuild} currentFigures={currentFigures} general={general}
        chosen={chosenBuild} onChoose={openBuild} />}
    </div>

    {builds && showingBuild && chosenBuild !== null && builds[chosenBuild] && <RuneBuildOverlay
      index={chosenBuild} buildName={buildNameOf(builds[chosenBuild].runes.map((rune) => rune.setId))}
      moves={builds[chosenBuild].moves} runes={builds[chosenBuild].runes} runesById={runesById}
      thisMonster={unitId} wearer={(id) => wearers.get(id)}
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

function Results({ answer, builds, rankBy, currentBuild, currentFigures, general, chosen, onChoose }: {
  answer: RuneOptimizationAnswer;
  builds: readonly CurrentBuild[];
  rankBy: RankFigure;
  currentBuild: string;
  currentFigures: readonly number[];
  general: Preferences['general'];
  chosen: number | null;
  onChoose: (index: number, opener: HTMLElement) => void;
}) {
  const rows = useMemo<ResultRow[]>(() => builds.map((build, index) => ({
    index, build, name: buildNameOf(build.runes.map((rune) => rune.setId)),
  })), [builds]);
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
    <header className="rune-optimization-results-head">
      <h3 id="rune-optimization-results-title" className="type-heading">Builds</h3>
      <p className="rune-optimization-provenance">
        Runes tried per slot: {slots.map((slot) => (slot.locked ? `${slot.slot} locked` : `${slot.slot}: ${slot.kept}`)).join(' · ')}
        {answer.report.keep === null ? '' : ` — up to ${answer.report.keep} per set, the ones that add most`}
      </p>
    </header>
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
          {slots.some((slot) => slot.kept === 0)
            ? `No rune can fill slot ${slots.filter((slot) => slot.kept === 0).map((slot) => slot.slot).join(', ')} under these requirements. Widen the slot mains or the builds.`
            : 'No build meets every requirement. Lower a target, or allow more builds.'}
        </td></tr>}
        {/* The whole row opens the build; the number is the same way in for the
            keyboard, and the element focus returns to when the overlay closes. */}
        {sorted.map((row) => <tr key={row.index} data-chosen={chosen === row.index ? 'true' : undefined}
          onClick={(event) => onChoose(row.index, event.currentTarget.querySelector('button') ?? event.currentTarget)}>
          <td className={cell('index')}>
            <button type="button" className="rune-optimization-choose" aria-haspopup="dialog"
              aria-label={`Show build ${row.index + 1}`} onClick={(event) => { event.stopPropagation(); onChoose(row.index, event.currentTarget); }}>
              {row.index + 1}
            </button>
          </td>
          <td className={cell('build')}>{row.name}</td>
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
