import type { GameRecord } from './game-data';
import { monsterSkillUpsToMax } from './monster-catalog';

export function currentSkillUps(monster: GameRecord): number | null {
  if (!Array.isArray(monster.skills)) return null;
  let total = 0;
  for (const skill of monster.skills) {
    if (!Array.isArray(skill) || typeof skill[1] !== 'number' || !Number.isSafeInteger(skill[1]) || skill[1] < 1) return null;
    total += skill[1] - 1;
  }
  return total;
}

export function isMaxSkilled(monster: GameRecord): boolean {
  const maximum = monsterSkillUpsToMax(monster.unit_master_id);
  if (maximum === undefined) return false;
  if (maximum === 0) return true;
  const current = currentSkillUps(monster);
  return current !== null && current >= maximum;
}

export const skillUpOptions = ['None', 'Partial', 'Full'] as const;
export type SkillUpProgress = typeof skillUpOptions[number];

/** Unknown progress stays unknown rather than claiming a monster has no skill-ups. */
export function skillUpProgress(monster: GameRecord): SkillUpProgress | undefined {
  if (isMaxSkilled(monster)) return 'Full';
  const current = currentSkillUps(monster);
  if (current === null) return undefined;
  if (current === 0) return 'None';
  return monsterSkillUpsToMax(monster.unit_master_id) === undefined ? undefined : 'Partial';
}
