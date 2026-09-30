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
  addEquipmentEffects, addSetBonuses, baseStatCount, effectSlot, effectSlotCount, effectSlotOf,
  figuresInto, intangibleCompletion, intangibleSetId, monsterBaseStats, setIdBound,
  statSetBonuses, targetFigureCount, targetFigureKeys, totalsInto,
} from './monster-stats';
import type { MonsterArchetype } from './monster-catalog';
import { assumedCraftHalf, craftVariants, heldCraftHalf } from './rune-craft-end-state';
import type { CraftHalf, CraftSupply, EndStateLine } from './rune-craft-end-state';
import type { CraftItem } from './rune-craft-items';
import { lineageFits } from './rune-craft-plan';
import type { RuneHolds } from './rune-holds';
import { runeOptimizationDepthPlans } from './rune-optimization-settings';
import type { CraftUse, RuneOptimizationSettings } from './rune-optimization-settings';
import { mainPropertyMaximum } from './rune-properties';
import { runeBuild } from './rune-set-pairs';
import { runeSetId, runeSetPieceCount } from './rune-sets';
import { runeSlotMainByEffect } from './rune-slot-mains';
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
  allowIntangible: boolean;
  /** Floors the build must reach. Absent is "not aimed at"; `0` is a floor of nothing. */
  targets: Partial<Record<RankFigure, number>>;
  rankBy: RankFigure;
};

export type RuneOptimizationInput = {
  unitId: string;
  /** The copy's own export record: its base stats and the artifacts it wears. */
  monster: GameRecord;
  runes: readonly Rune[];
  holds: RuneHolds;
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
  /** Its first-order worth to the ranking figure, for ordering and for the cut. */
  proxy: number;
};

/** A build as the search reads it: pieces needed per `set_id`, and whether slots are left free. */
export type BuildRequirement = {
  id: string;
  needs: ReadonlyArray<{ setId: number; pieces: number }>;
  broken: boolean;
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
  base: Float64Array;
  /** The accumulators before any rune: the artifacts' main properties. */
  start: Float64Array;
  /** Index 0 is slot 1. Best first by `proxy`. */
  slots: Candidate[][];
  /** `null` where any combination of sets will do. */
  builds: BuildRequirement[] | null;
  allowIntangible: boolean;
  /** One per figure in `monsterStatTargetKeys` order; `NaN` where no floor is set. */
  targets: Float64Array;
  rank: number;
  /**
   * The accumulators the ranking figure and the targets read (§4.1). A set bonus on
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
    /** How many runes per slot and set the depth kept; `null` for no cut. */
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
    builds.push({ id: build.id, needs: [...needs].map(([setId, pieces]) => ({ setId, pieces })), broken: build.broken });
  }
  /* Every stated build failed to read: that is not "any build" but "none", and the
     search must say it found nothing rather than widen the question. */
  return builds;
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
 */
function undominated(candidates: Candidate[], relevant: readonly number[], base: Float64Array, keep: number): Candidate[] {
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
      if (a.effects[slot] > b.effects[slot]) better = true;
    }
    for (const [percent, flat, stat] of usedPairs) {
      const ap = a.effects[percent]; const af = a.effects[flat];
      const bp = b.effects[percent]; const bf = b.effects[flat];
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
  const byProxy = [...candidates].sort((left, right) => right.proxy - left.proxy);
  for (const candidate of byProxy.slice(0, keep)) kept.add(candidate);
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
  roll: RuneOptimizationSettings['gemRoll'];
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
  const base = monsterBaseStats(monster);
  const start = new Float64Array(effectSlotCount);
  addEquipmentEffects(monster, start);

  const rank = figureIndex(requirements.rankBy);
  const targets = new Float64Array(targetFigureCount).fill(Number.NaN);
  for (const [key, value] of Object.entries(requirements.targets)) {
    if (typeof value === 'number' && Number.isFinite(value)) targets[figureIndex(key as RankFigure)] = value;
  }
  const targetFigures = targetFigureKeys.filter((key) => Number.isFinite(targets[figureIndex(key)]));

  /* Only what the ranking figure and the targets read matters to any reduction. A
     rune's Accuracy is noise to a DMG build with no Accuracy floor, and a reduction
     that compared it would keep a hundred runes for their Accuracy alone. */
  const relevant = [...new Set([requirements.rankBy, ...targetFigures].flatMap((figure) => figureSlots[figure]))];
  const relevantSlots = new Uint8Array(effectSlotCount);
  for (const slot of relevant) relevantSlots[slot] = 1;
  const wanted = (statId: number) => {
    const slot = effectSlotOf(statId);
    return slot >= 0 && relevantSlots[slot] === 1;
  };

  const builds = buildRequirements(requirements.builds);
  /* A rune whose set no stated build can use is never a candidate — unless a build
     leaves slots broken, where any set will do. */
  const usableSets: Set<number> | null = builds === null || builds.some((build) => build.broken)
    ? null
    : new Set(builds.flatMap((build) => build.needs.map((need) => need.setId)));

  /* The reference the gradients are taken at: the copy as it stands, sets and all.
     A first-order worth measured against no runes at all would price CRI Rate as if
     the cap were a hundred points away on a monster already sitting at it. */
  const reference = new Float64Array(start);
  const wornCounts = new Int32Array(setIdBound);
  for (const rune of input.runes) {
    if (rune.occupiedId !== unitId) continue;
    const effects = runeEffects(rune, rune.mainValue, rune.subProperties.map((line) => ({ ...line })));
    for (let slot = 0; slot < effectSlotCount; slot += 1) reference[slot] += effects[slot];
    if (rune.setId > 0 && rune.setId < setIdBound) wornCounts[rune.setId] += 1;
  }
  addSetBonuses(wornCounts, intangibleCompletion(wornCounts), reference);
  const rankSlope = gradient(base, reference, rank);
  const targetSlopes = targetFigures.map((figure) => gradient(base, reference, figureIndex(figure)));

  /* Held stacks are numbered once, so every candidate names its spend by index and
     the search counts it in a flat array. */
  const stock = input.craftItems.map((item) => ({ itemId: item.id, amount: item.amount }));
  const heldItems = input.craftItems.map((item, index) => ({ item, stock: index }));
  const halves = new Map<string, CraftHalf | null>();
  function half(plan: SupplyPlan, rune: Rune): CraftHalf | null {
    if (plan.use === 'none') return null;
    const key = `${plan.kind}|${plan.use}|${rune.ancient ? 'A' : rune.setId}`;
    if (halves.has(key)) return halves.get(key) ?? null;
    const found = plan.use === 'theoretical'
      ? assumedCraftHalf(plan.kind, rune.ancient ? 'ancient' : 'standard', plan.grade, plan.roll)
      : heldCraftHalf(plan.kind, heldItems.filter(({ item }) => lineageFits(item, rune)), plan.roll);
    halves.set(key, found);
    return found;
  }
  const gemPlan: SupplyPlan = { use: settings.gems, kind: 'gem', grade: settings.gemGrade, roll: settings.gemRoll };
  const grindPlan: SupplyPlan = { use: settings.grinds, kind: 'grindstone', grade: settings.grindGrade, roll: settings.grindRoll };

  const slotMainFor: Record<number, readonly RuneSlotMain[]> = {
    2: requirements.slotMains.slot2, 4: requirements.slotMains.slot4, 6: requirements.slotMains.slot6,
  };

  const bySlot: Candidate[][] = [[], [], [], [], [], []];
  const locked = [false, false, false, false, false, false];
  const runesSeen = new Set<string>();

  for (const rune of input.runes) {
    const hold = input.holds[rune.id];
    const onThisMonster = rune.occupiedId === unitId;
    const slotIndex = rune.slot - 1;
    if (hold?.locked && onThisMonster) {
      /* Locked and uforanderlig: the slot's one answer, exactly as it is worn. No
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
    if (locked[slotIndex]) continue;
    /* A lock anywhere else keeps the rune where it is. */
    if (hold?.locked) continue;
    if (!onThisMonster && rune.occupiedId !== null && !settings.runesOnOtherMonsters) continue;
    if (rune.setId === intangibleSetId && !requirements.allowIntangible) continue;
    if (usableSets !== null && rune.setId !== intangibleSetId && !usableSets.has(rune.setId)) continue;
    const mains = slotMainFor[rune.slot];
    if (mains !== undefined && mains.length > 0) {
      const main = runeSlotMainByEffect(rune.mainStatId);
      if (main === undefined || !mains.includes(main)) continue;
    }

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
        stock: variant.stock, moves: !onThisMonster, locked: false, proxy: dot(rankSlope, effects),
      });
    }
  }

  /*
   * Which runes may stand in for each other in the exact reduction. Normally only
   * runes of one set: swapping sets could break a stated build. With no build stated
   * a set matters only for the stat bonus it completes, so every set without one —
   * Violent, Will, Despair and the rest — is one group, and a Violent rune can be
   * dominated by a better Will rune. Not while an Intangible may be worn: which set
   * it completes depends on which sets are one short, so there the sets stay apart.
   */
  const statSets = new Set(statSetBonuses.map(([setId]) => setId));
  const mergeSetless = builds === null && !requirements.allowIntangible;
  const dominanceGroup = (setId: number) => (mergeSetless && !statSets.has(setId) ? 0 : setId);

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
      const left = undominated(group, relevant, base, settings.resultCount);
      undominatedCount += left.length;
      kept.push(...(keep === null ? left : cut(left, keep, targetSlopes)));
    }
    kept.sort((left, right) => right.proxy - left.proxy || left.runeId.localeCompare(right.runeId));
    slots.push(kept);
    reports.push({ slot: slotIndex + 1, eligible: eligible.length, undominated: undominatedCount, kept: kept.length, locked: false });
  }

  return {
    base, start, slots, builds, allowIntangible: requirements.allowIntangible,
    targets, rank, relevant, resultCount: settings.resultCount, stock,
    timeLimitMs: plan.seconds * 1000,
    report: { runes: runesSeen.size, slots: reports, keep },
  };
}

/** Whether a finished set count is one of the stated builds (§6.3). */
export function satisfiesBuild(build: BuildRequirement, counts: ArrayLike<number>, completes: number): boolean {
  let inBuild = 0;
  for (const need of build.needs) {
    const worn = counts[need.setId] + (completes === need.setId ? 1 : 0);
    if (worn < need.pieces) return false;
    if (!build.broken && counts[need.setId] > need.pieces) return false;
    inBuild += counts[need.setId];
  }
  return build.broken || inBuild + counts[intangibleSetId] === 6;
}

/**
 * Whether a partly filled build can still become this one with `free` slots left —
 * the search's set pruning. It is allowed to be optimistic, never pessimistic: the
 * finished build is checked exactly by `satisfiesBuild`.
 */
export function canStillSatisfy(build: BuildRequirement, counts: ArrayLike<number>, placed: number): boolean {
  const intangible = counts[intangibleSetId];
  let missing = 0;
  let inBuild = 0;
  for (const need of build.needs) {
    const worn = counts[need.setId];
    if (!build.broken && worn > need.pieces) return false;
    missing += Math.max(0, need.pieces - worn);
    inBuild += worn;
  }
  if (!build.broken && inBuild + intangible !== placed) return false;
  return missing - Math.min(1, intangible) <= 6 - placed;
}
