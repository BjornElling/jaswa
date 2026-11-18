import type { RuneRarity } from './runes';

/** Synthetic rune-birth assumptions shared by the Simulator and the sampled ruler. */
export const runeInnateFrequency = 0.5;

export type RuneBirthRarityMass = Readonly<{ rarity: RuneRarity; mass: number }>;

export function runeBirthRarityMasses(slot: number): readonly RuneBirthRarityMass[] {
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new RangeError('Rune births need a legal slot.');
  return slot % 2 === 1
    ? [{ rarity: 'Hero', mass: 0.75 }, { rarity: 'Legend', mass: 0.25 }]
    : [
      { rarity: 'Rare', mass: 0.25 },
      { rarity: 'Hero', mass: 0.5 },
      { rarity: 'Legend', mass: 0.25 },
    ];
}

/** Sample the very same model table the reference sample stratifies. */
export function sampleRuneBirthRarity(slot: number, unit: number): RuneRarity {
  if (!Number.isFinite(unit)) throw new RangeError('Rune birth draws must be finite.');
  const roll = Math.min(0.9999999999999999, Math.max(0, unit));
  let cumulative = 0;
  for (const entry of runeBirthRarityMasses(slot)) {
    cumulative += entry.mass;
    if (roll < cumulative) return entry.rarity;
  }
  throw new Error('The rune birth rarity masses did not cover a unit draw.');
}
