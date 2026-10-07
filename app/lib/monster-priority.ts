/**
 * **The monster priority list** — copies in the order the player would rather
 * see them geared, first place first.
 *
 * Only Rune Optimization reads it, and only while *Include runes from
 * higher-priority monsters* is off: a monster may then take a rune from a monster
 * below it on the list, or from one not on it at all, but never from one above it.
 * A monster not on the list ranks below every monster that is.
 *
 * The list holds copies by unit id, so a copy that leaves the account stays in it
 * until removed: it costs the search nothing, since no rune is engraved on it, and a
 * second import of the same account brings it back to its place.
 */
export type MonsterPriority = readonly string[];

/**
 * The stored list, one entry at a time (`preference-reading.ts`): an entry that is
 * not a unit id, or names a copy already placed above it, is dropped and every
 * other entry keeps its place.
 */
export function readMonsterPriority(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((entry): entry is string => {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });
}

/**
 * The copies whose runes `unitId` may not take: every one above it on the list,
 * and the whole list where it is not on it.
 */
export function higherPriorityThan(priority: MonsterPriority, unitId: string): string[] {
  const place = priority.indexOf(unitId);
  return place === -1 ? [...priority] : priority.slice(0, place);
}
