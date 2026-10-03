import type { GameRecord } from './game-data';
import type { ArtifactSettings } from './types';
import { canEquipArtifacts } from './monster-equipment-eligibility';

/** The game currently caps monster levels here, so "Lv. 40" means max level. */
export const artifactOptimizationMaximumLevel = 40;

/**
 * Narrows the roster before any optimizer builds candidates or slots. The
 * artifact collection remains untouched: an artifact worn by an ineligible
 * monster is still an artifact the optimizer may give to an eligible monster.
 */
export function artifactOptimizationMonsters(
  monsters: readonly GameRecord[],
  settings: Pick<ArtifactSettings, 'onlyLevel40Monsters'>,
): readonly GameRecord[] {
  return monsters.filter((monster) => canEquipArtifacts(monster)
    && (!settings.onlyLevel40Monsters || (typeof monster.unit_level === 'number'
    && Number.isSafeInteger(monster.unit_level)
    && monster.unit_level >= artifactOptimizationMaximumLevel)));
}
