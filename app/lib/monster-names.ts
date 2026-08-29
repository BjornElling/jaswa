import { monsterPresentation } from './monster-catalog';
import type { GameRecord } from './game-data';

export function numberedMonsterNames(monsters: GameRecord[]): Record<string, string> {
  const entries = monsters.map((monster, index) => ({
    unitId: String(monster.unit_id ?? `unknown-${index}`),
    name: monsterPresentation(monster.unit_master_id).name,
  }));
  const totals = entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.name]: (result[entry.name] ?? 0) + 1 }), {});
  const seen: Record<string, number> = {};
  return Object.fromEntries(entries.map((entry) => {
    const number = (seen[entry.name] = (seen[entry.name] ?? 0) + 1);
    return [entry.unitId, totals[entry.name] > 1 ? `${entry.name} #${number}` : entry.name];
  }));
}
