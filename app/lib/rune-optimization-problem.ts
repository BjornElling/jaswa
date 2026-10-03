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
import { availableStatSets, complementaryCandidates, rangeFeasibleCandidates } from './rune-optimization-shortlist';
import type { CraftUse, RuneOptimizationSettings } from './rune-optimization-settings';
import { mainPropertyMaximum } from './rune-properties';
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
export type RuneOptimizationRequirements = {
  builds: readonly string[];
  slotMains: Readonly<Record<RuneSlotKey, readonly RuneSlotMain[]>>;
  /** Whether a rune may complete no set — in the slots a build leaves free, or anywhere where no build is named. */
  allowBroken: boolean;
  allowIntangible: boolean;
  /** Whether a held Immemorial Gem or Grindstone may be spent. An assumed item is never one. */
  allowImmemorial: boolean;
  /** Every figure counted at a certain crit, and no CRI Rate floor asked (`alwaysCritsLift`). */
  alwaysCrits: boolean;
  /** Floors the build must reach. Absent is "not aimed at"; `0` is a floor of nothing. */
  targets: Partial<Record<RankFigure, number>>;
  /** The most each figure may reach — the other end of each range. Absent is no limit. */
  ceilings: Partial<Record<RankFigure, number>>;
  rankBy: RankFigure;
};

export type RuneOptimizationInput = {
  unitId: string;
  /** The copy's own export record: its base stats and the artifacts it wears. */
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
  /** The copy's base stats, CRI Rate lifted by `criticalRateLift` where it always crits. */
  base: Float64Array;
  /** What `base` lifted CRI Rate by, for the figures shown to take back off. */
  criticalRateLift: number;
  /** The accumulators before any rune: the artifacts' main properties. */
  start: Float64Array;
  /** Index 0 is slot 1. Complementary picks first at finite depths, then `proxy`. */
  slots: Candidate[][];
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
  /** Held stacks the calculation may spend, and how deep each is. */
  stock: ReadonlyArray<{ itemId: string; amount: number }>;
  timeLimitMs: number;
  report: {
    /** Distinct runes that could enter at least one slot. */
    runes: number;
    slots: SlotReport[];
    /** Width of each selection lane per slot and set; `null` for no cut. */
    keep: number | null;
  };
};

/** Where a figure's accumulators are, for the reductions that only look at what matters. */
const figureSlots: Readonly<Record<RankFigure, readonly number[]>> = {
  hp: [effectSlot.hpPercent, effectSlot.hpFlat],
  atk: [effectSlot.atkPercent, effectSlot.atkFlat],
  def: [effectSlot.defPercent, effectSlot.defFlat],
  spd: [effectSlot.spdPercent, effectSlot.spdFlat],
  criRate: [effectSlot.criticalRate],
  criDmg: [effectSlot.criticalDamage],
  res: [effectSlot.resistance],
  acc: [effectSlot.accuracy],
  dmg: [effectSlot.atkPercent, effectSlot.atkFlat, effectSlot.criticalRate, effectSlot.criticalDamage],
  ehp: [effectSlot.hpPercent, effectSlot.hpFlat, effectSlot.defPercent, effectSlot.defFlat],
  ehpD: [effectSlot.hpPercent, effectSlot.hpFlat, effectSlot.defPercent, effectSlot.defFlat],
};

export const figureIndex = (figure: RankFigure): number => targetFigureKeys.indexOf(figure);

/* What a figure reads once a monster always crits: DMG no longer moves with CRI
   Rate, so a reduction that still compared it would keep runes for nothing. */
const slotsOf = (figure: RankFigure, alwaysCrits: boolean): readonly number[] => (alwaysCrits && figure === 'dmg'
  ? figureSlots.dmg.filter((slot) => slot !== effectSlot.criticalRate)
  : figureSlots[figure]);

/**
 * The floors a calculation asks for, with `NaN` where none is set. A monster that
 * always crits is never asked for CRI Rate: every hit it lands is already a crit.
 */
export function targetFloors(requirements: Pick<RuneOptimizationRequirements, 'targets' | 'alwaysCrits'>): Float64Array {
  return figureLimits(requirements.targets, requirements.alwaysCrits);
}

/** The ceilings a calculation asks for, read as `targetFloors` reads the floors. */
export function targetCeilings(requirements: Pick<RuneOptimizationRequirements, 'ceilings' | 'alwaysCrits'>): Float64Array {
  return figureLimits(requirements.ceilings, requirements.alwaysCrits);
}

function figureLimits(limits: Partial<Record<RankFigure, number>>, alwaysCrits: boolean): Float64Array {
  const values = new Float64Array(targetFigureCount).fill(Number.NaN);
  for (const [key, value] of Object.entries(limits)) {
    if (alwaysCrits && key === 'criRate') continue;
    if (typeof value === 'number' && Number.isFinite(value)) values[figureIndex(key as RankFigure)] = value;
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

/** The copy's base stats as the search reads them: CRI Rate lifted where it always crits. */
export function searchBase(monster: GameRecord, alwaysCrits: boolean): Float64Array {
  const base = monsterBaseStats(monster);
  base[4] += criticalRateLift(alwaysCrits);
  return base;
}

/**
 * The eleven figures of six runes on a copy, summed exactly as the search sums a
 * finished build — the artifacts, each rune's effects, the completed sets with the
 * Intangible's completion, a certain crit where the copy always crits — so a build
 * counted again after the account changed reads the figure the search would have
 * given it.
 */
export function buildFigures(monster: GameRecord, pieces: readonly BuildPiece[], alwaysCrits: boolean): number[] {
  const effects = new Float64Array(effectSlotCount);
  addEquipmentEffects(monster, effects);
  const counts = new Int32Array(setIdBound);
  for (const piece of pieces) {
    const own = runeEffects(piece.rune, piece.mainValue, piece.lines);
    for (let slot = 0; slot < effectSlotCount; slot += 1) effects[slot] += own[slot];
    if (piece.rune.setId > 0 && piece.rune.setId < setIdBound) counts[piece.rune.setId] += 1;
  }
  addSetBonuses(counts, intangibleCompletion(counts), effects);
  const figures = figuresOf(searchBase(monster, alwaysCrits), effects, new Float64Array(targetFigureCount));
  return Array.from(unliftedFigures(figures, criticalRateLift(alwaysCrits)));
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

const statSets = new Set(statSetBonuses.map(([setId]) => setId));

/*
 * Which runes may stand in for each other in the exact reduction. Normally only
 * runes of one set: swapping sets could break a stated build. With no build stated
 * a set matters only for the stat bonus it completes, so every set without one —
 * Violent, Will, Despair and the rest — is one group, and a Violent rune can be
 * dominated by a better Will rune. Not while an Intangible may be worn: which set
 * it completes depends on which sets are one short, so there the sets stay apart.
 * Nor while broken sets are refused, because then a rune's set decides whether
 * the build can be finished at all.
 */
function dominanceGroupOf(builds: BuildRequirement[] | null, requirements: RuneOptimizationRequirements) {
  const mergeSetless = builds === null && requirements.allowBroken && !requirements.allowIntangible;
  return (setId: number) => (mergeSetless && !statSets.has(setId) ? 0 : setId);
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
  const group = dominanceGroupOf(builds, input.requirements);
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

  function spendsNoMore(a: Candidate, b: Candidate): boolean {
    if (a.stock.length === 0) return true;
    const left = [...b.stock];
    for (const entry of a.stock) {
      const at = left.indexOf(entry);
      if (at === -1) return false;
      left.splice(at, 1);
    }
    return true;
  }

  return candidates.filter((b, bIndex) => {
    let dominators = 0;
    for (let aIndex = 0; aIndex < candidates.length; aIndex += 1) {
      if (aIndex === bIndex) continue;
      const a = candidates[aIndex];
      const order = compare(a, b);
      /* Two identical end states dominate each other, and dropping both would lose
         the pair. The one already on the monster wins the tie — a build that moves
         nothing is the better answer at equal figures — and then the earlier one. */
      if (order < 0) continue;
      if (order === 0 && (a.moves !== b.moves ? a.moves : aIndex > bIndex)) continue;
      if (!spendsNoMore(a, b)) continue;
      dominators += 1;
      if (dominators >= keep) return false;
    }
    return true;
  });
}

/**
 * **The depth's cut (§5).** Of what the exact reduction left in one slot and set,
 * keep the `keep` best by their first-order worth to the ranking figure, and the
 * `keep` best for each target as well — a rune that does little for DMG may be the
 * only way to reach the SPD floor, and a cut blind to targets would make a
 * reachable build look impossible.
 */
function cut(candidates: Candidate[], keep: number, targetSlopes: readonly Float64Array[]): Candidate[] {
  if (candidates.length <= keep) return candidates;
  const kept = new Set<Candidate>();
  const takeFamilies = (ordered: Candidate[]) => {
    const seen = new Set<string>();
    for (const candidate of ordered) {
      if (seen.has(candidate.runeId)) continue;
      seen.add(candidate.runeId); kept.add(candidate);
      if (seen.size === keep) break;
    }
  };
  const byProxy = [...candidates].sort((left, right) => right.proxy - left.proxy);
  for (const candidate of byProxy.slice(0, keep)) kept.add(candidate);
  takeFamilies(byProxy);
  for (const slope of targetSlopes) {
    const byTarget = [...candidates].sort((left, right) => dot(slope, right.effects) - dot(slope, left.effects));
    for (const candidate of byTarget.slice(0, keep)) kept.add(candidate);
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
  input: RuneOptimizationInput, options: { reduce?: boolean } = {},
): RuneOptimizationProblem {
  const reduce = options.reduce ?? true;
  const { requirements, settings, unitId, monster } = input;
  const base = searchBase(monster, requirements.alwaysCrits);
  const start = new Float64Array(effectSlotCount);
  addEquipmentEffects(monster, start);

  const rank = figureIndex(requirements.rankBy);
  const targets = targetFloors(requirements);
  const targetFigures = targetFigureKeys.filter((key) => Number.isFinite(targets[figureIndex(key)]));
  const ceilings = targetCeilings(requirements);
  const ceilingFigures = targetFigureKeys.filter((key) => Number.isFinite(ceilings[figureIndex(key)]));
  const pinned = new Set(ceilingFigures.flatMap((figure) => slotsOf(figure, requirements.alwaysCrits)));

  /* Only what the ranking figure, the targets and the ceilings read matters to any
     reduction. A rune's Accuracy is noise to a DMG build with no Accuracy floor, and
     a reduction that compared it would keep a hundred runes for their Accuracy alone. */
  const relevant = [...new Set([requirements.rankBy, ...targetFigures, ...ceilingFigures]
    .flatMap((figure) => slotsOf(figure, requirements.alwaysCrits)))];
  const relevantSlots = new Uint8Array(effectSlotCount);
  for (const slot of relevant) relevantSlots[slot] = 1;
  const wanted = (statId: number) => {
    const slot = effectSlotOf(statId);
    return slot >= 0 && relevantSlots[slot] === 1;
  };

  const builds = buildRequirements(requirements.builds);
  const usableSets = usableSetsOf(builds);

  /* Held stacks are numbered once, so every candidate names its spend by index and
     the search counts it in a flat array. */
  const stock = input.craftItems.map((item) => ({ itemId: item.id, amount: item.amount }));
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
        mainValue: rune.mainValue, main: effectSlotOf(rune.mainStatId), lines, gemmedAt: -1, groundAt: [], stock: [], moves: false, locked: true, proxy: 0,
      }];
      runesSeen.add(rune.id);
      continue;
    }
    if (locked[slotIndex] || verdict === 'refused') continue;

    const mainValue = settings.unfinishedAtMaximum && rune.level < runeMaximumLevel
      ? Math.max(rune.mainValue, mainPropertyMaximum(rune.stars, rune.mainStatId))
      : rune.mainValue;
    const lines: EndStateLine[] = rune.subProperties.map((line) => ({
      statId: line.statId, value: line.value, grind: line.grind, gemmed: line.gemmed,
    }));
    const supply: CraftSupply = { gem: half(gemPlan, rune), grind: half(grindPlan, rune) };
    const variants = supply.gem === null && supply.grind === null
      ? [{ lines, gemmedAt: -1, stock: [] as number[] }]
      : craftVariants(supply, rune.slot, rune.mainStatId, rune.prefixStatId, lines, rune.level >= gemMinimumLevel, wanted);

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
    for (const family of families.values()) for (const candidate of family) {
      for (let stat = 0; stat < effectSlotCount; stat += 1) reference[stat] += candidate.effects[stat] / family.length / families.size;
    }
  }
  const rankSlope = gradient(base, reference, rank);
  const targetSlopes = targetFigures.map((figure) => gradient(base, reference, figureIndex(figure)));
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
  for (const candidates of bySlot) for (const candidate of candidates) {
    candidate.proxy = dot(rankSlope, candidate.effects);
    if (freeSets) for (const [setId, pieces, stat, value] of orderableBonuses) {
      if (candidate.setId === setId) candidate.proxy += orderingSlope[stat] * value / pieces;
    }
  }

  const dominanceGroup = dominanceGroupOf(builds, requirements);

  const plan = runeOptimizationDepthPlans[settings.depth];
  const keep = Number.isFinite(plan.keep) ? plan.keep : null;
  const slots: Candidate[][] = [];
  const reports: SlotReport[] = [];
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const eligible = bySlot[slotIndex];
    if (locked[slotIndex]) {
      slots.push(eligible);
      reports.push({ slot: slotIndex + 1, eligible: 1, undominated: 1, kept: 1, locked: true });
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
      const left = undominated(group, relevant, pinned, base, settings.resultCount);
      undominatedCount += left.length;
      kept.push(...left);
    }
    kept.sort((left, right) => right.proxy - left.proxy || left.runeId.localeCompare(right.runeId));
    slots.push(kept);
    reports.push({ slot: slotIndex + 1, eligible: eligible.length, undominated: undominatedCount, kept: kept.length, locked: false });
  }

  const problem: RuneOptimizationProblem = {
    base, criticalRateLift: criticalRateLift(requirements.alwaysCrits), start, slots, builds,
    allowBroken: requirements.allowBroken, setPieces: setPiecesById, allowIntangible: requirements.allowIntangible,
    targets, ceilings, rank, relevant, resultCount: settings.resultCount, stock,
    timeLimitMs: plan.seconds * 1000,
    report: { runes: runesSeen.size, slots: reports, keep },
  };
  if (reduce) {
    problem.slots = rangeFeasibleCandidates(problem);
    for (const [at, slot] of problem.slots.entries()) reports[at].undominated = slot.length;
    if (keep !== null) {
      const complementary = complementaryCandidates(problem);
      problem.slots = problem.slots.map((slot) => {
        const groups = new Map<number, Candidate[]>();
        for (const candidate of slot) {
          const key = dominanceGroup(candidate.setId);
          const group = groups.get(key) ?? [];
          group.push(candidate); groups.set(key, group);
        }
        const independent = new Set([...groups.values()].flatMap((group) => cut(group, keep, targetSlopes)));
        return slot.filter((candidate) => independent.has(candidate) || complementary.has(candidate))
          .sort((a, b) => Number(complementary.has(b)) - Number(complementary.has(a)) || b.proxy - a.proxy || a.runeId.localeCompare(b.runeId));
      });
    }
    for (const [at, slot] of problem.slots.entries()) reports[at].kept = slot.length;
  }
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
export function canStillSatisfy(build: BuildRequirement, counts: ArrayLike<number>, placed: number): boolean {
  let missing = 0;
  for (const need of build.needs) missing += Math.max(0, need.pieces - counts[need.setId]);
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
export function canStillFinishSets(counts: ArrayLike<number>, placed: number, setPieces: Int32Array): boolean {
  let missing = 0;
  for (let setId = 1; setId < setPieces.length; setId += 1) {
    const worn = counts[setId];
    if (worn === 0 || setPieces[setId] === 0) continue;
    missing += (setPieces[setId] - (worn % setPieces[setId])) % setPieces[setId];
  }
  return missing - Math.min(1, counts[intangibleSetId]) <= 6 - placed;
}
