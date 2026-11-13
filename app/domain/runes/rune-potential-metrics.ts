/**
 * Role-neutral build metrics used by Rune Clean-up roles.
 *
 * These are comparison metrics, not a replacement for a skill's actual damage
 * calculation. See docs/RUNE-ROLE-METRICS.md for the canonical contract.
 *
 * It imports nothing on purpose. `monster-stats.ts` reads it, and the stat sheet is
 * a leaf the workers load on their own; a rune table pulled in here would bring the
 * whole rune vocabulary into every worker, and a cycle back to the stat sheet with it.
 */
export type RunePotentialMetricInput = {
  atk: number;
  hp: number;
  def: number;
  criticalRate: number;
  criticalDamage: number;
};

export type RunePotentialMetrics = {
  dmg: number;
  ehp: number;
  ehpD: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/*
 * The constants of the three formulas, exported because the Rune Optimization shader
 * interpolates them rather than writing its own (`rune-optimization-layout.ts`), so
 * `verify:rune-optimization-layout` can hold the card's copy where no card runs.
 */

/** SWCalc's defense factor is `(defenseFactorBase + defenseFactorPerDef × DEF) / defenseFactorScale`. */
export const defenseFactorBase = 1142;
export const defenseFactorPerDef = 3.572;
export const defenseFactorScale = 1000;
/** What a DEF break leaves of the target's DEF. */
export const brokenDefenseShare = 0.3;
/** CRI Rate counts up to 100 % and no further. */
export const criticalRateCapPercent = 100;

/*
 * The three formulas of `RUNE-ROLE-METRICS.md` §2–4, one scalar function each.
 * They are scalars rather than one object-returning call because Rune Optimization
 * evaluates them once per combination it tries, and the object version below is
 * built on them, so the two cannot answer differently.
 */

/** `DMG = ATK × (1 + CR × CD)`, with CRI Rate capped at 100 %. Percentages as the sheet shows them. */
export function metricDmg(atk: number, criticalRatePercent: number, criticalDamagePercent: number): number {
  const criticalRate = Math.min(criticalRateCapPercent, finiteNonNegative(criticalRatePercent)) / 100;
  return finiteNonNegative(atk) * (1 + criticalRate * finiteNonNegative(criticalDamagePercent) / 100);
}

/** `E.HP = HP × (1142 + 3.572 × DEF) / 1000` — HP over SWCalc's defense factor. */
export function metricEhp(hp: number, def: number): number {
  return finiteNonNegative(hp) * (defenseFactorBase + defenseFactorPerDef * finiteNonNegative(def)) / defenseFactorScale;
}

/** `E.HP D = HP × (1142 + 3.572 × 0.3 × DEF) / 1000` — DEF broken to 30 %. */
export function metricEhpD(hp: number, def: number): number {
  return finiteNonNegative(hp)
    * (defenseFactorBase + defenseFactorPerDef * finiteNonNegative(def) * brokenDefenseShare) / defenseFactorScale;
}

/** Calculates the three static-role metrics from a monster's total stats. */
export function calculateRunePotentialMetrics(input: RunePotentialMetricInput): RunePotentialMetrics {
  return {
    dmg: metricDmg(input.atk, input.criticalRate, input.criticalDamage),
    ehp: metricEhp(input.hp, input.def),
    ehpD: metricEhpD(input.hp, input.def),
  };
}

/** The SWOP table presents computed values as whole numbers rounded down. */
export function displayRunePotentialMetric(value: number): number {
  return Math.floor(finiteNonNegative(value));
}
