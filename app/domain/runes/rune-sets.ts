/**
 * Rune sets and element names, by the numbers the game exports.
 *
 * The set identifiers are the ones the game uses in `set_id` on each rune,
 * and the element identifiers are the ones used in `attribute` on each
 * monster. Both are shown as text rather than colour: the overview encodes
 * meaning through form and position, and reserves colour for interactive
 * state.
 *
 * **One set table.** A set's name and the runes it takes are one fact about the
 * game, so they live in one row here, and the stat sheet, the build vocabulary,
 * the statistics reader and the optimizer all derive from it. Three hand-typed
 * copies of the same piece counts agreed only by luck. This module imports
 * nothing, so the search workers can read it beside `monster-stats.ts`.
 */

/**
 * Every set the game puts on a rune: its name, and the engraved runes one
 * completed set takes (`RUNE-CANONICAL.md` §10).
 *
 * Intangible has no piece count. It is no set of its own: it stands in for the
 * one missing rune of a set that is exactly one short, and with two sets each
 * one short it completes neither (`intangibleCompletion`). A count of four once
 * stood here and made it read as a four-set wherever pieces were asked.
 */
const runeSets: Readonly<Record<number, { name: string; pieces: 2 | 4 | null }>> = {
  1: { name: 'Energy', pieces: 2 }, 2: { name: 'Guard', pieces: 2 }, 3: { name: 'Swift', pieces: 4 },
  4: { name: 'Blade', pieces: 2 }, 5: { name: 'Rage', pieces: 4 }, 6: { name: 'Focus', pieces: 2 },
  7: { name: 'Endure', pieces: 2 }, 8: { name: 'Fatal', pieces: 4 }, 10: { name: 'Despair', pieces: 4 },
  11: { name: 'Vampire', pieces: 4 }, 13: { name: 'Violent', pieces: 4 }, 14: { name: 'Nemesis', pieces: 2 },
  15: { name: 'Will', pieces: 2 }, 16: { name: 'Shield', pieces: 2 }, 17: { name: 'Revenge', pieces: 2 },
  18: { name: 'Destroy', pieces: 2 }, 19: { name: 'Fight', pieces: 2 }, 20: { name: 'Determination', pieces: 2 },
  21: { name: 'Enhance', pieces: 2 }, 22: { name: 'Accuracy', pieces: 2 }, 23: { name: 'Tolerance', pieces: 2 },
  24: { name: 'Seal', pieces: 2 }, 25: { name: 'Intangible', pieces: null },
};

/** The highest `set_id` the game uses, plus one, so a set count can be a flat array. */
export const setIdBound = 26;

/** Intangible's own `set_id` (`RUNE-CANONICAL.md` §10). */
export const intangibleSetId = 25;

/** Swift's own `set_id`, which Speed Tuning asks after. */
export const swiftSetId = 3;

/**
 * The runes one completed set of `setId` takes. A set id the table does not
 * hold, and Intangible, which completes others rather than itself, throw: a
 * guessed two would turn an unknown set into a wrong build without a word.
 */
export function setPieceCount(setId: number): 2 | 4 {
  const pieces = runeSets[setId]?.pieces;
  if (pieces === undefined || pieces === null) throw new Error(`Rune set ${setId} has no piece count.`);
  return pieces;
}

/* The same counts as a flat array for the hot loops, 0 where a set has none. */
const piecesById: Int32Array = Int32Array.from({ length: setIdBound }, (_, setId) => runeSets[setId]?.pieces ?? 0);

/**
 * Which set an engraved Intangible rune completes, or `-1` for none.
 *
 * `RUNE-CANONICAL.md` §10: an Intangible completes one set that is exactly one rune
 * short. Where no set, more than one set, or more than one Intangible is present,
 * it completes none. There is no tie-breaker to guess and no unknown state for a
 * caller to interpret differently: with broken sets allowed the rune remains a
 * broken rune, and with broken sets refused the combination is rejected.
 */
export function intangibleCompletion(counts: ArrayLike<number>): number {
  if ((counts[intangibleSetId] ?? 0) !== 1) return -1;
  let found = -1;
  for (let setId = 1; setId < setIdBound; setId += 1) {
    const pieces = piecesById[setId];
    if (pieces === 0 || (counts[setId] ?? 0) === 0) continue;
    if (counts[setId] % pieces !== pieces - 1) continue;
    /* The game deliberately refuses to choose between two incomplete sets. */
    if (found !== -1) return -1;
    found = setId;
  }
  return found;
}

/**
 * How many runes a set takes, by the name it is chosen under — every set but
 * Intangible, which takes none of its own.
 *
 * `RUNE-CANONICAL.md` §10 is the source: a four-set fills four of the six
 * slots and leaves room for exactly one two-set, while two-sets stack up to
 * three times. That arithmetic is what makes a *pair* sayable at all, so it is
 * exported rather than kept private to `activeRuneSets`.
 */
export const runeSetPieceCount: Readonly<Record<string, 2 | 4>> = Object.fromEntries(
  Object.values(runeSets).flatMap(({ name, pieces }) => pieces === null ? [] : [[name, pieces]]),
);

/** The runes a set named `name` takes; a name with no count throws, as `setPieceCount` does. */
export function runeSetPieces(name: string): 2 | 4 {
  const pieces = runeSetPieceCount[name];
  if (pieces === undefined) throw new Error(`Rune set ${name} has no piece count.`);
  return pieces;
}

/** Intangible is a permanent Rune Clean-up exception, not a role choice. */
export const intangibleRuneSetName = 'Intangible';

export const isIntangibleRuneSet = (setName: string): boolean => setName === intangibleRuneSetName;

const elementNames: Record<number, string> = {
  1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark',
};

/**
 * The five elements in the game's own order, which every element control reads
 * so that no page arranges them its own way. Taken from the attribute numbering
 * above rather than restated, because that numbering *is* the game's order.
 */
export const elementNameList: readonly string[] = Object.keys(elementNames)
  .map(Number)
  .sort((left, right) => left - right)
  .map((attribute) => elementNames[attribute]);

/** Every set name the game can put on a rune, including Intangible. */
export const allRuneSetNames: readonly string[] = Object.values(runeSets).map(({ name }) => name)
  .sort((left, right) => left.localeCompare(right));

const runeSetIdsByName = new Map(Object.entries(runeSets).map(([id, { name }]) => [name, Number(id)]));

/**
 * The sets a role may ask for, alphabetically. The role editor offers these,
 * so a role cannot name a set the game does not have — and a saved or imported
 * role is held to the same list, so one naming a set that is not choosable
 * loses it on load rather than keeping a choice the editor could not have made.
 *
 * Intangible is deliberately absent. A monster may have at most one engraved, it carries
 * no set bonus of its own, and it completes a set that is one rune short rather
 * than being a set a role is built around. Rune Clean-up therefore treats its set
 * side as preferred centrally; the role editor must not offer a second answer.
 */
export const roleRuneSetNameList: readonly string[] = allRuneSetNames.filter((name) => !isIntangibleRuneSet(name));

export type ActiveRuneSet = { name: string; abbreviation: string; count: number };

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function runeSetName(setId: unknown): string | undefined {
  return runeSets[numberValue(setId)]?.name;
}

export function runeSetId(setName: string): number | undefined {
  return runeSetIdsByName.get(setName);
}

export function elementName(attribute: unknown): string | undefined {
  return elementNames[numberValue(attribute)];
}

/**
 * The completed sets a monster currently has, most pieces first. Repeating an
 * abbreviation for each completed set keeps a 6-piece Fight build legible as
 * `Fig/Fig/Fig` — a capital and two lower-case letters, so the column reads as
 * names rather than as a shouted code; all leftover pieces collapse into one
 * `Bro` marker.
 */
export function activeRuneSets(monster: Record<string, unknown>): ActiveRuneSet[] {
  const runes = Array.isArray(monster.runes) ? monster.runes : [];
  const counts: Record<number, number> = {};
  const engraved = new Int32Array(setIdBound);
  let hasBrokenRune = false;

  for (const rune of runes) {
    if (!rune || typeof rune !== 'object' || Array.isArray(rune)) {
      hasBrokenRune = true;
      continue;
    }
    const setId = numberValue((rune as Record<string, unknown>).set_id);
    if (setId > 0 && setId < setIdBound) engraved[setId] += 1;
    /* An Intangible is not a set of its own: it completes one that is a rune
       short, or it is a broken rune (`RUNE-CANONICAL.md` §10). */
    if (setId === intangibleSetId) continue;
    if (piecesById[setId] > 0) counts[setId] = (counts[setId] ?? 0) + 1;
    else hasBrokenRune = true;
  }
  /* Where no set, more than one set, or more than one Intangible is present, the
     game completes no set; show the rune as broken rather than guessing a winner. */
  const completes = intangibleCompletion(engraved);
  if (completes > 0) counts[completes] = (counts[completes] ?? 0) + 1;
  else if (engraved[intangibleSetId] > 0) hasBrokenRune = true;

  const completedSets = Object.entries(counts)
    .map(([rawSetId, count]) => {
      const setId = Number(rawSetId);
      const required = setPieceCount(setId);
      const name = runeSets[setId].name;
      const complete = Math.floor(count / required);
      return { name, abbreviation: name.slice(0, 3), count, complete, broken: count % required > 0 };
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const sets = completedSets.flatMap((set) => Array.from({ length: set.complete }, () => ({
      name: set.name,
      abbreviation: set.abbreviation,
      count: set.count,
    })));
  if (completedSets.some((set) => set.broken)) hasBrokenRune = true;
  if (hasBrokenRune) sets.push({ name: 'Broken', abbreviation: 'Bro', count: 0 });
  return sets;
}
