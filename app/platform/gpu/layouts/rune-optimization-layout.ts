/**
 * **The shape of what the graphics card is handed for a Rune Optimization pass.**
 *
 * Every offset here is read twice — once by the packing in
 * `backends/webgpu-rune-optimization-backend.ts` and once by the shader, which
 * interpolates these same constants into its own source rather than writing its
 * own. A field added to one side and not the other misreads every record after it,
 * and WebGPU does not complain: it answers with whatever the numbers happen to mean.
 * `npm run verify:rune-optimization-layout` fails if anything is left over for one
 * side to decide on its own.
 *
 * Four inputs and one output:
 *
 * - a **question**, fixed for the whole search: the monster's base stats, the
 *   floors, which figure ranks, and the bar the table currently holds;
 * - the **candidates** of the two tail slots, display and battle accumulators each;
 * - one **base** per block: the prefix's accumulators with the block's set bonus;
 * - one **range** per block: where its two groups sit among the candidates;
 * - the **survivors**: a count, then every `(block, pair)` that could clear the bar.
 *
 * The accumulator and figure positions are the stat sheet's own (`monster-stats.ts`),
 * taken from there rather than numbered again here.
 */
import { baseLength, combatAt, criRateFloorAt, effectSlot, effectSlotCount, passiveRuleAt, targetFigureCount, targetFigureKeys } from '../../../domain/combat/monster-stats';
import {
  brokenDefenseShare, criticalRateCapPercent, defenseFactorBase, defenseFactorPerDef, defenseFactorScale,
} from '../../../domain/runes/rune-potential-metrics';

const figure = (key: typeof targetFigureKeys[number]): number => targetFigureKeys.indexOf(key);

/** Display and battle accumulators per candidate and per block base, in `effectSlot` order. */
export const accumulatorStride = effectSlotCount;

/* ------------------------------------------------------------ the question */

/**
 * The copy's base as `combatBase` gives it: the eight stats in `MonsterTotals`
 * order — which is the figures' own order for the first eight — then what the
 * fight adds to each, at `combatAt`, then the CRI Rate a guaranteed crit lifts to.
 */
export const questionBaseAt = 0;
/** One floor per figure. A figure with no floor carries the lowest finite float. */
export const questionFloorsAt = questionBaseAt + baseLength;
export const questionRankAt = questionFloorsAt + targetFigureCount;
export const questionBarAt = questionRankAt + 1;
/** 19 base values + 11 floors + rank and bar = 32. */
export const questionLength = 32;

/* --------------------------------------------------------------- the ranges */

export const rangeStride = 4;
export const rangeFirstStartAt = 0;
export const rangeFirstCountAt = 1;
export const rangeLastStartAt = 2;
export const rangeLastCountAt = 3;

/* ------------------------------------------------------------ the survivors */

export const survivorCountAt = 0;
export const survivorsAt = 1;
export const survivorStride = 2;
export const survivorBlockAt = 0;
export const survivorPairAt = 1;

/**
 * **How many pairs one pass may send back: 65,536.**
 *
 * Half a megabyte of answer, read back on every pass. Once the table holds a bar a
 * pass clears a few dozen pairs, so this is room for the first passes of a search —
 * before the table is full every pair meeting the floors clears — and for a pass
 * that happens to sit right at the top. A pass that clears more says so, and the
 * search splits it rather than losing any.
 */
export const survivorCapacity = 65536;

/** Lanes per block. One block is one workgroup, as one job is in the chance shader. */
export const optimizationLanes = 64;

/**
 * **How generous the card is, and why it may be.**
 *
 * The card works in single precision and the processor in double, and HP, ATK, DEF
 * and SPD round up once. The card's answer is only ever a shortlist — every pair on
 * it is judged again on the processor — so it is allowed to err in one direction
 * only: upward. Each rounded stat is taken a whole point higher than its unrounded
 * value, and every figure is compared with one part in 65,536 and one point to
 * spare. Single precision drifts by about one part in ten million over this
 * arithmetic, so the slack is a hundred times what it has to cover, and costs a
 * handful of extra pairs per pass.
 */
export const relativeSlack = 1 / 65536;
export const absoluteSlack = 1;

/** The lowest finite single-precision float: "no floor", and the bar of a table not yet full. */
export const noFloor = -3.4028234663852886e38;

/**
 * Every whole-number constant the shader declares, and the value it must have.
 *
 * The shader interpolates this map rather than writing the numbers out; the check
 * reads it back out of the generated source to confirm the shader still uses every
 * one and has not grown a literal of its own.
 */
export const runeOptimizationConstants: Readonly<Record<string, number>> = {
  WORKGROUP_SIZE: optimizationLanes,
  ACC_STRIDE: accumulatorStride,
  ACC_HP_PERCENT: effectSlot.hpPercent,
  ACC_HP_FLAT: effectSlot.hpFlat,
  ACC_ATK_PERCENT: effectSlot.atkPercent,
  ACC_ATK_FLAT: effectSlot.atkFlat,
  ACC_DEF_PERCENT: effectSlot.defPercent,
  ACC_DEF_FLAT: effectSlot.defFlat,
  ACC_SPD_PERCENT: effectSlot.spdPercent,
  ACC_SPD_FLAT: effectSlot.spdFlat,
  ACC_CRITICAL_RATE: effectSlot.criticalRate,
  ACC_CRITICAL_DAMAGE: effectSlot.criticalDamage,
  ACC_RESISTANCE: effectSlot.resistance,
  ACC_ACCURACY: effectSlot.accuracy,
  ACC_TEAM_HP_PERCENT: effectSlot.teamHpPercent,
  ACC_TEAM_ATK_PERCENT: effectSlot.teamAtkPercent,
  ACC_TEAM_DEF_PERCENT: effectSlot.teamDefPercent,
  ACC_TEAM_RESISTANCE: effectSlot.teamResistance,
  ACC_TEAM_ACCURACY: effectSlot.teamAccuracy,
  FIGURE_COUNT: targetFigureCount,
  FIGURE_HP: figure('hp'),
  FIGURE_ATK: figure('atk'),
  FIGURE_DEF: figure('def'),
  FIGURE_SPD: figure('spd'),
  FIGURE_CRI_RATE: figure('criRate'),
  FIGURE_CRI_DMG: figure('criDmg'),
  FIGURE_RES: figure('res'),
  FIGURE_ACC: figure('acc'),
  FIGURE_DMG: figure('dmg'),
  FIGURE_EHP: figure('ehp'),
  FIGURE_EHP_D: figure('ehpD'),
  COMBAT_HP: combatAt.hp,
  COMBAT_ATK: combatAt.atk,
  COMBAT_DEF: combatAt.def,
  COMBAT_SPD: combatAt.spd,
  COMBAT_CRI_RATE: combatAt.criRate,
  COMBAT_CRI_DMG: combatAt.criDmg,
  COMBAT_RES: combatAt.res,
  COMBAT_ACC: combatAt.acc,
  CRI_RATE_FLOOR_AT: criRateFloorAt,
  PASSIVE_DEFENSE_FROM_ATTACK_PERCENT_AT: passiveRuleAt.defenseFromAttackPercent,
  PASSIVE_BALANCE_ATTACK_DEFENSE_AT: passiveRuleAt.balanceAttackDefense,
  QUESTION_BASE_AT: questionBaseAt,
  QUESTION_FLOORS_AT: questionFloorsAt,
  QUESTION_RANK_AT: questionRankAt,
  QUESTION_BAR_AT: questionBarAt,
  RANGE_STRIDE: rangeStride,
  RANGE_FIRST_START_AT: rangeFirstStartAt,
  RANGE_FIRST_COUNT_AT: rangeFirstCountAt,
  RANGE_LAST_START_AT: rangeLastStartAt,
  RANGE_LAST_COUNT_AT: rangeLastCountAt,
  SURVIVOR_COUNT_AT: survivorCountAt,
  SURVIVORS_AT: survivorsAt,
  SURVIVOR_STRIDE: survivorStride,
  SURVIVOR_BLOCK_AT: survivorBlockAt,
  SURVIVOR_PAIR_AT: survivorPairAt,
  SURVIVOR_CAPACITY: survivorCapacity,
};

/**
 * The two slack constants and the composites' own, declared as floats. The
 * composites' come from `rune-potential-metrics.ts`, so a change to a formula there
 * reaches the card's copy too — and a drift between them fails this layout's check
 * on a machine with no card, rather than only the agreement gate on one with a card.
 */
export const runeOptimizationFloatConstants: Readonly<Record<string, number>> = {
  RELATIVE_SLACK: relativeSlack,
  ABSOLUTE_SLACK: absoluteSlack,
  DEFENSE_FACTOR_BASE: defenseFactorBase,
  DEFENSE_FACTOR_PER_DEF: defenseFactorPerDef,
  DEFENSE_FACTOR_SCALE: defenseFactorScale,
  BROKEN_DEFENSE_SHARE: brokenDefenseShare,
  CRITICAL_RATE_CAP_PERCENT: criticalRateCapPercent,
};

/** Bytes of one pass's answer. */
export const survivorBytes = (survivorsAt + survivorCapacity * survivorStride) * Uint32Array.BYTES_PER_ELEMENT;
