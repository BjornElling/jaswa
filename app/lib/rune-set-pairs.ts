import { presetRuneSetNameList, runeSetPieceCount } from './rune-sets';

/**
 * The exact rune builds a user may ask for, as whole six-slot combinations.
 *
 * **This replaces choosing rune *types*.** Asking for Revenge and Despair
 * separately cannot say which of Revenge/Revenge/Revenge, Despair/Revenge or
 * Despair/Despair/Despair is wanted, and the optimizer had to guess — so a user
 * who wanted Despair/Revenge could be handed a triple Revenge build they never
 * asked for. A combination names the whole answer, so there is nothing left to
 * guess.
 *
 * `RUNE-CANONICAL.md` §10 fixes the arithmetic the combinations come from: six
 * slots, a four-set leaves room for exactly one two-set, and two-sets stack up
 * to three times. Those are the only shapes the game can equip:
 *
 * | Shape | Example | Slots |
 * | --- | --- | --- |
 * | four + two | `Violent / Blade` | 4 + 2 |
 * | two-sets | `Will / Nemesis / Energy` | 2 + 2 + 2 |
 *
 * A build is written as its set names joined by ` / `, leading set first. That
 * string is the identifier: it is what the user reads, what a preference stores,
 * and what the optimizer matches, so there is no second encoding to keep in
 * step with the first.
 *
 * The six four-sets against sixteen two-sets make 96 four-plus-two
 * combinations — sixteen under each four-set, which is a menu a reader can scan.
 * The two-set triples are 560, which is not, so they are *composed* rather than
 * enumerated: a leading two-set opens the other two-sets and the user ticks the
 * one or two that complete the build. `runeSetPairs` therefore lists what can be
 * offered as a finished row, and `isRuneSetPairId` accepts every shape the game
 * can equip, including the triples no list contains.
 */

/** The separator between the sets of one combination, in the identifier and on screen. */
export const runeSetPairSeparator = ' / ';

export type RuneSetPairShape = 'four-two' | 'two-set';

export type RuneSetPair = {
  /** The names joined by `runeSetPairSeparator`, leading set first. */
  id: string;
  /** The sets in the order they are read, leading set first. */
  sets: readonly string[];
  shape: RuneSetPairShape;
  /** The set the combination is built around — the four-set, or the first two-set. */
  leading: string;
};

/** The six sets that take four of the six slots, alphabetically. */
export const fourPieceRuneSets: readonly string[] = presetRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 4);

/** The sixteen sets that take two slots and may stack up to three times. */
export const twoPieceRuneSets: readonly string[] = presetRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 2);

/**
 * The most sets one build may name: three two-sets fill all six slots, and a
 * four-set plus its two-set is two. Nothing the game can equip needs a fourth.
 */
export const runeSetPairMaximumSets = 3;

function shapeOf(sets: readonly string[]): RuneSetPairShape | undefined {
  const leading = sets[0];
  if (leading === undefined || sets.length === 0 || sets.length > runeSetPairMaximumSets) return undefined;
  if (new Set(sets).size !== sets.length) return undefined;
  if (!sets.every((name) => presetRuneSetNameList.includes(name))) return undefined;

  /* A four-set fills four slots, so it leads and admits exactly one two-set
     after it. Anything else is a build the game cannot equip. */
  if (runeSetPieceCount[leading] === 4) {
    if (sets.length > 2) return undefined;
    return sets.slice(1).every((name) => runeSetPieceCount[name] === 2) ? 'four-two' : undefined;
  }
  return sets.every((name) => runeSetPieceCount[name] === 2) ? 'two-set' : undefined;
}

/** One combination from its sets, or `undefined` where the six slots cannot hold them. */
export function makeRuneSetPair(sets: readonly string[]): RuneSetPair | undefined {
  const shape = shapeOf(sets);
  if (shape === undefined) return undefined;
  return { id: sets.join(runeSetPairSeparator), sets, shape, leading: sets[0] };
}

/*
 * The rows a menu can offer whole: every four-set against every two-set, and
 * each two-set on its own as the start of a stack. A triple is finished by
 * ticking more two-sets in the submenu rather than by finding it in a list of
 * 560, so it is composed through `makeRuneSetPair` instead of appearing here.
 */
function buildOfferedPairs(): RuneSetPair[] {
  const pairs: RuneSetPair[] = [];
  for (const four of fourPieceRuneSets) {
    for (const two of twoPieceRuneSets) {
      const entry = makeRuneSetPair([four, two]);
      if (entry) pairs.push(entry);
    }
  }
  for (const two of twoPieceRuneSets) {
    const entry = makeRuneSetPair([two]);
    if (entry) pairs.push(entry);
  }
  return pairs;
}

const offered: readonly RuneSetPair[] = buildOfferedPairs();

/** Every combination a menu offers as a finished row, four-sets first. */
export const runeSetPairs: readonly RuneSetPair[] = offered;

/** The combinations that lead with one set, for the menu's second column. */
export function runeSetPairsLedBy(leading: string): readonly RuneSetPair[] {
  return offered.filter((entry) => entry.leading === leading);
}

/** A combination by its identifier, or `undefined` where the six slots cannot hold it. */
export function runeSetPair(id: string): RuneSetPair | undefined {
  return makeRuneSetPair(id.split(runeSetPairSeparator));
}

/** Whether a stored identifier names a build the game can actually equip. */
export function isRuneSetPairId(id: string): boolean {
  return runeSetPair(id) !== undefined;
}
