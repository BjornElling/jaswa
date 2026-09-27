import { craftAssumptionForSetting } from './rune-craft-items';
import { craftItemRoll } from './rune-craft-end-state';
import {
  allStatIds, initialSubPropertyRange, lastSubPropertyLevel, maximumRoll, remainingEvents,
  subPropertyRange,
} from './rune-properties';
import { runeDefaultGradeOrder, runeProjectionLevel, runeSubValue, slotAllowsSubStat } from './runes';
import type { Rune } from './runes';
import type { RunePotentialSettings } from './types';

export type RuneOverlayEvent = {
  level: number;
  kind: 'roll' | 'add';
};

export type RuneOverlaySubstat = {
  statId: number;
  current: number;
  maximum: number;
  chance: number;
  potential: number;
  rolls: number | null;
  remainingRolls: number;
  remainingAdditions: number;
  grind: number;
  gemMaximum: number | null;
};

export type RuneOverlayProjection = {
  events: RuneOverlayEvent[];
  rows: RuneOverlaySubstat[];
  bestStatId: number | null;
  remainingRolls: number;
  remainingAdditions: number;
  projectionLevel: 15;
};

const gradeLineage = (rune: Rune) => rune.ancient ? 'ancient' as const : 'standard' as const;

function probabilityOfMaximumRolls(rune: Rune, statId: number, count: number, heldCount: number): number {
  if (count === 0) return 1;
  const range = subPropertyRange(rune.ancient ? 6 : rune.stars, statId, 'upgrade');
  if (!range || heldCount <= 0) return 0;
  return Math.pow(1 / (heldCount * (range.maximum - range.minimum + 1)), count);
}

/**
 * A read-only projection for the rune dialog. It is intentionally role-neutral:
 * the dialog explains the rune's own ceiling, while Rune Clean-up remains the role
 * aware place that decides whether that ceiling is wanted.
 */
export function runeOverlayProjection(rune: Rune, settings: RunePotentialSettings): RuneOverlayProjection {
  const remaining = remainingEvents(rune.level, runeDefaultGradeOrder(rune.defaultGrade));
  const events: RuneOverlayEvent[] = [3, 6, 9, lastSubPropertyLevel]
    .filter((level) => level > rune.level)
    .map((level) => ({
      level,
      kind: remainingEvents(level - 1, runeDefaultGradeOrder(rune.defaultGrade)).events[0] ?? 'add',
    }));
  const heldCount = rune.subProperties.length;
  const existing = new Map(rune.subProperties.map((property) => [property.statId, property]));
  const pool = allStatIds.filter((statId) => slotAllowsSubStat(rune.slot, statId)
    && statId !== rune.mainStatId
    && statId !== rune.prefixStatId
    && !existing.has(statId)
    && initialSubPropertyRange(rune.ancient ? 6 : rune.stars, statId, rune.ancient));
  const lineage = gradeLineage(rune);
  const grindAssumption = craftAssumptionForSetting(settings.grindstones);
  const gemAssumption = craftAssumptionForSetting(settings.enchantedGems);
  const grindGrade = settings.grindstoneGrade;
  const gemGrade = settings.gemGrade;
  const rows = allStatIds
    .filter((statId) => slotAllowsSubStat(rune.slot, statId)
      && statId !== rune.mainStatId
      && statId !== rune.prefixStatId)
    .map((statId): RuneOverlaySubstat | null => {
      const property = existing.get(statId);
      if (property) {
        const remainingRolls = remaining.rolls;
        const naturalMaximum = runeSubValue(property) + remainingRolls * maximumRoll(statId, rune.ancient ? 6 : rune.stars, rune.ancient);
        const configuredGrind = grindAssumption === null
          ? 0
          : craftItemRoll('grindstone', lineage, statId, grindGrade, grindAssumption) ?? 0;
        const grind = Math.max(property.grind, configuredGrind) - property.grind;
        const maximum = naturalMaximum + grind;
        const ceiling = (initialSubPropertyRange(rune.ancient ? 6 : rune.stars, statId, rune.ancient)?.maximum ?? 0)
          + 4 * maximumRoll(statId, rune.ancient ? 6 : rune.stars, rune.ancient)
          + configuredGrind;
        return {
          statId, current: runeSubValue(property), maximum, chance: probabilityOfMaximumRolls(rune, statId, remainingRolls, heldCount),
          potential: ceiling > 0 ? maximum / ceiling : 0,
          rolls: property.rolls ?? null, remainingRolls, remainingAdditions: remaining.adds,
          grind, gemMaximum: gemAssumption === null ? null : craftItemRoll('gem', lineage, statId, gemGrade, gemAssumption),
        };
      }
      if (remaining.adds === 0 || !pool.includes(statId)) return null;
      const initial = initialSubPropertyRange(rune.ancient ? 6 : rune.stars, statId, rune.ancient);
      if (!initial) return null;
      const configuredGrind = grindAssumption === null
        ? 0
        : craftItemRoll('grindstone', lineage, statId, grindGrade, grindAssumption) ?? 0;
      const maximum = initial.maximum + configuredGrind;
      const ceiling = initial.maximum + 4 * maximumRoll(statId, rune.ancient ? 6 : rune.stars, rune.ancient) + configuredGrind;
      return {
        statId, current: 0, maximum, chance: (remaining.adds / pool.length) / (initial.maximum - initial.minimum + 1),
        potential: ceiling > 0 ? maximum / ceiling : 0,
        rolls: null, remainingRolls: 0, remainingAdditions: remaining.adds,
        grind: configuredGrind, gemMaximum: gemAssumption === null ? null : craftItemRoll('gem', lineage, statId, gemGrade, gemAssumption),
      };
    })
    .filter((row): row is RuneOverlaySubstat => row !== null);
  const best = rows.reduce<RuneOverlaySubstat | null>((winner, row) =>
    winner === null || row.potential > winner.potential ? row : winner, null);
  return {
    events,
    rows,
    bestStatId: best?.statId ?? null,
    remainingRolls: remaining.rolls,
    remainingAdditions: remaining.adds,
    projectionLevel: runeProjectionLevel,
  };
}
