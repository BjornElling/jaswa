/**
 * The numbers a rune is made of: what one roll can be, what a main property grows
 * to, and what a completed set is worth.
 *
 * `docs/RUNE-CANONICAL.md` owns the reasoning and the evidence; this owns the
 * arithmetic, and it is the only place these tables are written down. A second
 * copy would drift, and two screens would then disagree about the same rune
 * without either being obviously wrong.
 *
 * The star and Ancient tables deliberately live together. A clean-up projection must
 * never quietly price a 4★ roll as a 6★ one, and Ancient has one important wrinkle:
 * its *initial* sub-property uses the Ancient table, while every later +3/+6/+9/+12
 * improvement uses the ordinary six-star table. Ancient does not mean “every roll is
 * higher”; the Dimension Hole release calls out the initial sub property specifically.
 * `RUNE-CANONICAL.md` §7 records the sources and that distinction.
 */
import { runeStatIds, slotMainProperties } from './runes';

export { slotMainProperties };

/** Both ends included, as the game's own tables are written. */
export type RollRange = { minimum: number; maximum: number };

/**
 * What one ordinary sub-property roll can be (`RUNE-CANONICAL.md` §7), by star.
 *
 * The percent stats floor at 5, not at 4. The document carried 4–8 until a count of
 * 489 clean single rolls off a real account turned up no 4 at all, which a 4–8
 * uniform makes a sub-10⁻¹⁵ event; Spokland's own six-star table says 5–8 too.
 */
const ordinarySubPropertyRangesByStar: Readonly<Record<number, Readonly<Record<number, RollRange>>>> = {
  1: {
    1: { minimum: 15, maximum: 60 }, 2: { minimum: 1, maximum: 2 },
    3: { minimum: 1, maximum: 4 }, 4: { minimum: 1, maximum: 2 },
    5: { minimum: 1, maximum: 4 }, 6: { minimum: 1, maximum: 2 },
    8: { minimum: 1, maximum: 1 }, 9: { minimum: 1, maximum: 1 },
    10: { minimum: 1, maximum: 2 }, 11: { minimum: 1, maximum: 2 }, 12: { minimum: 1, maximum: 2 },
  },
  2: {
    1: { minimum: 30, maximum: 105 }, 2: { minimum: 1, maximum: 3 },
    3: { minimum: 2, maximum: 5 }, 4: { minimum: 1, maximum: 3 },
    5: { minimum: 2, maximum: 5 }, 6: { minimum: 1, maximum: 3 },
    8: { minimum: 1, maximum: 2 }, 9: { minimum: 1, maximum: 2 },
    10: { minimum: 1, maximum: 3 }, 11: { minimum: 1, maximum: 3 }, 12: { minimum: 1, maximum: 3 },
  },
  3: {
    1: { minimum: 45, maximum: 165 }, 2: { minimum: 2, maximum: 5 },
    3: { minimum: 3, maximum: 8 }, 4: { minimum: 2, maximum: 5 },
    5: { minimum: 3, maximum: 8 }, 6: { minimum: 2, maximum: 5 },
    8: { minimum: 2, maximum: 3 }, 9: { minimum: 2, maximum: 3 },
    10: { minimum: 2, maximum: 4 }, 11: { minimum: 2, maximum: 4 }, 12: { minimum: 2, maximum: 4 },
  },
  4: {
    1: { minimum: 60, maximum: 225 }, 2: { minimum: 3, maximum: 6 },
    3: { minimum: 5, maximum: 10 }, 4: { minimum: 3, maximum: 6 },
    5: { minimum: 5, maximum: 10 }, 6: { minimum: 3, maximum: 6 },
    8: { minimum: 2, maximum: 4 }, 9: { minimum: 2, maximum: 4 },
    10: { minimum: 2, maximum: 5 }, 11: { minimum: 2, maximum: 5 }, 12: { minimum: 2, maximum: 5 },
  },
  5: {
    1: { minimum: 90, maximum: 300 }, 2: { minimum: 4, maximum: 7 },
    3: { minimum: 7, maximum: 15 }, 4: { minimum: 4, maximum: 7 },
    5: { minimum: 7, maximum: 15 }, 6: { minimum: 4, maximum: 7 },
    8: { minimum: 3, maximum: 5 }, 9: { minimum: 3, maximum: 5 },
    10: { minimum: 3, maximum: 6 }, 11: { minimum: 3, maximum: 7 }, 12: { minimum: 3, maximum: 7 },
  },
  6: {
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
  },
};

/** A Dimension Hole rune has higher *initial* values; later upgrades are normal 6★ rolls. */
const ancientInitialSubPropertyRanges: Readonly<Record<number, RollRange>> = {
  1: { minimum: 165, maximum: 435 }, 2: { minimum: 6, maximum: 10 },
  3: { minimum: 12, maximum: 24 }, 4: { minimum: 6, maximum: 10 },
  5: { minimum: 12, maximum: 24 }, 6: { minimum: 6, maximum: 10 },
  8: { minimum: 5, maximum: 7 }, 9: { minimum: 5, maximum: 7 },
  10: { minimum: 5, maximum: 9 }, 11: { minimum: 6, maximum: 10 }, 12: { minimum: 6, maximum: 10 },
};

export type SubPropertyRollKind = 'initial' | 'upgrade';

/**
 * The legal interval for one sub-property draw. `undefined` is an invalid stat/star
 * combination rather than a zero-value roll, which keeps malformed game data visible.
 */
export function subPropertyRange(
  stars: number, statId: number, kind: SubPropertyRollKind = 'upgrade', ancient = false,
): RollRange | undefined {
  if (!Number.isInteger(stars) || stars < 1 || stars > 6) return undefined;
  if (ancient && stars !== 6) return undefined;
  if (ancient && stars === 6 && kind === 'initial') return ancientInitialSubPropertyRanges[statId];
  return ordinarySubPropertyRangesByStar[stars]?.[statId];
}

/** A readable alias for callers that model the drop separately from its upgrades. */
export const initialSubPropertyRange = (stars: number, statId: number, ancient = false) =>
  subPropertyRange(stars, statId, 'initial', ancient);

/** A readable alias for callers modelling a +3/+6/+9/+12 event. */
export const upgradeSubPropertyRange = (stars: number, statId: number, ancient = false) =>
  subPropertyRange(stars, statId, 'upgrade', ancient);

/**
 * Backward-compatible ordinary six-star table. New calculation code must call
 * `subPropertyRange` so it cannot lose the rune's star class or Ancient phase.
 */
export const subPropertyRanges = ordinarySubPropertyRangesByStar[6];

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

/**
 * The canonical innate-generation rate used by every rune model. Rune type and
 * rarity do not create separate rates in JASWA's current game model.
 */
export const runeInnateFrequency = 0.5;

/** The best a single roll can be — the unit every demand and supply is counted in. */
export const maximumRoll = (statId: number, stars = 6, ancient = false, kind: SubPropertyRollKind = 'upgrade'): number =>
  subPropertyRange(stars, statId, kind, ancient)?.maximum ?? 0;

/**
 * How many whole values a roll can take. Used by the chance calculation, which
 * integrates over a uniform draw across exactly these.
 */
export function rollValueCount(statId: number, stars = 6, ancient = false, kind: SubPropertyRollKind = 'upgrade'): number {
  const range = subPropertyRange(stars, statId, kind, ancient);
  return range ? range.maximum - range.minimum + 1 : 0;
}

/**
 * The final value an ordinary six-star main property reaches at +15
 * (`RUNE-CANONICAL.md` §3). Main properties are deterministic: they grow with the
 * level rather than rolling, so this is a fact about the rune and not a projection.
 */
const mainPropertiesAtMaximumByStar: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1: { 1: 804, 2: 18, 3: 54, 4: 18, 5: 54, 6: 18, 8: 18, 9: 18, 10: 20, 11: 18, 12: 18 },
  2: { 1: 1092, 2: 20, 3: 74, 4: 20, 5: 74, 6: 20, 8: 19, 9: 20, 10: 37, 11: 20, 12: 20 },
  3: { 1: 1380, 2: 38, 3: 93, 4: 38, 5: 93, 6: 38, 8: 25, 9: 37, 10: 43, 11: 38, 12: 38 },
  4: { 1: 1704, 2: 43, 3: 112, 4: 43, 5: 112, 6: 43, 8: 30, 9: 41, 10: 58, 11: 44, 12: 44 },
  5: { 1: 2088, 2: 51, 3: 135, 4: 51, 5: 135, 6: 51, 8: 39, 9: 47, 10: 65, 11: 51, 12: 51 },
  6: { 1: 2448, 2: 63, 3: 160, 4: 63, 5: 160, 6: 63, 8: 42, 9: 58, 10: 80, 11: 64, 12: 64 },
};

/**
 * Main properties are deterministic and Ancient changes none of them, so the star
 * class is the only thing besides the effect id that decides the `+15` value.
 */
export const mainPropertyMaximum = (stars: number, statId: number): number =>
  mainPropertiesAtMaximumByStar[stars]?.[statId] ?? 0;

/** Flat mains at +12: base plus twelve increments, before the final-level bonus.
 * Source: https://summonerswar.spokland.com/rune/stat (Main Stats).
 */
export function flatMainPropertyAtTwelve(stars: number, statId: number): number {
  const attack = [0, 39, 53, 67, 82, 99, 118];
  const hp = [0, 580, 790, 1000, 1240, 1530, 1800];
  const value = (statId === 1 ? hp : statId === 3 || statId === 5 ? attack : [])[stars];
  if (value === undefined || stars < 1) throw new Error(`No +12 flat main for ${stars} stars and stat ${statId}.`);
  return value;
}


/**
 * A completed set's permanent contribution to its monster's own stats
 * (`RUNE-CANONICAL.md` §10). Battle, chance and conditional effects are absent
 * because they cannot be turned into a stat without inventing a number.
 *
 * `percent` applies to the monster's base stat; `flat` is added outright. The five
 * team sets are here too: §10 is explicit that "all Monsters" includes the monster it is engraved on,
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
 * The stats a role states a target for, paired with the sub-property types that
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
 * How many sub properties a rune of each rarity starts with (§6), by the
 * normalized grade value used by the export's `extra` field. Ancient values
 * (11–15) map to the same counts.
 */
export function startingSubPropertyCount(exportGrade: number): number | undefined {
  const ordinary = exportGrade > 10 ? exportGrade - 10 : exportGrade;
  return ordinary >= 1 && ordinary <= 5 ? ordinary - 1 : undefined;
}

/** The levels at which a rune gains a sub property or improves one (§6). */
export const subPropertyLevels: readonly number[] = [3, 6, 9, 12];

/** The level past which no sub-property event remains. +15 improves the main only. */
export const lastSubPropertyLevel = 12;

export type SubPropertyEvent = 'add' | 'roll';

/**
 * The sub-property events a rune has left, in the order the game applies them.
 *
 * A rune's rarity fixes the schedule at drop: its born lines are improved
 * first, then the still-missing lines are added. A Magic rune therefore has one
 * upgrade followed by three additions, while a Legend rune has four upgrades.
 * Counting only the two totals loses the fact that a future line cannot receive an
 * earlier upgrade, which changes both the reachable maximum and its probability.
 * `initialSubCount` is the grade's born-line count, not the number of lines the
 * imported rune happens to carry now.
 */
export function remainingEvents(
  level: number, initialSubCount: number,
): { events: SubPropertyEvent[]; adds: number; rolls: number } {
  const born = Math.max(0, Math.min(4, Math.trunc(initialSubCount)));
  const events = subPropertyLevels
    .map((at, index): SubPropertyEvent | null => {
      if (at <= level) return null;
      return index < born ? 'roll' : 'add';
    })
    .filter((event): event is SubPropertyEvent => event !== null);
  return {
    events,
    adds: events.filter((event) => event === 'add').length,
    rolls: events.filter((event) => event === 'roll').length,
  };
}

/** Every sub-property type, for iterating a legal set. */
export const allStatIds = runeStatIds;
