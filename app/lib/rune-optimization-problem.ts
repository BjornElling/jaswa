/**
 * **Rune Optimization, part one: what the search is allowed to choose from.**
 *
 * `docs/RUNE-OPTIMIZATION.md` is the contract; this module is its §3–§5. It turns
 * one monster, the account's runes and the requirements for this calculation into a
 * `RuneOptimizationProblem`: six lists of candidates, one per slot, each already cut
 * down as far as it can be *without* changing the answer, and then — only where the
 * chosen depth allows — cut further by a rule the status line names.
 *
 * It decides nothing about the search itself, and the search decides nothing about
 * candidates. The split is the point: the search is where the time goes and is the
 * part a graphics card could one day take, and a search that also chose its own
 * inputs would be two calculations wearing one name.
 *
 * Every figure it reads comes from the shared stat sheet in `monster-stats.ts`, every
 * craft rule from `rune-craft-end-state.ts`, and every build from `rune-set-pairs.ts`,
 * so what this page calls a monster's E.HP is what the Monsters page calls it.
 */
/* Every import here is read by each search worker, so nothing may reach the
   statistics dataset or the monster catalogue: the types below are erased, and
   the figure order comes from `monster-stats.ts` rather than from the
   preferences module that sits beside the dataset. */
import type { GameRecord } from './game-data';
import type { CriticalRateBonuses } from './monster-stats';
import type { RuneSlotKey } from './monster-defaults';
import type { MonsterStatTargets } from './monster-preferences';
import {
  addEquipmentEffects, addSetBonuses, baseStatCount, criticalRateLift, effectSlot, effectSlotCount, effectSlotOf,
  figuresInto, intangibleCompletion, intangibleSetId, monsterBaseStats, setIdBound,
  statSetBonuses, targetFigureCount, targetFigureKeys, totalsInto, unliftedFigures,
} from './monster-stats';
import type { MonsterArchetype } from './monster-catalog';
import { assumedCraftHalf, craftVariants, heldCraftHalf } from './rune-craft-end-state';
import type { CraftHalf, CraftSupply, EndStateLine } from './rune-craft-end-state';
import type { CraftItem } from './rune-craft-items';
import { lineageFits } from './rune-craft-plan';
import type { RuneHolds } from './rune-holds';
import { runeOptimizationDepthPlans } from './rune-optimization-settings';
import { craftAllocationKey, craftRecipeKey, prepareCraftAllocation } from './rune-optimization-craft-allocation';
import { availableStatSets, bindingRangeLimits, ceilingEffectSlots, figureEffectSlots } from './rune-optimization-ranges';
import type { CraftAllocationPreparation } from './rune-optimization-craft-allocation';
import { complementaryCandidates, rangeFeasibleCandidates, setFeasibleCandidates } from './rune-optimization-shortlist';
import type { CraftUse, RuneOptimizationSettings } from './rune-optimization-settings';
import { flatMainPropertyAtTwelve, mainPropertyMaximum } from './rune-properties';
import { runeBuild, runeSlotCount } from './rune-set-pairs';
import { runeSetId, runeSetPieceCount } from './rune-sets';
import { runeSlotMainByEffect } from './rune-slot-mains';
import { substatWeights, targetStats, weightedValuation } from './rune-substat-weights';
import type { BuildMains } from './rune-substat-weights';
import type { ReferenceStats } from './rune-reference-stats';
import { runeStatIds } from './runes';
import type { RuneSlotMain } from './rune-slot-mains';
import { gemMinimumLevel, runeMaximumLevel } from './runes';
import type { Rune } from './runes';

export type RankFigure = keyof MonsterStatTargets;

/**
 * What one calculation asks for. It starts as the monster's profile — resolved, so a
 * slot the owner never answered reads the community's answer — and the page may
 * narrow or widen any part of it for this calculation alone (§2).
 *
 * An empty list means *any*: it is what the profile's token lines show as `Any`, and
 * an optimizer that read it as "none will do" would answer a question the screen
 * never asked.
 */
export type RuneOptimizationRequirements = CriticalRateBonuses & {
  builds: readonly string[];
  slotMains: Readonly<Record<RuneSlotKey, readonly RuneSlotMain[]>>;
  /** Whether a rune may complete no set — in the slots a build leaves free, or anywhere where no build is named. */
  allowBroken: boolean;
  allowIntangible: boolean;
  /** Whether a held Immemorial Gem or Grindstone may be spent. An assumed item is never one. */
  allowImmemorial: boolean;
  /** Every figure counted at a certain crit, and no CRI Rate floor asked. */
  /** Floors the build must reach. Absent is "not aimed at"; `0` is a floor of nothing. */
  targets: Partial<Record<RankFigure, number>>;
  /** The most each figure may reach — the other end of each range. Absent is no limit. */
  ceilings: Partial<Record<RankFigure, number>>;
  rankBy: RankFigure;
};

export type RuneOptimizationInput = {
  unitId: string;
  /** The copy's own export record: its base stats, artifacts and engraved relic. */
  monster: GameRecord;
  runes: readonly Rune[];
  holds: RuneHolds;
  /**
   * Copies whose worn runes this calculation may not take, whatever the settings
   * say about other monsters: those above it on the priority list, resolved by the
   * page (`higherPriorityThan`) so the search never reads the list itself.
   */
  spared: readonly string[];
  craftItems: readonly CraftItem[];
  requirements: RuneOptimizationRequirements;
  settings: RuneOptimizationSettings;
};

/** One rune in one end state, as the search sees it. */
export type Candidate = {
  runeId: string;
  slot: number;
  setId: number;
  /** What it adds to the twelve accumulators of `monster-stats.ts`. */
  effects: Float64Array;
  /** The main property as counted — at `+15` where the settings say so. */
  mainValue: number;
  /** The accumulator the main property feeds, `-1` for none: what the search's bound groups a slot by. */
  main: number;
  lines: readonly EndStateLine[];
  /** The line a Gem replaced, `-1` for none. */
  gemmedAt: number;
  /** Lines a Grindstone would newly touch. */
  groundAt: readonly number[];
  /** Held stacks this end state spends, by index into `RuneOptimizationProblem.stock`. */
  stock: readonly number[];
  /** Whether the rune has to be moved onto this monster. */
  moves: boolean;
  /** Whether the rune is locked to this monster, and so the slot's only answer. */
  locked: boolean;
  /** Independent ranking worth plus promising stat-set credit, for ordering and the cut. */
  proxy: number;
};

/** A build as the search reads it: pieces needed per `set_id`, and how many slots it leaves free. */
export type BuildRequirement = {
  id: string;
  needs: ReadonlyArray<{ setId: number; pieces: number }>;
  free: number;
};

export type SlotReport = {
  slot: number;
  /** Rune end states that met the filters. */
  eligible: number;
  /** Left after the exact reduction. */
  undominated: number;
  /** Left after the depth's cut — what the search actually tried. */
  kept: number;
  /** A locked rune holds the slot. */
  locked: boolean;
};

export type RuneOptimizationProblem = {
  /** Craft recipes prepared once, then shared with the search workers. */
  craft?: CraftAllocationPreparation | null;
  /** The copy's base stats, with combat CRI Rate points lifted for the search. */
  base: Float64Array;
  /** What `base` lifted CRI Rate by, for the figures shown to take back off. */
  criticalRateLift: number;
  /** The accumulators before any rune: artifact and engraved relic mains. */
  start: Float64Array;
  /** Index 0 is slot 1. Finite-depth candidates are ordered by `proxy`; guides are seeded separately. */
  slots: Candidate[][];
  /** Feasible whole-build guides, in slot order, checked again before seeding the table. */
  guides: number[][];
  /** `null` where any combination of sets will do. */
  builds: BuildRequirement[] | null;
  /** Whether a rune may complete no set. Off, every finished build is six runes in completed sets. */
  allowBroken: boolean;
  /** Pieces a set takes, by `set_id`; `0` for an id that is no set (Intangible among them). */
  setPieces: Int32Array;
  allowIntangible: boolean;
  /** One per figure in `monsterStatTargetKeys` order; `NaN` where no floor is set. */
  targets: Float64Array;
  /** The same, for the upper end of each range; `NaN` where no ceiling is set. */
  ceilings: Float64Array;
  rank: number;
  /**
   * The accumulators the ranking figure, the targets and the ceilings read (§4.1). A set bonus on
   * any other accumulator moves no figure a decision reads, so the search's bound
   * and its blocks ignore it — the figures a found build reports still count it.
   */
  relevant: readonly number[];
  resultCount: number;
  /** Maximum runes moved onto the monster; absent means unrestricted. */
  maxChanges?: number;
  /** Held stacks the calculation may spend, and how deep each is. */
  stock: ReadonlyArray<{ itemId: string; amount: number; kind: CraftItem['kind']; statId: number }>;
  timeLimitMs: number;
  report: {
    /** Distinct runes that could enter at least one slot. */
    runes: number;
    slots: SlotReport[];
    /** Width of each selection lane per slot and set; `null` for no cut. */
    keep: number | null;
  };
};

export const figureIndex = (figure: RankFigure): number => targetFigureKeys.indexOf(figure);

/**
 * The floors a calculation asks for, with `NaN` where none is set. A monster that
 * always crits is never asked for CRI Rate: every hit it lands is already a crit.
 */
export function targetFloors(requirements: Pick<RuneOptimizationRequirements, 'targets' | 'alwaysCrits' | 'alwaysElementAdvantage' | 'critLead'>): Float64Array {
  return figureLimits(requirements.targets, requirements);
}

/** The ceilings a calculation asks for, read as `targetFloors` reads the floors. */
export function targetCeilings(requirements: Pick<RuneOptimizationRequirements, 'ceilings' | 'alwaysCrits' | 'alwaysElementAdvantage' | 'critLead'>): Float64Array {
  return figureLimits(requirements.ceilings, requirements);
}

function figureLimits(limits: Partial<Record<RankFigure, number>>, bonuses: CriticalRateBonuses): Float64Array {
  const values = new Float64Array(targetFigureCount).fill(Number.NaN);
  for (const [key, value] of Object.entries(limits)) {
    if (bonuses.alwaysCrits && key === 'criRate') continue;
    // The search carries combat CRI Rate in its base; the entered range names the displayed stat.
    if (typeof value === 'number' && Number.isFinite(value)) values[figureIndex(key as RankFigure)] =
      value + (key === 'criRate' ? criticalRateLift(bonuses) : 0);
  }
  return values;
}

/** Whether any figure is past its ceiling. `NaN` compares false, so an unset ceiling never is. */
export function overCeiling(figures: ArrayLike<number>, ceilings: Float64Array): boolean {
  for (let at = 0; at < ceilings.length; at += 1) if (figures[at] > ceilings[at]) return true;
  return false;
}

/**
 * The figure to rank by when the profile names none (§2.3).
 *
 * The archetype is the one thing JASWA knows about every monster without being told,
 * and each maps to the figure that family is conventionally built around: damage for
 * an attacker, survival for the two bulk families, turns for a support. A monster
 * with no archetype is ranked by E.HP, because a build that keeps it alive is never a
 * wrong answer where nothing better is known.
 */
export function defaultRankFigure(archetype: MonsterArchetype | undefined): RankFigure {
  if (archetype === 'Attack') return 'dmg';
  if (archetype === 'Support') return 'spd';
  return 'ehp';
}

const figureScratch = new Float64Array(targetFigureCount);
const totalsScratch = new Float64Array(baseStatCount);

function figuresOf(base: Float64Array, effects: Float64Array, out: Float64Array = figureScratch): Float64Array {
  totalsInto(base, effects, totalsScratch);
  figuresInto(totalsScratch, out);
  return out;
}

/* A finite-difference step per accumulator, large enough that the truncation of
   the composites and the rounding of HP, ATK and DEF cannot read as a zero
   gradient. The gradient only orders and cuts candidates — it never decides a
   figure — so its precision is a matter of how well the cut aims, not of truth. */
const gradientSteps = Float64Array.of(10, 1000, 10, 100, 10, 100, 10, 10, 10, 10, 10, 10);

function gradient(base: Float64Array, reference: Float64Array, figure: number): Float64Array {
  const at = figuresOf(base, reference)[figure];
  const slope = new Float64Array(effectSlotCount);
  const probe = new Float64Array(reference);
  for (let slot = 0; slot < effectSlotCount; slot += 1) {
    probe[slot] = reference[slot] + gradientSteps[slot];
    slope[slot] = (figuresOf(base, probe)[figure] - at) / gradientSteps[slot];
    probe[slot] = reference[slot];
  }
  return slope;
}

const dot = (slope: Float64Array, effects: Float64Array): number => {
  let total = 0;
  for (let slot = 0; slot < effectSlotCount; slot += 1) total += slope[slot] * effects[slot];
  return total;
};

function runeEffects(rune: Rune, mainValue: number, lines: readonly EndStateLine[]): Float64Array {
  const effects = new Float64Array(effectSlotCount);
  const main = effectSlotOf(rune.mainStatId);
  if (main >= 0) effects[main] += mainValue;
  if (rune.prefixStatId !== null) {
    const prefix = effectSlotOf(rune.prefixStatId);
    if (prefix >= 0) effects[prefix] += rune.prefixValue;
  }
  for (const line of lines) {
    const slot = effectSlotOf(line.statId);
    if (slot >= 0) effects[slot] += line.value + line.grind;
  }
  return effects;
}

/** One rune of a build in the end state a figure is counted in. */
export type BuildPiece = { rune: Rune; mainValue: number; lines: readonly EndStateLine[] };

/** The copy's base stats as the search reads them, including combat CRI Rate points. */
export function searchBase(monster: GameRecord, bonuses: CriticalRateBonuses): Float64Array {
  const base = monsterBaseStats(monster);
  base[4] += criticalRateLift(bonuses);
  return base;
}

/**
 * The eleven figures of six runes on a copy, summed exactly as the search sums a
 * finished build — the artifacts, each rune's effects, the completed sets with the
 * Intangible's completion and the copy's combat crit conditions — so a build
 * counted again after the account changed reads the figure the search would have
 * given it.
 */
export function buildFigures(monster: GameRecord, pieces: readonly BuildPiece[], bonuses: CriticalRateBonuses): number[] {
  const effects = new Float64Array(effectSlotCount);
  addEquipmentEffects(monster, effects);
  const counts = new Int32Array(setIdBound);
  for (const piece of pieces) {
    const own = runeEffects(piece.rune, piece.mainValue, piece.lines);
    for (let slot = 0; slot < effectSlotCount; slot += 1) effects[slot] += own[slot];
    if (piece.rune.setId > 0 && piece.rune.setId < setIdBound) counts[piece.rune.setId] += 1;
  }
  addSetBonuses(counts, intangibleCompletion(counts), effects);
  const figures = figuresOf(searchBase(monster, bonuses), effects, new Float64Array(targetFigureCount));
  return Array.from(unliftedFigures(figures, criticalRateLift(bonuses)));
}

/* The lines a Grindstone would newly touch: a stone bigger than the one the rune
   carries on the same property. A line a Gem turned into another property starts
   from no stone at all. */
function newlyGround(before: readonly EndStateLine[], after: readonly EndStateLine[]): number[] {
  return after.flatMap((line, at) => {
    const had = before[at]?.statId === line.statId ? before[at].grind : 0;
    return line.grind > had ? [at] : [];
  });
}

function buildRequirements(ids: readonly string[]): BuildRequirement[] | null {
  if (ids.length === 0) return null;
  const builds: BuildRequirement[] = [];
  for (const id of ids) {
    const build = runeBuild(id);
    if (!build) continue;
    const needs = new Map<number, number>();
    for (const name of build.sets) {
      const setId = runeSetId(name);
      if (setId === undefined) continue;
      needs.set(setId, (needs.get(setId) ?? 0) + (runeSetPieceCount[name] ?? 2));
    }
    builds.push({ id: build.id, needs: [...needs].map(([setId, pieces]) => ({ setId, pieces })), free: runeSlotCount - build.slots });
  }
  /* Every stated build failed to read: that is not "any build" but "none", and the
     search must say it found nothing rather than widen the question. */
  return builds;
}

/* A rune whose set no stated build can use is never a candidate — unless a build
   leaves slots free, where any set may fill them. `null` is any set. */
function usableSetsOf(builds: BuildRequirement[] | null): ReadonlySet<number> | null {
  return builds === null || builds.some((build) => build.free > 0)
    ? null
    : new Set(builds.flatMap((build) => build.needs.map((need) => need.setId)));
}

/**
 * Whether a rune worn by `wearer`, another copy, may be moved onto this one. One
 * rule for the search and for the re-reading of a found build, so a row is never
 * dimmed for a source the search itself would have taken.
 */
export function mayTakeFrom(input: { settings: Pick<RuneOptimizationSettings, 'runesOnOtherMonsters'>; spared: readonly string[] }, wearer: string): boolean {
  return input.settings.runesOnOtherMonsters && !input.spared.includes(wearer);
}

/**
 * The filters of §3: whether a rune may enter its slot at all, before any craft
 * item or reduction. One function, so the preparation and the estimate on the page
 * cannot disagree about which runes are in play. `locked` is a rune locked to this
 * monster — its slot's one answer, which no filter can take away.
 */
function admission(input: RuneOptimizationInput, usableSets: ReadonlySet<number> | null, rune: Rune): 'locked' | 'refused' | 'admitted' {
  const { requirements, unitId } = input;
  const onThisMonster = rune.occupiedId === unitId;
  if (input.settings.fillEmptySlotsOnly) {
    const worn = input.runes.find((entry) => entry.slot === rune.slot && entry.occupiedId === unitId);
    if (worn) return worn.id === rune.id ? 'locked' : 'refused';
  }
  /* A lock anywhere else keeps the rune where it is. */
  if (input.holds[rune.id]?.locked) return onThisMonster ? 'locked' : 'refused';
  if (!onThisMonster && rune.occupiedId !== null && !mayTakeFrom(input, rune.occupiedId)) return 'refused';
  if (rune.setId === intangibleSetId && !requirements.allowIntangible) return 'refused';
  if (usableSets !== null && rune.setId !== intangibleSetId && !usableSets.has(rune.setId)) return 'refused';
  const mains = rune.slot === 2 ? requirements.slotMains.slot2
    : rune.slot === 4 ? requirements.slotMains.slot4
      : rune.slot === 6 ? requirements.slotMains.slot6 : undefined;
  if (mains !== undefined && mains.length > 0) {
    const main = runeSlotMainByEffect(rune.mainStatId);
    if (main === undefined || !mains.includes(main)) return 'refused';
  }
  return 'admitted';
}

/*
 * Which runes may stand in for each other in the exact reduction. A set stays
 * separate when it is required, completes a judged stat set, can be completed by
 * an Intangible, or must be finished because broken sets are refused. Otherwise a
 * free slot can swap it for any other unobservable set without changing the
 * question, so those sets share one group and a better rune in one may dominate a
 * weaker rune in another.
 */
function dominanceGroupOf(
  builds: BuildRequirement[] | null,
  requirements: RuneOptimizationRequirements,
  relevant: readonly number[],
) {
  /* A set is observable by the question only when it is required by a stated
     build or completes a stat bonus on an accumulator the question reads. With
     broken sets allowed and no Intangible, a free slot can swap any other set
     without changing set validity or a judged figure. The old rule kept every
     stat set separate here, even Energy and Guard in a DMG-only question, which
     inflated the exact dominance work without protecting an answer. */
  const required = new Set(builds?.flatMap((build) => build.needs.map((need) => need.setId)) ?? []);
  const relevantStatSets = new Set(statSetBonuses
    .filter(([, , stat]) => relevant.includes(stat))
    .map(([setId]) => setId));
  const hasFreeBuild = builds === null || builds.some((build) => build.free > 0);
  const mergeSetless = hasFreeBuild && requirements.allowBroken && !requirements.allowIntangible;
  return (setId: number) => (mergeSetless && !required.has(setId) && !relevantStatSets.has(setId) ? 0 : setId);
}

/**
 * **A rough size of the search, for the page to show before it runs.** The runes the
 * filters admit, at most the depth's `keep` per slot and group, multiplied across the
 * six slots. It skips everything that costs time — craft variants, the exact
 * reduction, the targets' own picks in the cut — so it is an order of magnitude to
 * read beside the depth, not a count the search reports. The search proves most of
 * these builds cannot win without summing them.
 */
export function estimateRuneOptimizationBuilds(input: RuneOptimizationInput): number {
  const builds = buildRequirements(input.requirements.builds);
  const usableSets = usableSetsOf(builds);
  const targets = targetFloors(input.requirements);
  const ceilings = targetCeilings(input.requirements);
  const relevant = [...new Set([input.requirements.rankBy, ...targetFigureKeys.filter((key) =>
    Number.isFinite(targets[figureIndex(key)]) || Number.isFinite(ceilings[figureIndex(key)]))]
    .flatMap((figure) => figureEffectSlots(figure, input.requirements.alwaysCrits)))];
  const group = dominanceGroupOf(builds, input.requirements, relevant);
  const { keep } = runeOptimizationDepthPlans[input.settings.depth];
  const counts = Array.from({ length: 6 }, () => new Map<number, number>());
  const locked = [false, false, false, false, false, false];
  for (const rune of input.runes) {
    const verdict = admission(input, usableSets, rune);
    if (verdict === 'locked') locked[rune.slot - 1] = true;
    if (verdict !== 'admitted') continue;
    const slot = counts[rune.slot - 1];
    const key = group(rune.setId);
    slot.set(key, (slot.get(key) ?? 0) + 1);
  }
  let total = 1;
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    if (locked[slotIndex]) continue;
    let reach = 0;
    for (const count of counts[slotIndex].values()) reach += Math.min(count, keep);
    total *= reach;
  }
  return total;
}

/**
 * **Exact reduction (§4.2).** Within one slot and one set, rune `a` dominates `b`
 * when `a` is at least as good in every accumulator the calculation reads and costs
 * no held item `b` does not. Every figure JASWA computes rises with every
 * accumulator, so swapping `b` for `a` in any build keeps its sets, its item spend
 * and every target it met, and cannot lower the ranking figure.
 *
 * A single dominator is not enough to drop `b` when the table lists more than one
 * build: `b` could still hold the second place `a` leaves. Each dominator gives one
 * build at least as good as any build using `b`, so `b` goes only once `keep` of them
 * exist — which is what makes the whole table exact, not just its first row.
 *
 * **A ceiling breaks "more is better"** on the accumulators it reads: the stronger
 * rune can carry a build past the top of a range the weaker one kept it inside. So
 * on every accumulator in `pinned`, `a` must equal `b` rather than beat it — a
 * narrower reduction, never a wrong one.
 */
function undominated(
  candidates: Candidate[], relevant: readonly number[], pinned: ReadonlySet<number>, base: Float64Array, keep: number,
  stock: RuneOptimizationProblem['stock'],
): Candidate[] {
  /* HP, ATK and DEF each come as a percentage and a flat pair, and the game rounds
     their sum up once. `a` is safely no worse on a pair when it is no worse on both
     halves, or when its combined figure is at least one whole point ahead — the
     most the single rounding can take back. */
  const pairs: ReadonlyArray<readonly [number, number, number]> = [
    [effectSlot.hpPercent, effectSlot.hpFlat, base[0]],
    [effectSlot.atkPercent, effectSlot.atkFlat, base[1]],
    [effectSlot.defPercent, effectSlot.defFlat, base[2]],
  ];
  const paired = new Set(pairs.flatMap(([percent, flat]) => [percent, flat]));
  const singles = relevant.filter((slot) => !paired.has(slot));
  const usedPairs = pairs.filter(([percent, flat]) => relevant.includes(percent) || relevant.includes(flat));

  /* A dominator cannot have a lower value under this positive scalar. For a
     percentage/flat pair it uses the same unrounded contribution as the safe
     pair comparison below; for a single accumulator its value is monotone by
     definition. Sorting by it lets the exact test stop before unrelated low
     candidates, while equal-valued candidates still receive the full test. */
  const orderWeight = new Float64Array(effectSlotCount);
  for (const slot of singles) orderWeight[slot] = 1;
  for (const [percent, flat, stat] of usedPairs) {
    orderWeight[percent] = stat / 100;
    orderWeight[flat] = 1;
  }
  const ordered = candidates.map((candidate, index) => ({
    candidate, index,
    score: dot(orderWeight, candidate.effects),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const scores = new Float64Array(candidates.length);
  for (const entry of ordered) scores[entry.index] = entry.score;

  /* -1: a is worse somewhere; 0: identical in everything read; 1: a strictly better. */
  function compare(a: Candidate, b: Candidate): number {
    let better = false;
    for (const slot of singles) {
      if (a.effects[slot] < b.effects[slot]) return -1;
      if (a.effects[slot] > b.effects[slot]) {
        if (pinned.has(slot)) return -1;
        better = true;
      }
    }
    for (const [percent, flat, stat] of usedPairs) {
      const ap = a.effects[percent]; const af = a.effects[flat];
      const bp = b.effects[percent]; const bf = b.effects[flat];
      if (pinned.has(percent) || pinned.has(flat)) {
        if (ap !== bp || af !== bf) return -1;
        continue;
      }
      if (ap >= bp && af >= bf) { if (ap > bp || af > bf) better = true; continue; }
      if (stat * ap / 100 + af >= stat * bp / 100 + bf + 1) { better = true; continue; }
      return -1;
    }
    return better ? 1 : 0;
  }

  // One stack addresses one kind and stat, used at most once on each of six
  // runes. A stack of six cannot constrain a build; still record its actual spend.
  const scarce = candidates.map((candidate) => candidate.stock.filter((at) => stock[at].amount < 6).sort((a, b) => a - b));
  const pinnedSlots = relevant.filter((at) => pinned.has(at));
  const signature = (candidate: Candidate) => pinnedSlots.map((at) => candidate.effects[at]).join(',');
  const buckets = new Map<string, Map<string, typeof ordered>>();
  for (const entry of ordered) {
    const key = signature(entry.candidate);
    let byStock = buckets.get(key);
    if (!byStock) { byStock = new Map(); buckets.set(key, byStock); }
    const spend = scarce[entry.index].join(',');
    const bucket = byStock.get(spend) ?? [];
    bucket.push(entry); byStock.set(spend, bucket);
  }

  return candidates.filter((b, bIndex) => {
    const dominators = new Set<string>();
    const bScore = scores[bIndex];
    // Only subsets of this end state's scarce spend can dominate it. Looking
    // through every unrelated craft plan made reduction quadratic in inventory.
    const byStock = buckets.get(signature(b))!;
    const spend = scarce[bIndex];
    const subsets = new Set<string>();
    for (let mask = 0; mask < 2 ** spend.length; mask += 1) {
      subsets.add(spend.filter((_, at) => mask & (1 << at)).join(','));
    }
    for (const subset of subsets) for (const entry of byStock.get(subset) ?? []) {
      if (entry.score < bScore) break;
      const aIndex = entry.index;
      if (aIndex === bIndex) continue;
      const a = entry.candidate;
      if (a.moves && !b.moves) continue;
      const order = compare(a, b);
      /* Two identical end states dominate each other, and dropping both would lose
         the pair. The one already on the monster wins the tie — a build that moves
         nothing is the better answer at equal figures — and then the earlier one. */
      if (order < 0) continue;
      if (order === 0 && (a.moves !== b.moves ? a.moves : aIndex > bIndex)) continue;
      // Alternative work on the same physical rune improves the same row, not
      // a second build. Other dominators must name distinct physical runes.
      if (a.runeId === b.runeId) return false;
      dominators.add(a.runeId);
      if (dominators.size >= keep) return false;
    }
    return true;
  });
}

/**
 * **The depth's cut (§5).** Of what the exact reduction left in one slot and set,
 * keep the `keep` best physical rune families by their first-order worth to the
 * ranking figure, and the `keep` best families for each target as well — a rune
 * that does little for DMG may be the only way to reach the SPD floor, and a cut
 * blind to targets would make a reachable build look impossible. Upper ranges get
 * a matching low-contribution lane: a strong rune that overshoots a ceiling is not
 * a safe replacement for a quieter complement. Each lane keeps one end state per
 * physical rune; different lanes may choose different Gem variants.
 */
function cut(
  candidates: Candidate[], keep: number,
  targetSlopes: readonly Float64Array[], ceilingSlopes: readonly Float64Array[],
): Candidate[] {
  if (candidates.length <= keep) return candidates;
  const kept = new Set<Candidate>();
  const takeFamilies = (ordered: Candidate[], width = keep) => {
    const seen = new Set<string>();
    for (const candidate of ordered) {
      if (seen.has(candidate.runeId)) continue;
      seen.add(candidate.runeId); kept.add(candidate);
      if (seen.size === width) break;
    }
  };
  const byProxy = [...candidates].sort((left, right) => right.proxy - left.proxy);
  takeFamilies(byProxy);
  // The most promising fully crafted family can exhaust a shared stack. Give
  // item-free complements their own lane instead of pricing unlimited supply.
  takeFamilies(byProxy.filter((candidate) => candidate.stock.length === 0), Math.max(1, Math.floor(keep / 3)));
  const requirementWidth = keep;
  for (const slope of targetSlopes) {
    const byTarget = [...candidates].sort((left, right) => dot(slope, right.effects) - dot(slope, left.effects));
    takeFamilies(byTarget, requirementWidth);
  }
  for (const slope of ceilingSlopes) {
    const byCeiling = [...candidates].sort((left, right) => dot(slope, left.effects) - dot(slope, right.effects));
    takeFamilies(byCeiling, requirementWidth);
  }
  return candidates.filter((candidate) => kept.has(candidate));
}

type SupplyPlan = {
  use: CraftUse;
  kind: 'gem' | 'grindstone';
  grade: RuneOptimizationSettings['gemGrade'];
  roll: RuneOptimizationSettings['gemRollAssumption'];
};

/**
 * `reduce: false` skips the dominance reduction and the cut and hands the search
 * every candidate the filters let through. Nothing in the app asks for that; it is
 * the brute-force side of `verify-rune-optimization.mjs`, which must not share the
 * code it is checking.
 */
export function prepareRuneOptimization(
  input: RuneOptimizationInput, options: { reduce?: boolean; onStage?: (stage: 'candidates' | 'reducing' | 'guiding') => void } = {},
): RuneOptimizationProblem {
  options.onStage?.('candidates');
  const reduce = options.reduce ?? true;
  const { requirements, settings, unitId, monster } = input;
  if (settings.limitChanges && (settings.maxChanges === undefined || !Number.isInteger(settings.maxChanges)
    || settings.maxChanges < 1 || settings.maxChanges > 6)) throw new Error('Maximum changes must be a whole number from 1 to 6.');
  const base = searchBase(monster, requirements);
  const start = new Float64Array(effectSlotCount);
  addEquipmentEffects(monster, start);

  const rank = figureIndex(requirements.rankBy);
  const targets = targetFloors(requirements);
  const targetFigures = targetFigureKeys.filter((key) => Number.isFinite(targets[figureIndex(key)]));
  const ceilings = targetCeilings(requirements);
  const ceilingFigures = targetFigureKeys.filter((key) => Number.isFinite(ceilings[figureIndex(key)]));
  const pinned = new Set(ceilingFigures.flatMap((figure) => figureEffectSlots(figure, requirements.alwaysCrits)));

  /* Only what the ranking figure, the targets and the ceilings read matters to any
     reduction. A rune's Accuracy is noise to a DMG build with no Accuracy floor, and
     a reduction that compared it would keep a hundred runes for their Accuracy alone. */
  const relevant = [...new Set([requirements.rankBy, ...targetFigures, ...ceilingFigures]
    .flatMap((figure) => figureEffectSlots(figure, requirements.alwaysCrits)))];
  const relevantSlots = new Uint8Array(effectSlotCount);
  for (const slot of relevant) relevantSlots[slot] = 1;
  const wanted = (statId: number) => {
    const slot = effectSlotOf(statId);
    return slot >= 0 && relevantSlots[slot] === 1;
  };

  const builds = buildRequirements(requirements.builds);
  const usableSets = usableSetsOf(builds);

  const admitted: Rune[][] = Array.from({ length: 6 }, () => []);
  for (const rune of input.runes) if (admission(input, usableSets, rune) !== 'refused') admitted[rune.slot - 1].push(rune);
  for (const [at, slot] of admitted.entries()) {
    const held = slot.find((rune) => admission(input, usableSets, rune) === 'locked');
    if (held) admitted[at] = [held];
  }
  const supported = options.reduce === false ? admitted : setFeasibleCandidates(admitted, {
    builds, allowBroken: requirements.allowBroken, allowIntangible: requirements.allowIntangible, setPieces: setPiecesById,
  });
  const supportedIds = new Set(supported.flat().map((rune) => rune.id));

  /* Held stacks are numbered once, so every candidate names its spend by index and
     the search counts it in a flat array. */
  const stock = input.craftItems.map((item) => ({ itemId: item.id, amount: item.amount, kind: item.kind, statId: item.statId }));
  const heldItems = input.craftItems.map((item, index) => ({ item, stock: index }))
    .filter(({ item }) => requirements.allowImmemorial || item.lineage !== 'immemorial');
  const halves = new Map<string, CraftHalf | null>();
  function half(plan: SupplyPlan, rune: Rune): CraftHalf | null {
    if (plan.use === 'none') return null;
    /* An assumed item depends on the lineage alone; a held one on the set as well,
       because an Ancient item names a set like any other (`lineageFits`). Keyed by
       lineage only, every Ancient rune was offered the first Ancient rune's stacks. */
    const lineage = rune.ancient ? 'A' : 'S';
    const key = plan.use === 'theoretical' ? `${plan.kind}|${plan.use}|${lineage}`
      : `${plan.kind}|${plan.use}|${lineage}${rune.setId}`;
    if (halves.has(key)) return halves.get(key) ?? null;
    const found = plan.use === 'theoretical'
      ? assumedCraftHalf(plan.kind, rune.ancient ? 'ancient' : 'standard', plan.grade, plan.roll)
      : heldCraftHalf(plan.kind, heldItems.filter(({ item }) => lineageFits(item, rune)), plan.roll);
    halves.set(key, found);
    return found;
  }
  const gemPlan: SupplyPlan = { use: settings.gems, kind: 'gem', grade: settings.gemGrade, roll: settings.gemRollAssumption };
  const grindPlan: SupplyPlan = { use: settings.grinds, kind: 'grindstone', grade: settings.grindGrade, roll: settings.grindRollAssumption };

  const bySlot: Candidate[][] = [[], [], [], [], [], []];
  const locked = [false, false, false, false, false, false];
  const runesSeen = new Set<string>();

  for (const rune of input.runes) {
    if (!supportedIds.has(rune.id)) continue;
    const verdict = admission(input, usableSets, rune);
    const onThisMonster = rune.occupiedId === unitId;
    const slotIndex = rune.slot - 1;
    if (verdict === 'locked') {
      /* Locked and immutable: the slot's one answer, exactly as it is worn. No
         craft item is counted on it, and no filter can take it away — a lock that a
         requirement could override would be a lock in name only. */
      locked[slotIndex] = true;
      const lines = rune.subProperties.map((line) => ({ ...line }));
      bySlot[slotIndex] = [{
        runeId: rune.id, slot: rune.slot, setId: rune.setId, effects: runeEffects(rune, rune.mainValue, lines),
        mainValue: rune.mainValue, main: effectSlotOf(rune.mainStatId), lines, gemmedAt: -1, groundAt: [], stock: [], moves: false, locked: input.holds[rune.id]?.locked === true, proxy: 0,
      }];
      runesSeen.add(rune.id);
      continue;
    }
    if (locked[slotIndex] || verdict === 'refused') continue;

    const atTwelve = settings.oddSlotsAtTwelve && rune.slot % 2 === 1;
    const mainValue = settings.unfinishedAtMaximum && rune.level < runeMaximumLevel
      ? atTwelve
        ? rune.level > 12 ? rune.mainValue : Math.max(rune.mainValue, flatMainPropertyAtTwelve(rune.stars, rune.mainStatId))
        : Math.max(rune.mainValue, mainPropertyMaximum(rune.stars, rune.mainStatId))
      : rune.mainValue;
    const lines: EndStateLine[] = rune.subProperties.map((line) => ({
      statId: line.statId, value: line.value, grind: line.grind, gemmed: line.gemmed,
    }));
    const supply: CraftSupply = { gem: half(gemPlan, rune), grind: half(grindPlan, rune) };
    const variants = supply.gem === null && supply.grind === null
      ? [{ lines, gemmedAt: -1, stock: [] as number[] }]
      : craftVariants(supply, rune.slot, rune.mainStatId, rune.prefixStatId, lines, rune.level >= gemMinimumLevel, wanted,
        (statId) => pinned.has(effectSlotOf(statId)));

    runesSeen.add(rune.id);
    for (const variant of variants) {
      const effects = runeEffects(rune, mainValue, variant.lines);
      bySlot[slotIndex].push({
        runeId: rune.id, slot: rune.slot, setId: rune.setId, effects, mainValue, main: effectSlotOf(rune.mainStatId),
        lines: variant.lines, gemmedAt: variant.gemmedAt, groundAt: newlyGround(lines, variant.lines),
        stock: variant.stock, moves: !onThisMonster, locked: false, proxy: 0,
      });
    }
  }

  if (reduce) {
    const limits = bindingRangeLimits({ base, start, slots: bySlot, builds, targets, ceilings });
    targets.set(limits.targets); ceilings.set(limits.ceilings);
    targetFigures.splice(0, targetFigures.length, ...targetFigureKeys.filter((key) => Number.isFinite(targets[figureIndex(key)])));
    ceilingFigures.splice(0, ceilingFigures.length, ...targetFigureKeys.filter((key) => Number.isFinite(ceilings[figureIndex(key)])));
    pinned.clear();
    for (const figure of ceilingFigures) for (const stat of figureEffectSlots(figure, requirements.alwaysCrits)) pinned.add(stat);
    relevant.splice(0, relevant.length, ...new Set([requirements.rankBy, ...targetFigures, ...ceilingFigures]
      .flatMap((figure) => figureEffectSlots(figure, requirements.alwaysCrits))));
  }

  const eligibleCounts = bySlot.map((slot) => slot.length);
  const craftPools = bySlot.map((slot) => slot);
  if (reduce) {
    // Work alternatives on one rune compete for the same physical build row.
    // Reduce those small families before the much wider cross-rune comparison.
    for (const [at, slot] of bySlot.entries()) {
      const families = new Map<string, Candidate[]>();
      for (const candidate of slot) {
        const family = families.get(candidate.runeId) ?? []; family.push(candidate); families.set(candidate.runeId, family);
      }
      bySlot[at] = [...families.values()].flatMap((family) => undominated(family, relevant, pinned, base, 1, stock));
    }
    // Dominance is quadratic in the pool width. Range proofs are linear and
    // should remove impossible end states before asking who dominates whom.
    const ranged = rangeFeasibleCandidates({
      base, criticalRateLift: criticalRateLift(requirements), start, slots: bySlot, guides: [], builds,
      allowBroken: requirements.allowBroken, setPieces: setPiecesById, allowIntangible: requirements.allowIntangible,
      targets, ceilings, rank, relevant, resultCount: settings.resultCount, stock, timeLimitMs: 0,
      report: { runes: runesSeen.size, slots: [], keep: null },
    });
    const feasible = setFeasibleCandidates(ranged, {
      builds, allowBroken: requirements.allowBroken, allowIntangible: requirements.allowIntangible, setPieces: setPiecesById,
    });
    for (const [at, slot] of feasible.entries()) bySlot[at] = slot;
  }

  /* Price the question's admitted pool, never the monster's current build. Each
     physical rune gets one vote, regardless of how many Gem alternatives it has.
     An equipped rune still matters for admission, locks and moves, not stat prices. */
  const reference = new Float64Array(start);
  for (const candidates of bySlot) {
    const families = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const family = families.get(candidate.runeId) ?? [];
      family.push(candidate); families.set(candidate.runeId, family);
    }
    for (const family of families.values()) {
      const shapes = new Map<string, Candidate[]>();
      for (const candidate of family) {
        const shape = `${candidate.gemmedAt}|${candidate.lines.map((line) => line.statId)}`;
        const group = shapes.get(shape) ?? []; group.push(candidate); shapes.set(shape, group);
      }
      const representatives = new Set<Candidate>();
      const strength = (candidate: Candidate) => relevant.reduce((sum, at) => sum + candidate.effects[at], 0);
      for (const group of shapes.values()) {
        representatives.add(group.reduce((a, b) => strength(b) > strength(a) ? b : a));
        representatives.add(group.reduce((a, b) => b.stock.length < a.stock.length
          || (b.stock.length === a.stock.length && strength(b) > strength(a)) ? b : a));
      }
      for (const candidate of representatives) {
        for (let stat = 0; stat < effectSlotCount; stat += 1) reference[stat] += candidate.effects[stat] / representatives.size / families.size;
      }
    }
  }
  const rankSlope = gradient(base, reference, rank);
  const targetSlopes = targetFigures.map((figure) => gradient(base, reference, figureIndex(figure)));
  /* All ceilings remain exact in range checks, dominance and finished-build
     judging. The heuristic cut gets dedicated low-contribution lanes only for
     the tightest few, otherwise a profile with eleven ceilings multiplies the
     shortlist by eleven before the guide has had a chance to do its job. */
  const referenceFigures = figuresOf(base, reference, new Float64Array(targetFigureCount));
  const ceilingLaneLimit = 3;
  const ceilingSlopes = ceilingFigures
    .map((figure) => {
      const at = figureIndex(figure);
      const scale = Math.max(1, Math.abs(referenceFigures[at]), Math.abs(ceilings[at]));
      return { slope: gradient(base, reference, at), slack: (ceilings[at] - referenceFigures[at]) / scale };
    })
    .sort((left, right) => left.slack - right.slack)
    .slice(0, ceilingLaneLimit)
    .map(({ slope }) => slope);
  /* Clean-up's selection pressure is an additional lane, not a replacement for
     the actual ranking figure or the composite targets it cannot express. Use
     the pool's most common main per slot; this price only guides the depth cut. */
  const mainPlan: Record<number, number> = {};
  for (const [at, candidates] of bySlot.entries()) {
    const counts = new Map<number, Set<string>>();
    for (const candidate of candidates) {
      const ids = counts.get(candidate.main) ?? new Set<string>();
      ids.add(candidate.runeId); counts.set(candidate.main, ids);
    }
    const mostCommon = [...counts].sort((a, b) => b[1].size - a[1].size || a[0] - b[0])[0]?.[0];
    mainPlan[at + 1] = runeStatIds.find((id) => effectSlotOf(id) === mostCommon) ?? 0;
  }
  const referenceBase = Object.fromEntries(targetStats.map((stat, at) => [stat, base[at]])) as ReferenceStats;
  const beforeRunes = new Float64Array(baseStatCount);
  totalsInto(base, start, beforeRunes);
  const pressureTargets = Object.fromEntries(targetStats.flatMap((stat, at) => {
    const target = targets[figureIndex(stat)];
    return Number.isFinite(target) ? [[stat, Math.max(0, target - (beforeRunes[at] - base[at]))]] : [];
  }));
  const weights = substatWeights({ targets: pressureTargets, mains: mainPlan as BuildMains,
    artifacts: { hp: false, atk: false, def: false }, base: referenceBase,
    credit: { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' } });
  if (weights.weights.size > 0) {
    const valuation = weightedValuation(referenceBase, weights, 6);
    const pressure = new Float64Array(effectSlotCount);
    for (const id of runeStatIds) pressure[effectSlotOf(id)] = valuation.value(id, 1);
    targetSlopes.push(pressure);
  }
  const freeSets = builds === null || builds.some((build) => build.free > 0);
  const orderableBonuses = availableStatSets(builds);
  const orderingSlope = new Float64Array(rankSlope);
  if (freeSets) {
    // A demanding floor earns search attention too; units are normalized so an
    // HP point cannot drown out a speed point merely because its number is bigger.
    const figures = figuresOf(base, reference, new Float64Array(targetFigureCount));
    const rankScale = Math.max(1, figures[rank]);
    for (const figure of targetFigures) {
      const at = figureIndex(figure);
      const slope = gradient(base, reference, at);
      const pressure = Math.max(0, targets[at] - figuresOf(base, start)[at]) / Math.max(1, figures[at]);
      for (let stat = 0; stat < effectSlotCount; stat += 1) {
        orderingSlope[stat] += rankScale * pressure * slope[stat] / Math.max(1, figures[at]);
      }
    }
  }
  for (const candidates of craftPools) for (const candidate of candidates) {
    candidate.proxy = dot(rankSlope, candidate.effects);
    if (freeSets) for (const [setId, pieces, stat, value] of orderableBonuses) {
      if (candidate.setId === setId) candidate.proxy += orderingSlope[stat] * value / pieces;
    }
  }

  const dominanceGroup = dominanceGroupOf(builds, { ...requirements,
    allowIntangible: requirements.allowIntangible || bySlot.some((slot) => slot.some((candidate) => candidate.setId === intangibleSetId)),
  }, relevant);

  const plan = runeOptimizationDepthPlans[settings.depth];
  const keep = Number.isFinite(plan.keep) ? plan.keep : null;
  const slots: Candidate[][] = [];
  const reports: SlotReport[] = [];
  options.onStage?.('reducing');
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const eligible = bySlot[slotIndex];
    if (locked[slotIndex]) {
      slots.push(eligible);
      reports.push({ slot: slotIndex + 1, eligible: eligibleCounts[slotIndex], undominated: eligible.length, kept: eligible.length, locked: true });
      continue;
    }
    const bySet = new Map<number, Candidate[]>();
    for (const candidate of eligible) {
      const key = dominanceGroup(candidate.setId);
      const group = bySet.get(key) ?? [];
      group.push(candidate);
      bySet.set(key, group);
    }
    let undominatedCount = 0;
    const kept: Candidate[] = [];
    for (const group of bySet.values()) {
      if (!reduce) { undominatedCount += group.length; kept.push(...group); continue; }
      const left = undominated(group, relevant, pinned, base, settings.resultCount, stock);
      undominatedCount += left.length;
      kept.push(...left);
    }
    kept.sort((left, right) => right.proxy - left.proxy || left.runeId.localeCompare(right.runeId));
    slots.push(kept);
    reports.push({ slot: slotIndex + 1, eligible: eligibleCounts[slotIndex], undominated: undominatedCount, kept: kept.length, locked: false });
  }

  const problem: RuneOptimizationProblem = {
    base, criticalRateLift: criticalRateLift(requirements), start, slots, builds, guides: [],
    allowBroken: requirements.allowBroken, setPieces: setPiecesById, allowIntangible: requirements.allowIntangible,
    targets, ceilings, rank, relevant, resultCount: settings.resultCount, stock,
    timeLimitMs: plan.seconds * 1000,
    maxChanges: settings.limitChanges ? settings.maxChanges : undefined,
    report: { runes: runesSeen.size, slots: reports, keep },
  };
  if (reduce) {
    problem.slots = rangeFeasibleCandidates(problem);
    for (const [at, slot] of problem.slots.entries()) reports[at].undominated = slot.length;
    if (keep !== null) {
      options.onStage?.('guiding');
      const guidance = complementaryCandidates(problem, craftPools);
      const complementary = guidance.candidates;
      problem.slots = problem.slots.map((slot, slotIndex) => {
        const groups = new Map<number, Candidate[]>();
        for (const candidate of slot) {
          const key = dominanceGroup(candidate.setId);
          const group = groups.get(key) ?? [];
          group.push(candidate); groups.set(key, group);
        }
        const independent = new Set([...groups.values()].flatMap((group) => cut(group, keep, targetSlopes, ceilingSlopes)));
        const recipes = new Set([...slot.filter((candidate) => independent.has(candidate)),
          ...[...complementary].filter((candidate) => candidate.slot === slotIndex + 1)].map(craftRecipeKey));
        return craftPools[slotIndex].filter((candidate) => recipes.has(craftRecipeKey(candidate)))
          /* Guides are seeded into the result table before the tree opens. The tree
             therefore gets the strongest bound-raising candidates first; putting
             every guide candidate ahead of them delayed the bar and made a narrower
             shortlist slower than the complete one on broad pools. */
          .sort((a, b) => b.proxy - a.proxy || Number(complementary.has(b)) - Number(complementary.has(a)) || a.runeId.localeCompare(b.runeId));
      });
      problem.guides = guidance.builds.map((build) => build.map((candidate, slot) => problem.slots[slot].indexOf(candidate)));
    } else {
      // Matching free-stat items needs the complete product for each retained
      // placement and fixed ceiling plan, including its cheaper supply choices.
      const capped = ceilingEffectSlots(ceilings);
      problem.slots = problem.slots.map((slot, at) => {
        const recipes = new Set(slot.map((candidate) => craftAllocationKey(candidate, capped, stock)));
        return craftPools[at].filter((candidate) => recipes.has(craftAllocationKey(candidate, capped, stock)))
          .sort((a, b) => b.proxy - a.proxy);
      });
    }
    for (const [at, slot] of problem.slots.entries()) reports[at].kept = slot.length;
  }
  problem.craft = prepareCraftAllocation(problem);
  // Different beam prices can discover the same work recipe. Its allocation
  // and neighbours are identical, so seeding it again only delays the tree.
  const guideKeys = new Set<string>();
  problem.guides = problem.guides.filter((guide) => {
    const key = guide.map((pick, slot) => problem.craft?.originalToRecipe[slot][pick] ?? pick).join(',');
    if (guideKeys.has(key)) return false;
    guideKeys.add(key); return true;
  });
  return problem;
}

/** Pieces per `set_id`, from the one table that names them. */
const setPiecesById = (() => {
  const pieces = new Int32Array(setIdBound);
  for (const [name, count] of Object.entries(runeSetPieceCount)) {
    const setId = runeSetId(name);
    if (setId !== undefined && setId > 0 && setId < setIdBound && setId !== intangibleSetId) pieces[setId] = count;
  }
  return pieces;
})();

/**
 * Whether a finished set count holds one of the stated builds (§6.3). A build names
 * the sets it must hold and leaves the rest free, so more runes of a named set — a
 * second Will set beside `Will/Swift` — are free slots spent on it, not a mismatch.
 */
export function satisfiesBuild(build: BuildRequirement, counts: ArrayLike<number>, completes: number): boolean {
  for (const need of build.needs) {
    if (counts[need.setId] + (completes === need.setId ? 1 : 0) < need.pieces) return false;
  }
  return true;
}

/**
 * Whether a partly filled build can still become this one with `6 - placed` slots
 * left — the search's set pruning. It is allowed to be optimistic, never pessimistic:
 * the finished build is checked exactly by `satisfiesBuild`.
 */
export function canStillSatisfy(build: BuildRequirement, counts: ArrayLike<number>, placed: number, remaining?: ArrayLike<number>): boolean {
  let missing = 0;
  for (const need of build.needs) {
    const shortfall = Math.max(0, need.pieces - counts[need.setId]);
    if (remaining && shortfall > remaining[need.setId]
      && shortfall > remaining[need.setId] + Math.min(1, counts[intangibleSetId] + remaining[intangibleSetId])) return false;
    missing += shortfall;
  }
  return missing - Math.min(1, counts[intangibleSetId]) <= 6 - placed;
}

/**
 * Whether every rune of a finished build belongs to a completed set — what *Allow
 * broken sets* turned off asks. An Intangible counts only where it completes a set.
 */
export function noBrokenSets(counts: ArrayLike<number>, completes: number, setPieces: Int32Array): boolean {
  if (counts[intangibleSetId] > 0 && completes < 0) return false;
  for (let setId = 1; setId < setPieces.length; setId += 1) {
    if (setId === intangibleSetId) continue;
    const worn = counts[setId] + (completes === setId ? 1 : 0);
    if (worn > 0 && (setPieces[setId] === 0 || worn % setPieces[setId] !== 0)) return false;
  }
  return true;
}

/**
 * Whether the open slots can still finish every set started so far — the pruning
 * for `noBrokenSets`, optimistic in the same way `canStillSatisfy` is.
 */
export function canStillFinishSets(counts: ArrayLike<number>, placed: number, setPieces: Int32Array, remaining?: ArrayLike<number>): boolean {
  let missing = 0;
  for (let setId = 1; setId < setPieces.length; setId += 1) {
    const worn = counts[setId];
    if (worn === 0 || setPieces[setId] === 0) continue;
    const shortfall = (setPieces[setId] - (worn % setPieces[setId])) % setPieces[setId];
    if (remaining && shortfall > remaining[setId]
      && shortfall > remaining[setId] + Math.min(1, counts[intangibleSetId] + remaining[intangibleSetId])) return false;
    missing += shortfall;
  }
  return missing - Math.min(1, counts[intangibleSetId]) <= 6 - placed;
}

/** Each open slot can promise a set once; shared slots and the wildcard stay optimistic. */
export function remainingSetSupport(slots: readonly (readonly { setId: number }[])[], order: readonly number[]): Int32Array[] {
  const support = Array.from({ length: order.length + 1 }, () => new Int32Array(setIdBound));
  for (let depth = order.length - 1; depth >= 0; depth -= 1) {
    support[depth].set(support[depth + 1]);
    for (const setId of new Set(slots[order[depth]].map((candidate) => candidate.setId))) support[depth][setId] += 1;
  }
  return support;
}
