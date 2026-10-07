import type { GameRecord } from './game-data';

/** The game unlocks artifacts only when a monster reaches its sixth star. */
export const artifactMinimumMonsterStars = 6;
/** The game unlocks relic engraving only when a monster reaches level 40. */
export const relicMinimumMonsterLevel = 40;

function whole(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

/** Whether this owned monster can legally take either artifact category. */
export function canEngraveArtifacts(monster: GameRecord): boolean {
  return whole(monster.class) === artifactMinimumMonsterStars;
}

/** Whether this owned monster can legally receive a relic engraving. */
export function canEngraveRelics(monster: GameRecord): boolean {
  return (whole(monster.unit_level) ?? -1) >= relicMinimumMonsterLevel;
}
