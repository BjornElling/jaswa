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

/** A copy's numbered game name, qualified by the user's own label when it has one. */
export function labelledMonsterName(gameName: string, label: string | undefined): string {
  return label ? `${gameName} (${label})` : gameName;
}

/**
 * What one owned copy is called, wherever it is named.
 *
 * The numbered game name always comes first — `Lushen (2A) #2` — and a user's
 * own label follows it in parentheses. A label qualifies the monster rather
 * than replacing it: a copy called only "Farm" could not be recognised, and a
 * list sorted by label scattered one species across the table. Every page
 * naming a copy reads this rather than composing the two itself: pages that
 * read only the numbered name showed "Lushen #2" on one screen and "Farm
 * Lushen" on the next for the same monster.
 */
export type MonsterCopyName = { name: string };

export function monsterCopyNames(
  monsters: readonly GameRecord[],
  monsterPreferences: MonsterPreferences,
): Record<string, MonsterCopyName> {
  const numbered = numberedMonsterNames(monsters);
  return Object.fromEntries(Object.entries(numbered).map(([unitId, gameName]) => (
    [unitId, { name: labelledMonsterName(gameName, monsterPreferences[unitId]?.label) }]
  )));
}
