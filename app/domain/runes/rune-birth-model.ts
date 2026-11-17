import type { RuneRarity } from './runes';
import { rational } from './percentile/probability';
import type { Rational } from './percentile/probability';

/** Synthetic rune-birth assumptions shared by the Simulator and the analytical ruler. */
export const runeInnateFrequency = 0.5;

export type RuneBirthRarityMass = Readonly<{ rarity: RuneRarity; mass: Rational }>;

export function runeBirthRarityMasses(slot: number): readonly RuneBirthRarityMass[] {
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new RangeError('Rune births need a legal slot.');
  return slot % 2 === 1
    ? [{ rarity: 'Hero', mass: rational(3, 4) }, { rarity: 'Legend', mass: rational(1, 4) }]
    : [
      { rarity: 'Rare', mass: rational(1, 4) },
      { rarity: 'Hero', mass: rational(1, 2) },
      { rarity: 'Legend', mass: rational(1, 4) },
    ];
}

/** Sample the very same model table the exact finite solver integrates. */
export function sampleRuneBirthRarity(slot: number, unit: number): RuneRarity {
  if (!Number.isFinite(unit)) throw new RangeError('Rune birth draws must be finite.');
  const roll = Math.min(0.9999999999999999, Math.max(0, unit));
  let cumulative = 0;
  for (const entry of runeBirthRarityMasses(slot)) {
    cumulative += Number(entry.mass.numerator) / Number(entry.mass.denominator);
    if (roll < cumulative) return entry.rarity;
  }
  throw new Error('The rune birth rarity masses did not cover a unit draw.');
}
