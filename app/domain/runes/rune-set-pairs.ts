import { roleRuneSetNameList, runeSetPieceCount, runeSetPieces } from './rune-sets';

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
 * to three times.
 *
 * **A build names the sets it must hold; the slots it does not name are free.**
 * `Violent` is four Violent runes and any two others, `Violent/Will` fills all
 * six, `Swift/Will` leaves two free. What may sit in a free slot is not part of
 * the build but of the copy's *Allow broken sets* answer
 * (`MonsterCopyPreferences.allowBrokenSets`): with it off, every rune must belong
 * to a completed set, so `Violent` means Violent and some two-set; with it on, the
 * free slots take anything. Naming broken slots inside the build — the earlier
 * `Violent/Broken` — said the same thing build by build, and could not say
 * "Violent with a whole two-set, whichever" at all.
 *
 * | Shape | Example | Slots named |
 * | --- | --- | --- |
 * | four | `Violent` | 4 |
 * | four + two | `Violent/Destroy` | 4 + 2 |
 * | two-sets | `Destroy`, `Destroy/Blade`, `Destroy/Blade/Will` | 2, 2 + 2, 2 + 2 + 2 |
 * | one two-set stacked | `Blade/Blade`, `Blade/Blade/Blade` | 2 + 2, 2 + 2 + 2 |
 *
 * **One spelling, everywhere.** A build is written as its set names as the game
 * spells them, joined by `/` with no spaces, leading set first. That string is the
 * identifier: it is what the user reads, what a preference stores, and what the
 * optimizer matches, so there is no second encoding to keep in step with the
 * first. `runeBuildName` is the one place that writes it, and an engraved build goes
 * through it too — an engraved build still ends in `Broken` where slots are broken,
 * because that describes runes, not a wish.
 */

/** The separator between the parts of one build, in the identifier and on screen. */
export const runeBuildSeparator = '/';

/** The part that names the slots no set completes in an *engraved* build. A wanted build never carries it. */
export const brokenRuneBuildPart = 'Broken';

export type RuneBuild = {
  /** The build as it is written, stored and matched. */
  id: string;
  /** The sets it must hold, leading set first. */
  sets: readonly string[];
  /** How many of the six slots the named sets take; the rest are free. */
  slots: number;
  /** The set the build is led by — the four-set, or the first two-set. */
  leading: string;
};

/** The six sets that take four of the six slots, alphabetically. */
export const fourPieceRuneSets: readonly string[] = roleRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 4);

/** The sixteen sets that take two slots and may stack up to three times. */
export const twoPieceRuneSets: readonly string[] = roleRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 2);

/** The most sets one build may name: three two-sets fill all six slots. */
export const runeBuildMaximumSets = 3;

export const runeSlotCount = 6;

/**
 * An engraved or wanted build, written the one way builds are written. `names` are
 * set names as the game spells them; the `Broken` that `activeRuneSets` ends a
 * engraved build with is this module's own leftover part.
 */
export function runeBuildName(names: readonly string[]): string {
  return names.join(runeBuildSeparator);
}

/** How many slots a list of sets takes. A name with no piece count throws rather than reading as a two-set. */
export function runeSetSlots(sets: readonly string[]): number {
  return sets.reduce((total, name) => total + runeSetPieces(name), 0);
}

/** One build from its sets, or `undefined` where the six slots cannot hold them. */
export function makeRuneBuild(sets: readonly string[]): RuneBuild | undefined {
  const leading = sets[0];
  if (leading === undefined || sets.length > runeBuildMaximumSets) return undefined;
  if (!sets.every((name) => roleRuneSetNameList.includes(name))) return undefined;
  /* A four-set takes four slots, so it can only lead: after it there is room
     for one two-set and nothing else. */
  if (sets.slice(1).some((name) => runeSetPieceCount[name] !== 2)) return undefined;
  const slots = runeSetSlots(sets);
  if (slots > runeSlotCount) return undefined;
  return { id: runeBuildName(sets), sets, slots, leading };
}

/**
 * The two-sets that may follow `sets` in a build, in the vocabulary's order — the
 * menu's next column. Empty once the six slots are spoken for. A set already named
 * is offered again: two-sets stack, and `Blade/Blade/Blade` is three Blade sets.
 */
export function runeBuildContinuations(sets: readonly string[]): readonly string[] {
  if (sets.length >= runeBuildMaximumSets || runeSetSlots(sets) + 2 > runeSlotCount) return [];
  return twoPieceRuneSets;
}

/**
 * A build by its identifier, or `undefined` where it is not written exactly as
 * `runeBuildName` writes it or names more than the game can fill.
 */
export function runeBuild(id: string): RuneBuild | undefined {
  const build = makeRuneBuild(id.split(runeBuildSeparator));
  return build?.id === id ? build : undefined;
}

/** Whether a stored identifier names a build the game can actually engrave. */
export function isRuneBuildId(id: string): boolean {
  return runeBuild(id) !== undefined;
}

/**
 * The build regardless of which set leads it. `Destroy/Blade/Will` and
 * `Will/Blade/Destroy` fill the same six slots, and a list holding both would
 * be offering the optimizer one answer twice.
 */
export function runeBuildKey(build: RuneBuild): string {
  return [...build.sets].sort().join(runeBuildSeparator);
}
