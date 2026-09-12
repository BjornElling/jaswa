/**
 * Role-neutral build metrics used by Rune Clean-up presets.
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

export type RuneEffect = readonly [effectId: number, value: number, gemMarker?: number, grindValue?: number];

export type RunePotentialRuneInput = {
  class: number;
  priEff: RuneEffect;
  prefixEff?: RuneEffect | null;
  secEff: readonly RuneEffect[];
};

const subStatMaximum: Record<number, number> = {
  1: 1875, 2: 40, 3: 100, 4: 40, 5: 100, 6: 40,
  8: 30, 9: 30, 10: 35, 11: 40, 12: 40,
};

const mainStatMaximum: Record<number, Record<number, number>> = {
  1: { 1: 804, 2: 1092, 3: 1380, 4: 1704, 5: 2088, 6: 2448 },
  2: { 1: 18, 2: 20, 3: 38, 4: 43, 5: 51, 6: 63 },
  3: { 1: 54, 2: 74, 3: 93, 4: 113, 5: 135, 6: 160 },
  4: { 1: 18, 2: 20, 3: 38, 4: 43, 5: 51, 6: 63 },
  5: { 1: 54, 2: 74, 3: 93, 4: 113, 5: 135, 6: 160 },
  6: { 1: 18, 2: 20, 3: 38, 4: 43, 5: 51, 6: 63 },
  8: { 1: 18, 2: 19, 3: 25, 4: 30, 5: 39, 6: 42 },
  9: { 1: 18, 2: 20, 3: 37, 4: 41, 5: 47, 6: 58 },
  10: { 1: 20, 2: 37, 3: 43, 4: 58, 5: 65, 6: 80 },
  11: { 1: 18, 2: 20, 3: 38, 4: 44, 5: 51, 6: 64 },
  12: { 1: 18, 2: 20, 3: 38, 4: 44, 5: 51, 6: 64 },
};

const flatEffectIds = new Set([1, 3, 5]);

function efficiencyEffectValue(effect: RuneEffect): number {
  const currentValue = finiteNonNegative(effect[1]) + finiteNonNegative(effect[3] ?? 0);
  return flatEffectIds.has(effect[0]) ? currentValue * 0.5 : currentValue;
}

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
    ehp: hp * (1140 + 3.5 * def) / 1000,
    ehpD: hp * (1140 + 3.5 * def * 0.3) / 1000,
  };
}

/**
 * Rune efficiency following SWOP's published calculation. This evaluates the main property, current
 * sub-property values (including already applied grinds) and innate property.
 * Flat HP, ATK and DEF are weighted at 50%, matching SWOP.
 * It is intentionally a rune metric, not a monster-stat metric.
 */
export function calculateRuneEfficiency(rune: RunePotentialRuneInput): number | null {
  const mainEffect = rune.priEff[0];
  const effectiveClass = rune.class === 16 ? 6 : rune.class;
  const mainMaximum = mainStatMaximum[mainEffect]?.[effectiveClass];
  const sixStarMainMaximum = mainStatMaximum[mainEffect]?.[6];
  if (!mainMaximum || !sixStarMainMaximum) return null;

  let ratio = mainMaximum / sixStarMainMaximum;
  for (const effect of rune.secEff) {
    const maximum = subStatMaximum[effect[0]];
    if (!maximum) return null;
    ratio += efficiencyEffectValue(effect) / maximum;
  }

  if (rune.prefixEff?.[0]) {
    const maximum = subStatMaximum[rune.prefixEff[0]];
    if (!maximum) return null;
    ratio += efficiencyEffectValue(rune.prefixEff) / maximum;
  }

  return ratio / 2.8 * 100;
}

/** The SWOP table presents computed values as whole numbers rounded down. */
export function displayRunePotentialMetric(value: number): number {
  return Math.floor(finiteNonNegative(value));
}
