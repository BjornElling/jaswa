import { monsterPresentation } from './monster-catalog';
import type { GameRecord } from './game-data';
import type { MonsterPreferences, MonsterProfiles } from './monster-preferences';

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
 *
 * A label is part of a copy's profile, so it is read in one context: a page
 * about a preset names its copies as that preset's profiles do, and a page
 * about Default as Default's do.
 */
export type MonsterCopyName = { name: string };

export function monsterCopyNames(
  monsters: readonly GameRecord[],
  profiles: MonsterProfiles,
): Record<string, MonsterCopyName> {
  const numbered = numberedMonsterNames(monsters);
  return Object.fromEntries(Object.entries(numbered).map(([unitId, gameName]) => (
    [unitId, { name: labelledMonsterName(gameName, profiles[unitId]?.label) }]
  )));
}

/**
 * Every copy's name in every context, for a list that names one copy in several
 * presets at once — where an item is engraved, say. Each place is named by its
 * own context's profile, so a nickname given in one preset is not read into
 * another; `undefined` for a copy not in the roster.
 */
export function monsterCopyNamesIn(
  monsters: readonly GameRecord[],
  preferences: MonsterPreferences,
): (unitId: string, contextId: string) => string | undefined {
  const numbered = numberedMonsterNames(monsters);
  return (unitId, contextId) => {
    const gameName = numbered[unitId];
    return gameName === undefined ? undefined : labelledMonsterName(gameName, preferences[contextId]?.[unitId]?.label);
  };
}
