/**
 * The numbers a rune is made of: what one roll can be, what a main property grows
 * to, and what a completed set is worth.
 *
 * `docs/RUNE-CANONICAL.md` owns the reasoning and the evidence; this owns the
 * arithmetic, and it is the only place these tables are written down. A second
 * copy would drift, and two screens would then disagree about the same rune
 * without either being obviously wrong.
 *
 * Only ordinary six-star runes are tabulated. Ancient runes roll higher and no
 * verified table exists for them (§7), so they get no numbers here rather than
 * plausible ones — a merely plausible range would be spent, silently, on every
 * projection the app makes.
 */
import { runeStatIds } from './runes';

/** Both ends included, as the game's own tables are written. */
export type RollRange = { minimum: number; maximum: number };

/**
 * What one ordinary six-star sub-property roll can be (`RUNE-CANONICAL.md` §7).
 *
 * The percent stats floor at 5, not at 4. The document carried 4–8 until a count of
 * 489 clean single rolls off a real account turned up no 4 at all, which a 4–8
 * uniform makes a sub-10⁻¹⁵ event; Spokland's own six-star table says 5–8 too.
 */
export const subPropertyRanges: Readonly<Record<number, RollRange>> = {
  1: { minimum: 135, maximum: 375 },
  2: { minimum: 5, maximum: 8 },
  3: { minimum: 10, maximum: 20 },
  4: { minimum: 5, maximum: 8 },
  5: { minimum: 10, maximum: 20 },
  6: { minimum: 5, maximum: 8 },
  8: { minimum: 4, maximum: 6 },
  9: { minimum: 4, maximum: 6 },
  10: { minimum: 4, maximum: 7 },
  11: { minimum: 4, maximum: 8 },
  12: { minimum: 4, maximum: 8 },
};

/**
 * A six-star prefix draws from the same range a sub property does (§4).
 *
 * It is the same table rather than a second one on purpose. The two published
 * prefix tables disagree with each other *and* with the game — Spokland says HP +
 * 53–323, Fandom 52–355 — because both are star-agnostic. Measured on 1,530
 * prefixes, a six-star prefix sits inside the sub-property range and reaches both
 * of its ends.
 */
export const prefixRanges = subPropertyRanges;

/** The best a single roll can be — the unit every demand and supply is counted in. */
export const maximumRoll = (statId: number): number => subPropertyRanges[statId]?.maximum ?? 0;

/**
 * How many whole values a roll can take. Used by the chance calculation, which
 * integrates over a uniform draw across exactly these.
 */
export function rollValueCount(statId: number): number {
  const range = subPropertyRanges[statId];
  return range ? range.maximum - range.minimum + 1 : 0;
}

/**
 * The final value an ordinary six-star main property reaches at +15
 * (`RUNE-CANONICAL.md` §3). Main properties are deterministic: they grow with the
 * level rather than rolling, so this is a fact about the rune and not a projection.
 */
export const mainPropertyAtMaximum: Readonly<Record<number, number>> = {
  1: 2448, 2: 63, 3: 160, 4: 63, 5: 160, 6: 63,
  8: 42, 9: 58, 10: 80, 11: 64, 12: 64,
};

/** Which main properties each slot may carry (§3). Slots 1, 3 and 5 are fixed. */
export const slotMainProperties: Readonly<Record<number, readonly number[]>> = {
  1: [3],
  2: [1, 2, 3, 4, 5, 6, 8],
  3: [5],
  4: [1, 2, 3, 4, 5, 6, 9, 10],
  5: [1],
  6: [1, 2, 3, 4, 5, 6, 11, 12],
};

/**
 * A completed set's permanent contribution to its wearer's own stats
 * (`RUNE-CANONICAL.md` §10). Battle, chance and conditional effects are absent
 * because they cannot be turned into a stat without inventing a number.
 *
 * `percent` applies to the monster's base stat; `flat` is added outright. The five
 * team sets are here too: §10 is explicit that "all Monsters" includes the wearer,
 * and each contribution is a percentage of the *receiver's* own base stat, which is
 * exactly how it is applied below.
 */
export type SetBonus = { statId: number; percent?: number; flat?: number };

export const setBonuses: Readonly<Record<string, SetBonus>> = {
  Energy: { statId: 2, percent: 15 },
  Guard: { statId: 6, percent: 15 },
  Swift: { statId: 8, percent: 25 },
  Blade: { statId: 9, flat: 12 },
  Rage: { statId: 10, flat: 40 },
  Focus: { statId: 12, flat: 20 },
  Endure: { statId: 11, flat: 20 },
  Fatal: { statId: 4, percent: 35 },
  Fight: { statId: 4, percent: 8 },
  Determination: { statId: 6, percent: 8 },
  Enhance: { statId: 2, percent: 8 },
  Accuracy: { statId: 12, flat: 10 },
  Tolerance: { statId: 11, flat: 10 },
};

/**
 * The stats a preset states a target for, paired with the sub-property types that
 * can move them.
 *
 * HP, ATK and DEF each have two: a percent line and a flat one. Keeping the pair
 * together is what lets a flat roll be priced against a percent roll rather than
 * being given a convention — `ATK +20` on a base of 720 is 2.8 percentage points,
 * so it is worth about a third of an `ATK % 8`. SWOP's flat-stats-count-half rule
 * reaches a similar place by assertion; this reaches it by division.
 */
export type TargetStat = 'hp' | 'atk' | 'def' | 'spd' | 'criRate' | 'criDmg' | 'res' | 'acc';

export const targetStatSubProperties: Readonly<Record<TargetStat, { percent?: number; flat?: number }>> = {
  hp: { percent: 2, flat: 1 },
  atk: { percent: 4, flat: 3 },
  def: { percent: 6, flat: 5 },
  spd: { flat: 8 },
  criRate: { flat: 9 },
  criDmg: { flat: 10 },
  res: { flat: 11 },
  acc: { flat: 12 },
};

/** Which target stat a sub-property type contributes to, or `undefined`. */
export const subPropertyTargetStat: Readonly<Record<number, TargetStat>> = {
  1: 'hp', 2: 'hp', 3: 'atk', 4: 'atk', 5: 'def', 6: 'def',
  8: 'spd', 9: 'criRate', 10: 'criDmg', 11: 'res', 12: 'acc',
};

/**
 * Whether a stat is read as a percentage of the monster's base or as a flat
 * addition. HP, ATK and DEF scale; the other five are already points and a rune's
 * contribution to them is added outright.
 */
export const scalesWithBase = (stat: TargetStat): boolean => stat === 'hp' || stat === 'atk' || stat === 'def';

/**
 * How many sub properties a rune of each default grade starts with (§6), by the
 * `rank` the export writes. Ancient ranks (11–15) map to the same counts.
 */
export function startingSubPropertyCount(rank: number): number | undefined {
  const ordinary = rank > 10 ? rank - 10 : rank;
  return ordinary >= 1 && ordinary <= 5 ? ordinary - 1 : undefined;
}

/** The levels at which a rune gains a sub property or improves one (§6). */
export const subPropertyLevels: readonly number[] = [3, 6, 9, 12];

/** The level past which no sub-property event remains. +15 improves the main only. */
export const lastSubPropertyLevel = 12;

/**
 * The sub-property events a rune has left, split into the ones that add a new
 * property and the ones that improve an existing one.
 *
 * A rune fills its four lines first and improves them afterwards, so the split
 * follows from how many properties it already carries rather than from its grade —
 * which is what keeps this correct for a rune the user has already part-rolled.
 */
export function remainingEvents(level: number, subCount: number): { adds: number; rolls: number } {
  const events = subPropertyLevels.filter((at) => at > level).length;
  const adds = Math.max(0, Math.min(events, 4 - subCount));
  return { adds, rolls: events - adds };
}

/** Every sub-property type, for iterating a legal set. */
export const allStatIds = runeStatIds;
