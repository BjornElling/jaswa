/**
 * Rune set and element display names.
 *
 * The set identifiers are the ones the game uses in `set_id` on each rune,
 * and the element identifiers are the ones used in `attribute` on each
 * monster. Both are shown as text rather than colour: the overview encodes
 * meaning through form and position, and reserves colour for interactive
 * state.
 */

const runeSetNames: Record<number, string> = {
  1: 'Energy', 2: 'Guard', 3: 'Swift', 4: 'Blade', 5: 'Rage', 6: 'Focus',
  7: 'Endure', 8: 'Fatal', 10: 'Despair', 11: 'Vampire', 13: 'Violent',
  14: 'Nemesis', 15: 'Will', 16: 'Shield', 17: 'Revenge', 18: 'Destroy',
  19: 'Fight', 20: 'Determination', 21: 'Enhance', 22: 'Accuracy', 23: 'Tolerance',
  24: 'Seal', 25: 'Intangible',
};

// The number of equipped pieces a set needs before its bonus applies.
const runeSetPieces: Record<number, number> = {
  1: 2, 2: 2, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 4, 10: 4, 11: 4, 13: 4,
  14: 2, 15: 2, 16: 2, 17: 2, 18: 2, 19: 2, 20: 2, 21: 2, 22: 2, 23: 2,
  24: 2, 25: 4,
};

const elementNames: Record<number, string> = {
  1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark',
};

/** Every set name the game has, alphabetically. */
const runeSetNameList: readonly string[] = Object.values(runeSetNames).sort((left, right) => left.localeCompare(right));

/**
 * The sets a preset may ask for, alphabetically. The preset editor offers these,
 * so a preset cannot name a set the game does not have — and a saved or imported
 * preset is held to the same list, so one naming a set that is not choosable
 * loses it on load rather than keeping a choice the editor could not have made.
 *
 * Intangible is deliberately absent. A monster may wear at most one, it carries
 * no set bonus of its own, and it completes a set that is one rune short rather
 * than being a set a role is built around — so asking a preset to prefer it says
 * nothing about which runes are worth keeping. How much an Intangible rune is
 * wanted is asked once, on its own slider, not per preset.
 */
export const presetRuneSetNameList: readonly string[] = runeSetNameList.filter((name) => name !== 'Intangible');

export type ActiveRuneSet = { name: string; abbreviation: string; count: number };

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function runeSetName(setId: unknown): string | undefined {
  return runeSetNames[numberValue(setId)];
}

export function elementName(attribute: unknown): string | undefined {
  return elementNames[numberValue(attribute)];
}

/** The single letter shown in the overview's element mark. */
export function elementMark(attribute: unknown): string {
  return elementName(attribute)?.slice(0, 1).toUpperCase() ?? '·';
}

/**
 * The completed sets a monster currently has, most pieces first. Repeating an
 * abbreviation for each completed set keeps a 6-piece Fight build legible as
 * `FIG/FIG/FIG`; all leftover pieces collapse into one `BRO` marker.
 */
export function activeRuneSets(monster: Record<string, unknown>): ActiveRuneSet[] {
  const runes = Array.isArray(monster.runes) ? monster.runes : [];
  const counts: Record<number, number> = {};
  let hasBrokenRune = false;

  for (const rune of runes) {
    if (!rune || typeof rune !== 'object' || Array.isArray(rune)) {
      hasBrokenRune = true;
      continue;
    }
    const setId = numberValue((rune as Record<string, unknown>).set_id);
    if (runeSetNames[setId] && runeSetPieces[setId]) counts[setId] = (counts[setId] ?? 0) + 1;
    else hasBrokenRune = true;
  }

  const completedSets = Object.entries(counts)
    .map(([rawSetId, count]) => {
      const setId = Number(rawSetId);
      const required = runeSetPieces[setId];
      const name = runeSetNames[setId];
      if (!required || !name) return undefined;
      const complete = Math.floor(count / required);
      return { name, abbreviation: name.slice(0, 3).toUpperCase(), count, complete, broken: count % required > 0 };
    })
    .filter((set): set is { name: string; abbreviation: string; count: number; complete: number; broken: boolean } => set !== undefined)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const sets = completedSets.flatMap((set) => Array.from({ length: set.complete }, () => ({
      name: set.name,
      abbreviation: set.abbreviation,
      count: set.count,
    })));
  if (completedSets.some((set) => set.broken)) hasBrokenRune = true;
  if (hasBrokenRune) sets.push({ name: 'Broken', abbreviation: 'BRO', count: 0 });
  return sets;
}
