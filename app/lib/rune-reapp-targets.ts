/**
 * **Which runes are worth a reroll**, one standing description per slot for each
 * of the game's two rerolls (`RUNE-CANONICAL.md` §9).
 *
 * - **Reappraisal** rerolls all four sub properties and keeps the set, slot, main
 *   and innate. It needs +12, and an Intangible rune cannot be reappraised.
 * - **Refinement** keeps the sub property types and redistributes their values and
 *   power-up levels. It needs +12 and refuses Ancient, Intangible and Gem-converted
 *   runes. Since it keeps the types, it is only worth a stone on a rune whose four
 *   types are already the ones a build wants most (`holdsBestLineTypes`).
 *
 * The +12 the game asks for is deliberately not asked here. What a target needs is
 * a rune showing all four of its sub properties — a Legend from +0, any lesser
 * rarity from +12, where its last line is added (`remainingEvents`) — because both questions are about which four types
 * the rune has, and a rune still to show one cannot be answered. It is then kept
 * while it climbs to +12. The game's other rules are applied whatever the target
 * says, because a rune the game will not let through the stone is no target for it.
 *
 * There are always exactly six targets of each kind, one per slot, because the
 * question is asked of a slot. The user edits and switches them off, but never
 * adds or removes one. Every list reads "no restriction" when empty. Asking for no
 * innate is no requirement, not a ban.
 */
import { isRecord } from './preference-reading';
import { maximumRoll, subPropertyTargetStat } from './rune-properties';
import { maxRollScale } from './rune-substat-weights';
import type { SubstatWeights } from './rune-substat-weights';
import type { ReferenceStats } from './rune-reference-stats';
import { isIntangibleRuneSet, roleRuneSetNameList, runeSetPieceCount } from './rune-sets';
import { runeRarities, runeRarityOrder, runeStatIds, slotAllowsSubStat, slotMainProperties } from './runes';
import type { Rune, RuneRarity } from './runes';
import type { Valuation } from './rune-substat-weights';

export type ReappTarget = {
  enabled: boolean;
  /** The sets a target accepts; empty accepts every set. */
  sets: readonly string[];
  minimumRarity: RuneRarity;
  /** Main property ids. Always empty in slots 1, 3 and 5, whose main is fixed. */
  mains: readonly number[];
  /** Whether the rune must carry an innate, whichever one it is. */
  requiresInnate: boolean;
};

/** Slot 1 first. Always six long. */
export type ReappTargets = readonly ReappTarget[];

export type RerollKind = 'reapp' | 'refine';

export const reappSlots = [1, 2, 3, 4, 5, 6] as const;

/** A rune has shown every type it will carry once it holds four sub properties. */
export const showsAllLines = (rune: Rune): boolean => rune.subProperties.length >= 4;

/** Only slots 2, 4 and 6 choose their main, so only they can ask for one. */
export const reappSlotChoosesMain = (slot: number): boolean => slot === 2 || slot === 4 || slot === 6;

/** The mains the game rolls in this slot, in the game's own property order. */
export const reappMainOptions = (slot: number): readonly number[] =>
  reappSlotChoosesMain(slot) ? runeStatIds.filter((id) => slotMainProperties[slot]?.includes(id)) : [];

/** Intangible takes neither stone, so it is not offered. */
export const reappSetOptions: readonly string[] = roleRuneSetNameList;

const defaultMains: Readonly<Record<number, readonly number[]>> = {
  2: [8, 4],
  4: [10, 2],
  6: [2, 4],
};

/* Refinement keeps the types, so it is offered more sets than reappraisal: the
   four-piece sets a build is made around, and the two-piece sets worth finishing. */
const refineSets: readonly string[] = reappSetOptions.filter((name) =>
  ['Fight', 'Will', 'Despair', 'Swift'].includes(name) || runeSetPieceCount[name] === 4);

function defaultTarget(slot: number, kind: RerollKind): ReappTarget {
  return {
    /* The odd slots carry a fixed flat main and are seldom worth a stone.
       Refinement starts switched off everywhere, so it adds no advice until asked. */
    enabled: kind === 'reapp' && reappSlotChoosesMain(slot),
    sets: kind === 'reapp' ? ['Violent'] : refineSets,
    minimumRarity: 'Legend',
    mains: defaultMains[slot] ?? [],
    requiresInnate: true,
  };
}

export function defaultReappTargets(kind: RerollKind = 'reapp'): ReappTarget[] {
  return reappSlots.map((slot) => defaultTarget(slot, kind));
}

/** Whether the game lets this rune through the stone, the +12 aside. */
export function rerollAllowed(rune: Rune, kind: RerollKind): boolean {
  if (isIntangibleRuneSet(rune.setName)) return false;
  if (kind === 'reapp') return true;
  return !rune.ancient && !rune.subProperties.some((line) => line.gemmed);
}

/** Whether this rune is one its slot's target of this kind describes. */
export function isRerollTarget(rune: Rune, targets: ReappTargets, kind: RerollKind, bestLineTypes: boolean): boolean {
  const target = targets[rune.slot - 1];
  if (!target?.enabled || !rerollAllowed(rune, kind) || !showsAllLines(rune)) return false;
  if (kind === 'refine' && !bestLineTypes) return false;
  if (target.sets.length > 0 && !target.sets.includes(rune.setName)) return false;
  if (runeRarityOrder(rune.rarity) < runeRarityOrder(target.minimumRarity)) return false;
  if (target.mains.length > 0 && !target.mains.includes(rune.mainStatId)) return false;
  if (target.requiresInnate && rune.prefixStatId === null) return false;
  return true;
}

/** What a build is, as far as ranking its line types goes. */
export type LineTypePricing = {
  valuation: Valuation; weights: SubstatWeights; main: number; stars: number;
};

/**
 * **Whether the rune's four sub property types are the four this build wants most.**
 *
 * Every type the rune could legally carry beside its main and innate is ranked
 * twice over. First by its price at one max roll in the build's own valuation —
 * the prices its verdict is read in, which is what the build still lacks once the
 * reference monster, the mains and the artifacts are counted. Then, among types
 * that price alike, a stat the role names a target for ranks by the size of a max
 * roll on the reference line, and an unnamed stat comes last. The second key is
 * the engine's own rule for a role whose targets are all met (`substatWeights`'s
 * degenerate case): a stat it names is still wanted. Without it, a build missing
 * only Accuracy would rank every other type alike and any rune with Accuracy
 * would read as one with the four best types.
 *
 * The four lines qualify when no type the rune lacks ranks above its weakest
 * line, so a tie for fourth place admits either type. A rune with fewer than four
 * lines has not shown its fourth type yet and does not qualify.
 */
export function holdsBestLineTypes(rune: Rune, pricing: LineTypePricing, base: ReferenceStats): boolean {
  const held = new Set(rune.subProperties.map((line) => line.statId));
  if (held.size < 4) return false;
  const named = new Set(pricing.weights.rows.map((row) => row.stat));
  const rank = (statId: number): readonly [number, number] => [
    pricing.valuation.value(statId, maximumRoll(statId, pricing.stars)),
    named.has(subPropertyTargetStat[statId]) ? maximumRoll(statId, pricing.stars) * maxRollScale(statId, base, pricing.stars) : 0,
  ];
  const same = (left: number, right: number) => Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
  const above = (left: readonly [number, number], right: readonly [number, number]) =>
    same(left[0], right[0]) ? !same(left[1], right[1]) && left[1] > right[1] : left[0] > right[0];
  const weakest = [...held].map(rank).reduce((low, next) => (above(low, next) ? next : low));
  return runeStatIds
    .filter((id) => !held.has(id) && id !== pricing.main && id !== rune.prefixStatId && slotAllowsSubStat(rune.slot, id))
    .every((id) => !above(rank(id), weakest));
}

function isListOf<T>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((entry) => allowed.includes(entry as T))
    && new Set(value).size === value.length;
}

/* Field by field, so one value the contract no longer accepts costs only that
   value (`preference-reading.ts`). */
function readTarget(value: unknown, slot: number, kind: RerollKind): ReappTarget {
  const blank = defaultTarget(slot, kind);
  if (!isRecord(value)) return blank;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : blank.enabled,
    sets: isListOf(value.sets, reappSetOptions) ? value.sets : blank.sets,
    minimumRarity: runeRarities.includes(value.minimumRarity as RuneRarity) ? value.minimumRarity as RuneRarity : blank.minimumRarity,
    mains: isListOf(value.mains, reappMainOptions(slot)) ? value.mains : blank.mains,
    requiresInnate: typeof value.requiresInnate === 'boolean' ? value.requiresInnate : blank.requiresInnate,
  };
}

/** The stored six of one kind, slot by slot. Anything but a list of six starts every slot from its default. */
export function readReappTargets(value: unknown, kind: RerollKind = 'reapp'): ReappTarget[] {
  const stored = Array.isArray(value) && value.length === reappSlots.length ? value : [];
  return reappSlots.map((slot, at) => readTarget(stored[at], slot, kind));
}
