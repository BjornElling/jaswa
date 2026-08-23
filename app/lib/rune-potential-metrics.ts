/**
 * Role-neutral build metrics used by Rune Potential presets.
 *
 * These are comparison metrics, not a replacement for a skill's actual damage
 * calculation. See docs/RUNE-PRESET-METRICS.md for the canonical contract.
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

/** Calculates the three static-preset metrics from a monster's total stats. */
export function calculateRunePotentialMetrics(input: RunePotentialMetricInput): RunePotentialMetrics {
  const atk = finiteNonNegative(input.atk);
  const hp = finiteNonNegative(input.hp);
  const def = finiteNonNegative(input.def);
  const criticalRate = Math.min(1, finiteNonNegative(input.criticalRate) / 100);
  const criticalDamage = finiteNonNegative(input.criticalDamage) / 100;

  return {
    dmg: atk * (1 + criticalRate * criticalDamage),
    ehp: hp * (1142 + 3.572 * def) / 1000,
    ehpD: hp * (1142 + 3.572 * def * 0.3) / 1000,
  };
}
