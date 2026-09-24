import { monsterPresentation } from './monster-catalog';
import type { GameRecord } from './game-data';
import type { MonsterPreferences } from './monster-preferences';

export function numberedMonsterNames(monsters: readonly GameRecord[]): Record<string, string> {
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

/**
 * What one owned copy is called, wherever it is named.
 *
 * `name` is the user's own label when there is one and the numbered game name
 * otherwise; `secondaryName` is the game name under a label, so a renamed copy
 * can still be recognised. Every page naming a copy reads this rather than
 * composing the two itself: pages that read only the numbered name showed
 * "Lushen #2" on one screen and "Farm Lushen" on the next for the same monster.
 */
export type MonsterCopyName = { name: string; secondaryName?: string };

export function monsterCopyNames(
  monsters: readonly GameRecord[],
  monsterPreferences: MonsterPreferences,
): Record<string, MonsterCopyName> {
  const numbered = numberedMonsterNames(monsters);
  return Object.fromEntries(Object.entries(numbered).map(([unitId, gameName]) => {
    const label = monsterPreferences[unitId]?.label;
    return [unitId, label ? { name: label, secondaryName: gameName } : { name: gameName }];
  }));
}
