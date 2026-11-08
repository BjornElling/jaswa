import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, InlineButton, LabelSwap } from './button';
import { CalculationStatus } from './calculation-status';
import { FigureMarks } from './figure-marks';
import { buildIssueMarks, fightAddition } from '../lib/figure-marks';
import { FightAdditionText } from './fight-addition';
import { CheckboxRow, RadioLine } from './form-controls';
import { Dropdown } from './dropdown';
import { MonsterPortrait } from './monster-portrait';
import { GameStatisticsButton } from './game-statistics-button';
import type { OpenMonsterStatistics } from './game-statistics-button';
import { Overlay } from './overlay';
import { PencilIcon } from './pencil-icon';
import type { OpenMonsterOverlay } from './monster-link';
import type { OpenSpeedTeamOverlay } from './preset-speed-team-overlay';
import { isSpeedTeam } from '../lib/speed-tuning-preferences';
import { PageHeader } from './page-chrome';
import { RuneBuildField } from './rune-build-field';
import { RuneBuildOverlay } from './rune-build-overlay';
import { buildIssueReading } from '../lib/rune-build-issues';
import type { OpenRuneOverlay } from './rune-link';
import { RuneSlotMainField } from './rune-slot-main-field';
import { StatRangeField } from './stat-range-field';
import { TableColumnGroup } from './data-table-page';
import { SortMark } from './sortable-table';
import { WorkspacePage } from './workspace-page';
import { useRuneOptimizationWork } from './use-rune-optimization-work';
import { runeOptimizationFinishedWarning, runeOptimizationWorkWarning } from '../lib/rune-optimization-work';
import { cancelRuneOptimization, optimizeRuneBuilds, stopRuneOptimization } from '../lib/compute/rune-optimization-client';
import type { RuneOptimizationAnswer, RuneOptimizationPhase } from '../lib/compute/rune-optimization-protocol';
import { formatNumber } from '../lib/formatting';
import type { GeneralSettings } from '../lib/types';
import { readArtifact } from '../lib/artifacts';
import type { Artifact } from '../lib/artifacts';
import { artifactSkillAccuracy } from '../lib/artifact-skill-accuracy';
import { canEngraveArtifacts } from '../lib/monster-engrave-eligibility';
import type { GameRecord } from '../lib/game-data';
import { runeSlotKeys } from '../lib/monster-defaults';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterNameCollator } from '../lib/monster-grid';
import { presetPriorityOf } from '../lib/monster-priority';
import { includeHigherPriorityApplies, withheldRunes } from '../lib/rune-sources';
import { monsterCopyNames } from '../lib/monster-names';
import { monsterStatTargetKeys, profilesIn, readTargetField } from '../lib/monster-preferences';
import { completedTeamSets, isStatFigure, ledStats, monsterStatSheet } from '../lib/monster-stats';
import type { CombatBonuses, Leads, MonsterStatSheet, TeammateSets } from '../lib/monster-stats';
import { AreaLines, LeadFields, TeamLeads } from './fight-conditions';
import { areaFacts } from '../lib/area-facts';
import { accountItems, scenarioPresetId, monsterInPreset, runesInPreset } from '../lib/presets';
import { noTeamBonuses, rosterOf, teamBonusesFor } from '../lib/team-leads';
import { elementAdvantageHeld } from '../lib/element-advantage';
import type { Preset } from '../lib/presets';
import { readBuildingBonuses } from '../lib/account-buildings';
import { runeLockOf, runeLockScope, runeLocksFor } from '../lib/rune-locks';
import type { RuneLock, RuneLocks } from '../lib/rune-locks';
import { craftRollAssumptions, craftRollLabels, itemGrades, readCraftItems } from '../lib/rune-craft-items';
import type { CraftItem, CraftRollAssumption } from '../lib/rune-craft-items';
import { estimateRuneOptimizationBuilds, figureIndex } from '../lib/rune-optimization-problem';
import type { RankFigure, RuneOptimizationInput, RuneOptimizationRequirements } from '../lib/rune-optimization-problem';
import { buildFollowable, currentBuilds } from '../lib/rune-optimization-refresh';
import type { CurrentBuild } from '../lib/rune-optimization-refresh';
import { askable, profileRequirements } from '../lib/rune-optimization-requirements';
import type { RequirementsDraft } from '../lib/rune-optimization-requirements';
import {
  craftUseLabels, craftUses, runeOptimizationDepthPlans, runeOptimizationDepthReach, runeOptimizationDepths,
  runeOptimizationMonsterKey, runeOptimizationResultCounts,
} from '../lib/rune-optimization-settings';
import type { CraftUse, RuneOptimizationSettings } from '../lib/rune-optimization-settings';
import { roleTargetColumns } from '../lib/rune-roles';
import { referenceLines } from '../lib/rune-reference-stats';
import { runeSlotMainByEffect, runeSlotMainsBySlot } from '../lib/rune-slot-mains';
import { activeRuneSets, elementName } from '../lib/rune-sets';
import { runeBuildName } from '../lib/rune-set-pairs';
import { readRune, readRunes } from '../lib/runes';
import type { Rune } from '../lib/runes';
import { useSessionStorageState } from '../lib/session-storage-state';
import { runeOptimizationTableColumns, columnClasses, sortMarkSide } from '../lib/table-layouts';
import type { ImportedGame, ItemGrade, Preferences } from '../lib/types';

/**
 * **Rune Optimization — the page.** `docs/RUNE-OPTIMIZATION.md` is its contract.
 *
 * The page is a question and its answers. The question is the monster's profile —
 * builds, slot mains, targets, the figure to rank by — laid out for this one
 * calculation, where any part may be changed without touching the profile; how to
 * search is a separate panel of settings that hold for every monster. The answer is
 * a table of whole builds, ranked by the chosen figure — choosing another searches again —
 * with the monster's current build pinned above it as the thing to beat.
 *
 * Nothing here calculates. The requirements come from `rune-optimization-requirements.ts`,
 * the search runs in workers behind `rune-optimization-client.ts`, and every figure
 * in the table is one the Monsters page would print for the same six runes.
 */

const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/** The eleven figures under the words the profile uses for them. */
const figureLabels: Readonly<Record<RankFigure, string>> = Object.fromEntries(
  roleTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
) as Record<RankFigure, string>;

const isString = (value: unknown): value is string => typeof value === 'string';
const searchPhaseWords: Record<RuneOptimizationPhase, string> = {
  candidates: 'Reading rune end states…', reducing: 'Checking rune candidates…',
  guiding: 'Finding promising builds…', searching: 'Searching…', retrying: 'Retrying with one worker…',
};

function withoutAutomaticLeads(values: Leads, automatic: Leads): Leads {
  const stated = { ...values };
  for (const stat of ledStats) {
    if (stated[stat] !== undefined && automatic[stat] !== undefined) stated[stat] = (stated[stat] ?? 0) - (automatic[stat] ?? 0);
  }
  return stated;
}

function withAutomaticLeads(stated: Leads, automatic: Leads): Leads {
  const combined = { ...stated };
  for (const stat of ledStats) {
    if (automatic[stat] !== undefined) combined[stat] = (combined[stat] ?? 0) + (automatic[stat] ?? 0);
  }
  return combined;
}

type MonsterOption = { unitId: string; masterId: string; name: string; record: GameRecord };

/* The question the table answers — the monster and the requirements as they stood
   when it was searched, `inputKey` for the settings — and the account as the search read it:
   `runes` and `items`, which a build is re-read against when a sync brings
   back the work the player did from the table. */
type Calculation = {
  inputKey: string;
  presetId: string;
  unitId: string;
  requirements: RuneOptimizationRequirements;
  answer: RuneOptimizationAnswer;
  runes: ReadonlyMap<string, Rune>;
  items: ReadonlyMap<string, CraftItem>;
  resultCount: number;
  id: number;
};

type ResultRow = { index: number; build: CurrentBuild; name: string; mains: string; issue: string };

/** A build whose rune has left the account has no figure, and sorts below every build that has one. */
const figureOf = (build: CurrentBuild, at: number) => build.figures?.[at] ?? -Infinity;

function buildNameOf(setIds: readonly number[]): string {
  return runeBuildName(activeRuneSets({ runes: setIds.map((setId) => ({ set_id: setId })) }).map((set) => set.name));
}

/* A build's set name says nothing of slots 2, 4 and 6, and two builds of the same
   sets differ there more than anywhere. The mains are named in the vocabulary of
   the slot main fields above the table, so the two read alike; a slot no rune
   fills reads `—`. */
function slotMainsOf(runes: readonly { slot: number; mainStatId: number | undefined }[]): string {
  return [2, 4, 6].map((slot) => {
    const id = runes.find((rune) => rune.slot === slot)?.mainStatId;
    return (id === undefined ? undefined : runeSlotMainByEffect(id)) ?? '—';
  }).join('/');
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
function Provenance({ children = '' }: { children?: ReactNode }) {
  return <p className="rune-optimization-provenance">{children}</p>;
}

export function RuneOptimizationSection({ game, monsters, preferences, presets, presetId, onSelectPreset, onUpdate, canEngrave, onEngrave,
  runeLocks, onLock, onOpenMonster, onOpenStatistics, onOpenRune, onTuneSpeed, onEditPreset }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  presets: readonly Preset[];
  /** The preset every build on the page is for; `''` reads as Scenario. */
  presetId: string;
  onSelectPreset: (presetId: string) => void;
  onUpdate: (update: Partial<RuneOptimizationSettings>) => void;
  /** Whether builds may be engraved in the game's presets and Scenario; a preset built in JASWA always may. */
  canEngrave: boolean;
  onEngrave: (presetId: string, unitId: string, runeIds: readonly string[]) => Promise<void>;
  /** Every lock that holds (`rune-locks.ts`). */
  runeLocks: RuneLocks;
  onLock: (presetId: string, unitId: string, runeId: string, lock: RuneLock | null) => Promise<void>;
  onOpenMonster: OpenMonsterOverlay;
  onOpenStatistics: OpenMonsterStatistics;
  onOpenRune: OpenRuneOverlay;
  /** Opens this preset's team over the page. */
  onTuneSpeed: OpenSpeedTeamOverlay;
  /** Leaves for Presets with this preset chosen: a control naming a page (`AGENTS.md` §2.1). */
  onEditPreset: (presetId: string) => void;
}) {
  const settings = preferences.runeOptimization;
  const general = preferences.general;
  const [unitId, setUnitId] = useSessionStorageState<string>(runeOptimizationMonsterKey, '', isString);
  const [edits, setEdits] = useState<{ presetId: string; unitId: string; requirements: RequirementsDraft } | null>(null);
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
  const searchId = useRef(0);

  /* A search the user walked away from gives the processor back. */
  useEffect(() => () => cancelRuneOptimization(), []);

  /* Every build is for one preset: its runes are the preset's, and a rune
     the preset leaves in inventory is in inventory whatever other presets hold (`DECK-PRESETS.md` §4). */
  /* Choose the context before the copy: every preset is reachable, and only
     its members can become the question this page answers. */
  const preset = presets.find((entry) => entry.id === presetId) ?? presets.find((entry) => entry.id === scenarioPresetId);
  const activePresetId = preset?.id ?? scenarioPresetId;
  const tunable = preset !== undefined && isSpeedTeam(preset);
  const items = useMemo(() => accountItems(game?.data), [game]);
  /* Requirements and names follow the shared area profile; gear follows the team. */
  const profileScope = useMemo(() => presets.find((entry) => entry.id === activePresetId)?.profileScope ?? scenarioPresetId,
    [presets, activePresetId]);
  const profiles = useMemo(() => profilesIn(preferences.monsterPreferences, profileScope), [preferences.monsterPreferences, profileScope]);
  const names = useMemo(() => monsterCopyNames(monsters, profiles), [monsters, profiles]);
  const priority = useMemo(() => preset
    ? presetPriorityOf(preset, preferences.monsterPriority, preferences.presetPriority) : [],
  [preset, preferences.monsterPriority, preferences.presetPriority]);
  const priorityIndex = useMemo(() => new Map(priority.map((id, index) => [id, index])), [priority]);
  const options = useMemo<MonsterOption[]>(() => (preset ? monsters : [])
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null
      && preset?.members.includes(String(monster.unit_id)))
    .map((monster) => {
      const id = String(monster.unit_id);
      return { unitId: id, masterId: String(monster.unit_master_id ?? ''), name: names[id]?.name ?? id,
        record: preset ? monsterInPreset(monster, preset, items) : monster };
    })
    .sort((left, right) => {
      const leftRank = priorityIndex.get(left.unitId);
      const rightRank = priorityIndex.get(right.unitId);
      const priorityDifference = leftRank === undefined ? rightRank === undefined ? 0 : 1
        : rightRank === undefined ? -1 : leftRank - rightRank;
      return priorityDifference || monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId);
    }),
  [monsters, names, preset, items, priorityIndex]);
  /* Where the monsters off the priority list start; only a split with
     monsters on both sides earns a separator. */
  const unlistedFrom = options.findIndex((option) => !priorityIndex.has(option.unitId));
  const selected = options.find((option) => option.unitId === unitId);
  const buildMonster = useMemo(() => {
    if (!selected) return { unitId, masterId: '', name: '', initial: '?' };
    const display = monsterPresentation(selected.masterId);
    return { unitId: selected.unitId, masterId: selected.masterId, name: selected.name, imageFilename: display.imageFilename, initial: display.shortName };
  }, [selected, unitId]);
  /* A rune's Scenario location may name a copy outside the chosen preset. */
  const monstersByUnitId = useMemo(() => new Map(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => {
      const id = String(monster.unit_id);
      return [id, { name: names[id]?.name ?? id, masterId: String(monster.unit_master_id ?? '') }] as const;
    })), [monsters, names]);
  const describeBuild = useCallback((build: CurrentBuild) => buildIssueReading(build, (id) => monstersByUnitId.get(id)?.name), [monstersByUnitId]);

  const roster = useMemo(() => rosterOf(game?.data), [game]);
  /* The team's sets and, outside Scenario, the leads it fights under: both the
     preset's, never the profile's, so an edit here cannot carry a stale one. */
  const team = useMemo(() => preset && selected ? teamBonusesFor(preset, presets, selected.unitId, items, roster) : noTeamBonuses,
    [preset, presets, selected, items, roster]);
  const { teammateSets } = team;
  /* The preset's artifacts on the chosen monster, for *Leads and bonuses* to name
     their skill Accuracy. Shown only: no figure or search below reads it
     (`artifact-skill-accuracy.ts`). */
  const artifactAccuracy = useMemo(() => {
    const monster = selected ? roster.get(selected.unitId) : undefined;
    if (!preset || !selected || !monster || !canEngraveArtifacts(monster)) return [];
    return artifactSkillAccuracy((preset.artifactsOf.get(selected.unitId) ?? [])
      .map((id) => readArtifact(items.artifacts.get(id)))
      .filter((artifact): artifact is Artifact => artifact !== null));
  }, [preset, selected, items, roster]);
  const leaderNames = useMemo(() => Object.fromEntries(Object.entries(names).map(([id, entry]) => [id, entry.name])), [names]);
  const profile = useMemo(() => (selected
    ? profileRequirements(selected.unitId, selected.masterId, profiles[selected.unitId], team)
    : undefined), [selected, profiles, team]);
  /* A change made here is for this copy in this preset: the same copy in another
     preset is another question, and does not inherit it. */
  const edited = edits !== null && edits.unitId === unitId && edits.presetId === activePresetId;
  /* The account's buildings enter the composites here as they do on the Monsters
     page and in the overlay, so a build's DMG is the figure those pages show. */
  const buildings = useMemo(() => readBuildingBonuses(game?.data), [game]);
  const requirements = useMemo(() => {
    const draft = edited ? edits.requirements : profile?.requirements;
    return draft ? {
      ...draft,
      teammateSets,
      leads: team.leads.scenario ? draft.leads : team.leads.bonuses,
      alwaysElementAdvantage: Boolean(team.elementAdvantage) || draft.alwaysElementAdvantage,
      leadRules: team.leads.rules,
      automaticLeadLines: team.leads.automaticLines,
      buildings,
    } : undefined;
  }, [edited, edits, profile, teammateSets, team, buildings]);
  /* The requirements as a question the search can take: only once a figure to
     rank by is named, by the profile or here. Nothing names one for the user. */
  const question = useMemo(() => (requirements ? askable(requirements) : undefined), [requirements]);
  const unranked = requirements !== undefined && question === undefined;

  const accountRunes = useMemo(() => (game ? readRunes(game.data) : []), [game]);
  const runes = useMemo(() => (preset ? runesInPreset(accountRunes, preset) : []), [accountRunes, preset]);
  /* A member's runes in the preset are the preset's to say, so a rune its Scenario
     owner does not carry here is unengraved in the game's preset list, however it
     came off — in JASWA or in the game. Only a monster outside the preset is named. */
  const scenarioPlaces = useMemo(() => {
    const scenario = presets.find((entry) => entry.kind === 'scenario');
    if (!preset || preset.kind === 'scenario' || !scenario) return undefined;
    const members = new Set(preset.members);
    return new Map(accountRunes.map((rune) => {
      const owner = scenario.runeOwner.get(rune.id) ?? null;
      return [rune.id, owner !== null && members.has(owner) ? null : owner];
    }));
  }, [accountRunes, preset, presets]);
  /* The preset's locks as this monster reads them: its team's locks and exclusions.
     What the pool's other decks hold is `withheld`'s to say. */
  const locks = useMemo(() => (preset && unitId !== '' ? runeLocksFor(runeLocks, runeLockScope(preset), unitId) : {}),
    [preset, unitId, runeLocks]);
  const runesById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);
  const craftItems = useMemo(() => (game ? readCraftItems(game.data) : []), [game]);
  const itemsById = useMemo(() => new Map(craftItems.map((item) => [item.id, item])), [craftItems]);
  const alwaysCrits = requirements?.alwaysCrits ?? false;

  /* Whose runes this monster may take is `rune-sources.ts`'s one rule; the search
     reads its answer and never the priority list, the pool or the switches. */
  const { runesOnOtherMonsters, includeHigherPriority } = settings;
  const withheld = useMemo(() => (preset && unitId !== ''
    ? withheldRunes(preset, unitId, priority, { runesOnOtherMonsters, includeHigherPriority }, runeLocks) : {}),
  [preset, unitId, priority, runesOnOtherMonsters, includeHigherPriority, runeLocks]);
  const includeApplies = preset !== undefined && includeHigherPriorityApplies(settings);
  const inScenario = preset?.kind === 'scenario';
  const unlisted = inScenario && unitId !== '' && !priority.includes(unitId);
  /* Where another deck of the pool holds a rune, so a build taking it names that deck. */
  const poolPlaces = useMemo(() => {
    if (!preset || preset.poolRunes.size === 0) return undefined;
    const names = new Map(presets.map((entry) => [entry.id, entry.name]));
    return new Map([...preset.poolRunes].map(([runeId, [holder]]) => [runeId, { ...holder, presetName: names.get(holder.presetId) ?? '' }]));
  }, [preset, presets]);
  const gemPreservationRoles = useMemo(() => {
    const lines = referenceLines(game?.data);
    return preferences.runeRoles.flatMap((role) => {
      const base = lines?.get(role.type)?.stats;
      return base ? [{ role, base }] : [];
    });
  }, [game, preferences.runeRoles]);
  const input = useMemo<RuneOptimizationInput | undefined>(() => (selected && question && (!settings.limitChanges || settings.maxChanges !== undefined) ? {
    unitId: selected.unitId, monster: selected.record, runes, locks, withheld, craftItems, requirements: question, settings, gemPreservationRoles,
  } : undefined), [selected, question, runes, locks, withheld, craftItems, settings, gemPreservationRoles]);
  const estimate = useMemo(() => (input ? estimateRuneOptimizationBuilds(input) : undefined), [input]);
  const trial = useRuneOptimizationWork(input, preferences.hardwareAcceleration, state === 'calculating');
  /* The question on screen. The account is never part of it: the player follows the
     table by moving, gemming, grinding and locking runes, and a sync or a lock that
     brings that back updates the builds (`rune-optimization-refresh.ts`). Listing
     fewer builds is the same table cut shorter. */
  const { resultCount, ...searchSettings } = settings;
  const keyOf = (asked: RequirementsDraft | undefined) =>
    JSON.stringify({ presetId: activePresetId, unitId, requirements: asked, settings: searchSettings, withheld,
      gemRoles: preferences.runeRoles });
  const inputKey = keyOf(requirements);
  /* A table stays on screen while its monster is chosen, whatever is changed above
     it: it is still the answer to the question it was asked, read with that
     question's own requirements, and the warning beside Find builds says the
     question on screen is now a different one. */
  const current = calculation !== undefined && calculation.unitId === unitId && calculation.presetId === activePresetId && selected ? calculation : undefined;
  const stale = current !== undefined && (current.inputKey !== inputKey || current.resultCount < resultCount);
  /* Once the user has asked again, the warning has been acted on: a search running
     under it would read as the new search answering the old question. */
  const warnStale = stale && state !== 'calculating';
  /* A build is held to the requirements and settings on screen, not to those it was
     searched under: narrowing any of them after the search — a stat range, a slot
     main, broken sets refused, a Gem the settings no longer offer — dims every row
     it now rules out, so the table answers the question the player is looking at.
     Widening one dims nothing and finds nothing new; the stale warning says so. Its
     figures are still counted with the fight the search counted them in; a CRI
     Rate range the Always crits switch has since set aside stops counting. */
  const tableAlwaysCritsCount = current?.requirements.alwaysCrits;
  const tableLimits = useMemo(() => {
    if (tableAlwaysCritsCount === undefined || !requirements) return undefined;
    const withoutCriRate = (limits: Partial<Record<RankFigure, number>>) => {
      if (!alwaysCrits) return limits;
      const rest = { ...limits };
      delete rest.criRate;
      return rest;
    };
    return {
      targets: withoutCriRate(requirements.targets), ceilings: withoutCriRate(requirements.ceilings),
      builds: requirements.builds, slotMains: requirements.slotMains,
      allowBroken: requirements.allowBroken, allowIntangible: requirements.allowIntangible,
      alwaysCrits: tableAlwaysCritsCount,
      alwaysElementAdvantage: current?.requirements.alwaysElementAdvantage ?? false,
      leads: current?.requirements.leads,
      leadRules: current?.requirements.leadRules,
      automaticLeadLines: current?.requirements.automaticLeadLines,
      teammateSets,
      buildings,
    };
  }, [tableAlwaysCritsCount, requirements, alwaysCrits, current, teammateSets, buildings]);
  const builds = useMemo(() => (current && selected && tableLimits
    ? currentBuilds(current.answer.builds.slice(0, resultCount), {
      unitId: selected.unitId, monster: selected.record, requirements: tableLimits, settings, withheld,
      before: { runes: current.runes, items: current.items },
      now: { runes: runesById, items: itemsById, locks },
    })
    : undefined), [current, selected, tableLimits, resultCount, settings, withheld, runesById, itemsById, locks]);
  const sheetNow = useCallback((bonuses: RequirementsDraft) => (selected ? monsterStatSheet(selected.record, bonuses) : undefined), [selected]);
  const currentSheet = useMemo(() => requirements ? sheetNow(requirements) : undefined, [sheetNow, requirements]);
  /* The table's `Now` row is counted the way its builds were. */
  const tableNowFigures = useMemo(() => {
    const sheet = current ? sheetNow({ ...current.requirements, teammateSets, buildings }) : undefined;
    return sheet ? monsterStatTargetKeys.map((key) => sheet.figures[key]) : undefined;
  }, [sheetNow, current, teammateSets, buildings]);
  const element = selected ? elementName(selected.record.attribute) : undefined;
  const ownSets = useMemo(() => completedTeamSets(selected?.record.runes as Record<string, unknown>[] ?? []), [selected]);
  const currentBuild = selected ? runeBuildName(activeRuneSets(selected.record).map((set) => set.name)) : '';
  const currentMains = useMemo(() => {
    const engraved = Array.isArray(selected?.record.runes) ? selected.record.runes as unknown[] : [];
    const read = engraved.map(readRune).filter((rune): rune is Rune => rune !== null);
    return read.length === 0 ? '' : slotMainsOf(read);
  }, [selected]);
  /* A rune's main never changes under a Gem or a Grindstone, so the rune as the
     search read it names it even after it has left the account. */
  const mainOf = useCallback((runeId: string) => (current?.runes.get(runeId) ?? runesById.get(runeId))?.mainStatId,
    [current, runesById]);

  function change(update: (current: RequirementsDraft) => RequirementsDraft) {
    if (!requirements) return;
    setEdits({ presetId: activePresetId, unitId, requirements: update(requirements) });
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

  /* `asked` is the question on screen, except when Rank by starts the search in the
     same event that changes it, before a render has carried the new figure into
     `input`. The trial measured the question on screen, so only that one may reuse
     its prepared pool or record its time. */
  async function calculate(asked: RuneOptimizationRequirements | undefined = question) {
    if (!input || !asked) return;
    const onScreen = asked === question;
    const searched = {
      presetId: activePresetId, unitId, requirements: asked, runes: runesById, items: itemsById, resultCount,
    };
    const id = ++searchId.current;
    trial.cancel();
    setState('calculating');
    setPhase('candidates');
    setError('');
    setProgress(0);
    setChosenBuild(null);
    const outcome = await optimizeRuneBuilds(onScreen ? input : { ...input, requirements: asked },
      preferences.hardwareAcceleration, setProgress, setPhase, onScreen ? trial.problem : undefined);
    /* A search replaced by a newer one leaves the page to it. */
    if (id !== searchId.current) return;
    if (outcome.status === 'superseded') { setState('idle'); return; }
    if (outcome.status === 'failed') { setError(outcome.message); setState('error'); return; }
    if (onScreen) trial.record(outcome.answer);
    setCalculation((previous) => ({ inputKey: keyOf(asked), answer: outcome.answer, ...searched, id: (previous?.id ?? 0) + 1 }));
    setState('idle');
  }

  /* The table holds only the best builds by one figure, so another figure is another
     search. With a table on screen, or a search under way, choosing it starts that search. */
  function rankBy(figure: RankFigure | '') {
    if (!requirements || figure === '' || figure === requirements.rankBy) return;
    const next = { ...requirements, rankBy: figure };
    setEdits({ presetId: activePresetId, unitId, requirements: next });
    if (current || state === 'calculating') void calculate(next);
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
  const display = selected ? monsterPresentation(selected.masterId) : undefined;
  const area = areaFacts(preset, general, selected?.masterId);

  return <WorkspacePage header={<OptimizationHeader />}>
    <div className="rune-optimization">
      <div className="panel rune-optimization-monster-panel">
        <div className="filter-group rune-optimization-monster">
          <label className="filter-label" htmlFor="rune-optimization-preset">Preset</label>
          <Dropdown id="rune-optimization-preset" className="rune-optimization-preset-select" value={activePresetId}
            onChange={(event) => {
              const next = event.target.value;
              onSelectPreset(next);
              if (!presets.find((entry) => entry.id === next)?.members.includes(unitId)) setUnitId('');
              setEdits(null);
              setChosenBuild(null);
            }}>
            {presets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Dropdown>
          <label className="filter-label" htmlFor="rune-optimization-monster">Monster</label>
          {/* The portrait sits inside the field, at the start of the name it
              belongs to. Its box is there with no monster chosen too, so choosing
              one fills a space rather than pushing the name along (`AGENTS.md` §2). */}
          <div className="rune-optimization-monster-select">
            <MonsterPortrait imageFilename={display?.imageFilename} initial={display?.shortName ?? ''}
              name={selected?.name ?? ''} decorative />
            <Dropdown id="rune-optimization-monster" value={selected ? unitId : ''} placeholder={options.length ? 'Choose a monster' : 'No monsters in this preset'} disabled={!options.length}
              onChange={(event) => chooseMonster(event.target.value)}>
              {options.map((option, index) => <Fragment key={option.unitId}>
                {/* The priority list ends here and the alphabetical rest begins.
                    An `<hr>` in a select is a separator the browser will not
                    let anyone choose or hover. */}
                {index > 0 && index === unlistedFrom && <hr />}
                <option value={option.unitId}>{option.name}</option>
              </Fragment>)}
            </Dropdown>
          </div>
          {/* Both always on screen and only enabled when they have something to
              act on, so the panel keeps its height whether or not one is chosen.
              The profile and the way back to it sit side by side. */}
          <div className="rune-optimization-profile-row">
            <Button size="compact" className="rune-optimization-open-profile" disabled={!selected}
              aria-haspopup="dialog"
              onClick={(event) => {
                if (selected) onOpenMonster({ kind: 'copy', unitId: selected.unitId, masterId: selected.masterId }, event.currentTarget, activePresetId);
              }}>
              <PencilIcon /><span>Open profile</span>
            </Button>
            <Button size="compact" disabled={!edited} onClick={() => setConfirmingReset(true)}>Reset to profile</Button>
            <GameStatisticsButton size="compact" masterId={selected?.masterId} name={selected?.name ?? ''} onOpen={onOpenStatistics} />
          </div>
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
          <div className="rune-optimization-count-rank">
            {/* The two ways out to the preset, one above the other in the quiet
                box, ahead of the list's own settings: its page, and its team in
                an overlay. Always there, and only enabled once there is
                something to open: a preset, and for Speed Tuning a team. */}
            <div className="rune-optimization-shortcuts">
              <InlineButton className="rune-optimization-preset" disabled={!preset}
                aria-label={preset ? `Preset page for ${preset.name}` : 'Preset page'}
                onClick={() => { if (preset) onEditPreset(preset.id); }}>Preset</InlineButton>
              <InlineButton className="rune-optimization-speed" disabled={!tunable} aria-haspopup="dialog"
                aria-label={preset ? `Speed tuning for ${preset.name}` : 'Speed tuning'}
                title={tunable ? undefined : 'Only a preset with monsters has a team to tune.'}
                onClick={(event) => { if (tunable) onTuneSpeed(activePresetId, event.currentTarget); }}>Speed tuning</InlineButton>
            </div>
            {/* Named above its options as Rank by is above its list, so the two
                settings of one row read the same way. */}
            <div className="filter-group rune-optimization-count">
              <span className="filter-label" id="rune-optimization-count-label">Builds listed</span>
              <div className="radio-line-options" role="radiogroup" aria-labelledby="rune-optimization-count-label">
                {runeOptimizationResultCounts.map((count) => <label className="radio-chip" key={count}>
                  <input type="radio" name="rune-optimization-count" value={count} checked={settings.resultCount === count}
                    onChange={() => onUpdate({ resultCount: count })} />
                  <span>{count}</span>
                </label>)}
              </div>
            </div>
            <div className="filter-group rune-optimization-rank">
              <label className="filter-label" htmlFor="rune-optimization-rank">Rank by</label>
              <Dropdown id="rune-optimization-rank" value={requirements?.rankBy ?? ''}
                placeholder={!requirements ? 'Choose a monster' : unranked ? 'Choose a figure' : undefined} disabled={!requirements}
                aria-invalid={unranked || undefined}
                onChange={(event) => rankBy(event.target.value as RankFigure | '')}>
                {monsterStatTargetKeys.map((key) => <option key={key} value={key}>{figureLabels[key]}</option>)}
              </Dropdown>
              <Provenance>{requirements && profile && unranked ? 'The profile names none' : ''}</Provenance>
            </div>
          </div>
        </div>

        <div className="rune-optimization-actions">
          <div className="rune-optimization-action-row">
            {/* The reason sits on a wrapper because a disabled button takes no
                pointer, and in some browsers shows no title of its own. */}
            <span className="rune-optimization-find-hold"
              title={unranked ? 'No sort order yet. Choose a figure in Rank by.' : undefined}>
              <Button tone="primary" size="prominent" className="rune-optimization-find" busy={state === 'calculating'} busyLabel="Searching…"
                disabled={!input || (settings.limitChanges && settings.maxChanges === undefined)} onClick={() => void calculate()}>Find builds</Button>
            </span>
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
            <Provenance>{profile.requirements.builds.length === 0 ? 'The profile names no build, so any will do' : ''}</Provenance>
          </div>
          <div className="rune-optimization-slot-row">
            {runeSlotKeys.map((key) => <div className="filter-group rune-optimization-slot" key={key}>
              <span className="filter-label">Slot {slotNumbers[key]}</span>
              <RuneSlotMainField slot={slotNumbers[key]} options={runeSlotMainsBySlot[key]}
                chosen={requirements.slotMains[key]} className="rune-optimization-slot-field"
                onChange={(next) => change((state) => ({ ...state, slotMains: { ...state.slotMains, [key]: next } }))} />
            </div>)}
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
                  current={<FigureNow figure={key} sheet={currentSheet} bonuses={requirements} ownSets={ownSets}
                    element={element} general={general} />} />;
              })}
            </div>
          </div>
          {/* What the fight adds, as the profile states it and changeable here for
              this calculation alone. A preset's leads are its leaders' and are only
              read; Scenario's may be changed like any other answer. */}
          <div className="rune-optimization-fight">
            <div className="filter-group">
              <span className="filter-label">Settings</span>
              <CheckboxRow label="Always crits" checked={requirements.alwaysCrits}
                onChange={(checked) => change((state) => ({ ...state, alwaysCrits: checked }))} />
              <CheckboxRow label="Always element advantage" checked={requirements.alwaysElementAdvantage}
                disabled={Boolean(team.elementAdvantage)} title={elementAdvantageHeld(team)}
                onChange={(checked) => change((state) => ({ ...state, alwaysElementAdvantage: checked }))} />
              <Provenance />
            </div>
            <div className="filter-group">
              <span className="filter-label">Leads and bonuses</span>
              {team.leads.scenario
                ? <LeadFields values={withoutAutomaticLeads(requirements.leads ?? {}, team.leads.bonuses)} reading={team.leads} names={leaderNames}
                  artifactAccuracy={artifactAccuracy} general={general}
                  onChange={(stat, value) => change((state) => {
                  const leads = withoutAutomaticLeads(state.leads ?? {}, team.leads.bonuses);
                  if (value === undefined) delete leads[stat];
                  else leads[stat] = value;
                  return { ...state, leads: withAutomaticLeads(leads, team.leads.bonuses) };
                })} />
                : <TeamLeads reading={team.leads} names={leaderNames} artifactAccuracy={artifactAccuracy} general={general} />}
              <Provenance />
            </div>
            <div className="filter-group rune-optimization-area">
              <span className="filter-label" title={area.heading}>{area.heading}</span>
              <AreaLines facts={area} general={general} reserveThresholdRows />
            </div>
          </div>
        </div>

        <aside className="rune-optimization-settings" aria-label="Settings">
          <div className="filter-group rune-optimization-sets">
            <span className="filter-label">Runes</span>
            <CheckboxRow label="Allow broken sets" checked={requirements.allowBroken}
              onChange={(checked) => change((state) => ({ ...state, allowBroken: checked }))} />
            <CheckboxRow label="Allow Intangible runes" checked={requirements.allowIntangible}
              onChange={(checked) => change((state) => ({ ...state, allowIntangible: checked }))} />
            <Provenance />
          </div>
          <div className="filter-group rune-optimization-sources">
            <span className="filter-label">Selection</span>
            {/* Scenario is no preset, so the switch names it. Both wordings hold
                their room, so choosing another preset moves nothing. */}
            <CheckboxRow label={<LabelSwap showing={inScenario ? 'scenario' : 'preset'} faces={{
              preset: 'Only runes not engraved in preset', scenario: 'Only runes not already engraved in Scenario',
            }} />} checked={!settings.runesOnOtherMonsters}
              onChange={(inventoryOnly) => onUpdate({ runesOnOtherMonsters: !inventoryOnly })} />
            <CheckboxRow label="Just fill in empty slots" checked={settings.fillEmptySlotsOnly}
              onChange={(fillEmptySlotsOnly) => onUpdate({ fillEmptySlotsOnly })} />
            {/* Nothing to include while only free runes are taken; the stored
                choice is kept for when it applies again. A monster off Scenario's
                list outranks no one, so for it the switch opens every engraved
                rune and says so. */}
            <CheckboxRow label={<LabelSwap showing={unlisted ? 'unlisted' : 'ranked'} faces={{
              ranked: 'Include runes from higher-priority monsters', unlisted: 'Include runes already engraved in Scenario',
            }} />} checked={includeApplies && settings.includeHigherPriority}
              onChange={(include) => onUpdate({ includeHigherPriority: include })} disabled={!includeApplies} />
            <div className="rune-optimization-change-limit">
              <label className="checkbox-row">
                <input type="checkbox" aria-label="Limit changes" checked={settings.limitChanges}
                  onChange={(event) => onUpdate({ limitChanges: event.target.checked })} />
                <span>Max</span>
              </label>
              <input className="stat-range-input" type="number" min={1} max={6} step={1}
                aria-label="Maximum changes" placeholder="1–6" required={settings.limitChanges} aria-invalid={settings.limitChanges && settings.maxChanges === undefined} value={settings.maxChanges ?? ''} disabled={!settings.limitChanges}
                onChange={(event) => {
                  const raw = event.target.value;
                  const value = raw === '' ? undefined : Number(raw);
                  if (value === undefined || (Number.isInteger(value) && value >= 1 && value <= 6)) onUpdate({ maxChanges: value });
                }} />
              <span>changes</span>
            </div>
          </div>
          <div className="filter-group rune-optimization-adjustments">
            <span className="filter-label">Adjustments</span>
            <CheckboxRow label="Count unfinished runes at their +15 main stat" checked={settings.unfinishedAtMaximum}
              onChange={(unfinishedAtMaximum) => onUpdate({ unfinishedAtMaximum })} />
            <CheckboxRow label="Slot 1/3/5 only counts at +12" checked={settings.oddSlotsAtTwelve}
              disabled={!settings.unfinishedAtMaximum}
              onChange={(oddSlotsAtTwelve) => onUpdate({ oddSlotsAtTwelve })} />
          </div>
          <div className="filter-group rune-optimization-items">
            <span className="filter-label">Gems/Grinds</span>
            <CheckboxRow label="Allow Immemorial Gems and Grindstones" checked={settings.allowImmemorial}
              onChange={(allowImmemorial) => onUpdate({ allowImmemorial })} />
            <CheckboxRow label="Allow changing a gemmed stat" checked={settings.allowGemStatChange}
              disabled={settings.gems === 'none'}
              onChange={(allowGemStatChange) => onUpdate({ allowGemStatChange })} />
            <CheckboxRow label="Can gem away speed" checked={settings.allowGemSpeedRemoval}
              disabled={settings.gems === 'none'}
              onChange={(allowGemSpeedRemoval) => onUpdate({ allowGemSpeedRemoval })} />
          </div>
          <CraftSetting legend="Gems" name="rune-optimization-gems" use={settings.gems} grade={settings.gemGrade} roll={settings.gemRollAssumption}
            onUse={(gems) => onUpdate({ gems })} onGrade={(gemGrade) => onUpdate({ gemGrade })} onRoll={(gemRollAssumption) => onUpdate({ gemRollAssumption })} />
          <CraftSetting legend="Grindstones" name="rune-optimization-grinds" use={settings.grinds} grade={settings.grindGrade} roll={settings.grindRollAssumption}
            onUse={(grinds) => onUpdate({ grinds })} onGrade={(grindGrade) => onUpdate({ grindGrade })} onRoll={(grindRollAssumption) => onUpdate({ grindRollAssumption })} />
        </aside>
      </section>}

      {/* The profile's answers replace every change made here, which cannot be
          undone, so it is asked once. The safe answer takes focus. */}
      {confirmingReset && <Overlay labelledBy="rune-optimization-reset-title" describedBy="rune-optimization-reset-text"
        className="speed-confirm" onClose={() => setConfirmingReset(false)}>
        <div className="overlay-body">
          <div>
            <p className="eyebrow">Reset to profile</p>
            <h2 id="rune-optimization-reset-title">Put back what the profile says?</h2>
          </div>
          <p id="rune-optimization-reset-text">
            Every change made here for this calculation — builds, slots, ranking, stats, the set allowances, crits, element advantage and Scenario’s leads — goes back to the monster’s profile.
          </p>
          <div className="dialog-actions">
            <Button autoFocus onClick={() => setConfirmingReset(false)}>Keep my changes</Button>
            <Button tone="danger" onClick={() => { setEdits(null); setConfirmingReset(false); }}>Reset to profile</Button>
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
        currentBuild={currentBuild} currentMains={currentMains} currentFigures={tableNowFigures} general={general}
        describe={describeBuild} mainOf={mainOf}
        chosen={chosenBuild} onChoose={openBuild} />}
    </div>

    {builds && showingBuild && chosenBuild !== null && builds[chosenBuild] && <RuneBuildOverlay
      index={chosenBuild} buildName={buildNameOf(builds[chosenBuild].runes.map((rune) => rune.setId))}
      moves={builds[chosenBuild].moves} runes={builds[chosenBuild].runes}
      followable={buildFollowable(builds[chosenBuild])}
      runesById={runesById} presetId={activePresetId} loadedPlacements={game?.loadedPlacements?.[activePresetId]} scenarioPlaces={scenarioPlaces} poolPlaces={poolPlaces} monster={buildMonster} engravedOn={(id) => monstersByUnitId.get(id)}
      general={general} canEngrave={canEngrave || preset?.kind === 'own'} onEngrave={(engraveUnitId, runeIds) => onEngrave(activePresetId, engraveUnitId, runeIds)}
      lockOf={(runeId) => (preset ? runeLockOf(runeLocks, runeLockScope(preset), buildMonster.unitId, runeId) : undefined)}
      onLock={(runeId, lock) => onLock(activePresetId, buildMonster.unitId, runeId, lock)}
      onClose={closeBuild} onOpenRune={onOpenRune} onOpenMonster={onOpenMonster} />}
  </WorkspacePage>;
}

function OptimizationHeader() {
  return <PageHeader title="Rune Optimization"
    tagline="Six slots, thousands of runes. Let your computer do the arithmetic so you can go back to pretending it was intuition." />;
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

/**
 * One figure as Rune Optimization shows it: a stat as the monster's panel has it
 * with what the fight adds after it, a composite as the fight has it. The range
 * above and the search both read the fight's figure, which is the two together.
 */
function FigureNow({ figure, sheet, bonuses, ownSets, element, general }: {
  figure: RankFigure;
  sheet: MonsterStatSheet | undefined;
  bonuses: CombatBonuses;
  ownSets: TeammateSets;
  element: string | undefined;
  general: Preferences['general'];
}) {
  if (!isStatFigure(figure)) return <>{sheet ? formatNumber(sheet.figures[figure], general) : '—'}</>;
  return <>
    {sheet ? formatNumber(sheet.display[figure], general) : '—'}
    <FightAdditionText stat={figure} general={general}
      addition={sheet ? fightAddition(figure, sheet.display[figure], sheet.figures[figure], bonuses, ownSets, element) : null} />
  </>;
}

function SlotMains({ mains }: { mains: string }) {
  return <span className="rune-optimization-build-mains" title="Slot 2, 4 and 6 main stats">({mains})</span>;
}

/* The table reads every figure as the fight has it and nothing else: the line
   under the ranges says what the fight adds, the table compares the totals. */
function Results({ answer, builds, rankBy, currentBuild, currentMains, currentFigures, general, describe, mainOf, chosen, onChoose }: {
  answer: RuneOptimizationAnswer;
  builds: readonly CurrentBuild[];
  rankBy: RankFigure;
  currentBuild: string;
  /** Slots 2, 4 and 6's mains as engraved now; empty where no rune is. */
  currentMains: string;
  currentFigures: readonly number[];
  general: Preferences['general'];
  /** What changed under a build since the search, in words; empty where nothing did. */
  describe: (build: CurrentBuild) => string;
  mainOf: (runeId: string) => number | undefined;
  chosen: number | null;
  onChoose: (index: number, opener: HTMLElement) => void;
}) {
  /* The table is ordered by the figure it was searched for and by nothing else. The
     search only ever holds the best builds by that one figure — every other build was
     ruled out unseen — so re-sorting by another column would rank a sample, not the
     account. A different order is a different search, which Rank by starts. A sync
     can still move a build's figures, so the order is read from them, ties kept in
     the search's own order. */
  const rows = useMemo<ResultRow[]>(() => {
    const rank = figureIndex(rankBy);
    return builds.map((build, index) => ({
      index, build, name: buildNameOf(build.runes.map((rune) => rune.setId)), issue: describe(build),
      mains: slotMainsOf(build.runes.map((rune) => ({ slot: rune.slot, mainStatId: mainOf(rune.runeId) }))),
    })).sort((left, right) => figureOf(right.build, rank) - figureOf(left.build, rank) || left.index - right.index);
  }, [builds, describe, mainOf, rankBy]);
  const columns = useMemo(() => [
    { key: 'index', label: '#', align: 'left' as const },
    { key: 'build', label: 'Build', align: 'left' as const },
    { key: 'moves', label: 'Changes', align: 'right' as const },
    ...monsterStatTargetKeys.map((key) => ({ key, label: figureLabels[key], align: 'right' as const })),
  ], []);
  const cell = columnClasses(columns);
  const slots = answer.report.slots;

  return <section className="rune-optimization-results" aria-labelledby="rune-optimization-results-title">
    <h3 id="rune-optimization-results-title" className="type-heading">Builds</h3>
    <table className="grid-table rune-optimization-table" aria-label="Rune builds">
      <TableColumnGroup columns={runeOptimizationTableColumns} />
      {/* The ranked column reads as a sorted one does elsewhere — clear ink and a
          direction mark — but is no button. Every heading holds the mark's space,
          so the next search ranking another column moves no label (`AGENTS.md` §2). */}
      <thead><tr>{columns.map((column) => {
        const ranked = column.key === rankBy;
        const mark = <SortMark direction={ranked ? 'descending' : 'none'} />;
        return <th key={column.key} scope="col" className={cell(column.key)} aria-sort={ranked ? 'descending' : undefined}>
          <span className="rank-heading" data-ranked={ranked ? 'true' : undefined}>
            {sortMarkSide(column.align) === 'before' && mark}
            <span className="rank-heading-label">{column.label}</span>
            {sortMarkSide(column.align) === 'after' && mark}
          </span>
        </th>;
      })}</tr></thead>
      <tbody>
        <tr className="rune-optimization-current">
          <td className={cell('index')}>Now</td>
          <td className={cell('build')}>
            <span className="rune-optimization-build-name">
              <span className="rune-optimization-build-text">{currentBuild || 'No runes engraved'}</span>
              {currentMains && <SlotMains mains={currentMains} />}
            </span>
          </td>
          <td className={cell('moves')}>—</td>
          {monsterStatTargetKeys.map((key) => <td key={key} className={cell(key)}>
            {formatNumber(currentFigures[figureIndex(key)], general)}
          </td>)}
        </tr>
        {rows.length === 0 &&<tr><td className="table-empty-state" colSpan={columns.length}>
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
        {rows.map((row) => <tr key={row.index} data-chosen={chosen === row.index ? 'true' : undefined}
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
              <SlotMains mains={row.mains} />
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
