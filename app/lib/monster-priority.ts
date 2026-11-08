/**
 * **A preset's priority list** — its monsters in the order the player would
 * rather see them geared, first place first. Runes compete only inside one
 * preset (`DECK-PRESETS.md` §1), so every preset has a list of its own.
 *
 * Only Rune Optimization reads it, and only while *Include runes from
 * higher-priority monsters* is off: a monster on the list may then take a rune
 * from one below it or from one not on it at all, never from one above it. A
 * monster not on the list outranks no one, not even another monster off it, so
 * it takes no engraved rune: the list is how the user says whose gear may be
 * spent, and leaving a monster off it says nothing of the kind. Only Scenario can
 * have such a monster, since every other preset lists all its members
 * (`presetPriorityOf`). `MonsterPriority` is Scenario's list.
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

/** Whether the list lets `taker` take `owner`'s runes: from one below it or off the list, and only from a place on it. */
export function outranks(priority: MonsterPriority, taker: string, owner: string): boolean {
  const place = priority.indexOf(taker);
  if (place === -1) return false;
  const other = priority.indexOf(owner);
  return other === -1 || other > place;
}

/**
 * The order the user put a game preset's monsters in, by preset id. A game
 * preset's monsters are the game's, so only their order is the user's: a
 * preset never reordered is read in the game's own order and stores nothing.
 */
export type PresetPriority = Readonly<Record<string, readonly string[]>>;

export function readPresetPriority(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const read: Record<string, string[]> = {};
  for (const [presetId, order] of Object.entries(value)) {
    if (presetId.length > 0 && Array.isArray(order)) read[presetId] = readMonsterPriority(order);
  }
  return read;
}

/**
 * A preset's priority list. Scenario ranks the copies the user placed on its
 * list and no others; a preset built in JASWA is ranked in the order of its
 * members; a game preset in the order the user gave it, with a monster the
 * game added since placed last and one it removed left out.
 */
export function presetPriorityOf(
  preset: { id: string; kind: 'scenario' | 'game' | 'own'; members: readonly string[] },
  monsterPriority: MonsterPriority, presetPriority: PresetPriority,
): string[] {
  if (preset.kind === 'scenario') return [...monsterPriority];
  if (preset.kind === 'own') return [...preset.members];
  const stored = (presetPriority[preset.id] ?? []).filter((unitId) => preset.members.includes(unitId));
  return [...stored, ...preset.members.filter((unitId) => !stored.includes(unitId))];
}
