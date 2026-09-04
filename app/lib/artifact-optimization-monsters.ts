import type { GameRecord } from './game-data';
import type { ArtifactSettings } from './types';

/** The game currently caps monster levels here, so "Lv. 40" means max level. */
export const artifactOptimizationMaximumLevel = 40;

/**
 * Narrows the roster before any optimizer builds candidates or slots. The
 * artifact collection remains untouched: an artifact worn by a lower-level
 * monster is still an artifact the optimizer may give to an eligible monster.
 */
export function artifactOptimizationMonsters(
  monsters: readonly GameRecord[],
  settings: Pick<ArtifactSettings, 'onlyLevel40Monsters'>,
): readonly GameRecord[] {
  if (!settings.onlyLevel40Monsters) return monsters;
  return monsters.filter((monster) => typeof monster.unit_level === 'number'
    && Number.isSafeInteger(monster.unit_level)
    && monster.unit_level >= artifactOptimizationMaximumLevel);
}
