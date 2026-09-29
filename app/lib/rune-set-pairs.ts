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
 * to three times. Slots no set completes are `broken`, and broken is named in
 * the build rather than granted by a switch beside it, because "Violent with
 * anything in the last two" and "Violent and Will" are different answers:
 *
 * | Shape | Example | Slots |
 * | --- | --- | --- |
 * | four + two | `Violent/Destroy` | 4 + 2 |
 * | four + broken | `Violent/Broken` | 4 + 2 |
 * | two-sets | `Destroy/Blade/Will` | 2 + 2 + 2 |
 * | two-sets + broken | `Destroy/Blade/Broken`, `Destroy/Broken` | 2 + 2 + 2, 2 + 4 |
 *
 * Every build fills all six slots, so `Violent` or `Destroy/Blade` on its own
 * is not a build: it does not say what the rest is.
 *
 * **One spelling, everywhere.** A build is written as its set names as the game
 * spells them, joined by `/` with no spaces, leading set first and `Broken`
 * last. That string is the identifier: it is what the user reads, what a
 * preference stores, and what the optimizer matches, so there is no second
 * encoding to keep in step with the first. `runeBuildName` is the one place
 * that writes it, and a worn build goes through it too.
 *
 * The six four-sets against sixteen two-sets and broken make 102 four-set
 * builds — seventeen under each four-set, which is a menu a reader can scan.
 * The two-set stacks run to hundreds, which is not, so they are *composed*
 * rather than enumerated: a leading two-set opens the other two-sets and the
 * user ticks the ones that complete the build, the untouched slots reading as
 * broken.
 */

/** The separator between the parts of one build, in the identifier and on screen. */
export const runeBuildSeparator = '/';

/** The part that names slots no set completes. */
export const brokenRuneBuildPart = 'Broken';

export type RuneBuild = {
  /** The build as it is written, stored and matched. */
  id: string;
  /** The completed sets, leading set first — `Broken` is not a set and is not here. */
  sets: readonly string[];
  /** Whether slots are left that no named set completes. */
  broken: boolean;
  /** The set the build is led by — the four-set, or the first two-set. */
  leading: string;
};

/** The six sets that take four of the six slots, alphabetically. */
export const fourPieceRuneSets: readonly string[] = presetRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 4);

/** The sixteen sets that take two slots and may stack up to three times. */
export const twoPieceRuneSets: readonly string[] = presetRuneSetNameList
  .filter((name) => runeSetPieceCount[name] === 2);

/** The most sets one build may name: three two-sets fill all six slots. */
export const runeBuildMaximumSets = 3;

const runeSlots = 6;

/**
 * A worn or wanted build, written the one way builds are written. `names` are
 * set names as the game spells them; the `Broken` that `activeRuneSets` ends a
 * worn build with is this module's own leftover part.
 */
export function runeBuildName(names: readonly string[]): string {
  return names.join(runeBuildSeparator);
}

/** One build from its sets, or `undefined` where the six slots cannot hold exactly that. */
export function makeRuneBuild(sets: readonly string[], broken: boolean): RuneBuild | undefined {
  const leading = sets[0];
  if (leading === undefined || sets.length > runeBuildMaximumSets) return undefined;
  if (new Set(sets).size !== sets.length) return undefined;
  if (!sets.every((name) => presetRuneSetNameList.includes(name))) return undefined;
  /* A four-set fills four slots, so it can only lead: after it there is room
     for one two-set and nothing else. */
  if (sets.slice(1).some((name) => runeSetPieceCount[name] !== 2)) return undefined;

  const filled = sets.reduce((total, name) => total + (runeSetPieceCount[name] ?? 2), 0);
  /* Broken names the slots left over, so it needs some left and the build
     without it needs none. */
  if (broken ? filled >= runeSlots : filled !== runeSlots) return undefined;
  return {
    id: runeBuildName(broken ? [...sets, brokenRuneBuildPart] : sets),
    sets, broken, leading,
  };
}

/** The four-set builds led by one set, for the menu's second column: every two-set, then broken. */
export function runeBuildsLedBy(leading: string): readonly RuneBuild[] {
  if (runeSetPieceCount[leading] !== 4) return [];
  return [
    ...twoPieceRuneSets.map((two) => makeRuneBuild([leading, two], false)),
    makeRuneBuild([leading], true),
  ].filter((build): build is RuneBuild => build !== undefined);
}

/**
 * A build by its identifier, or `undefined` where it is not written exactly as
 * `runeBuildName` writes it or names slots the game cannot fill.
 */
export function runeBuild(id: string): RuneBuild | undefined {
  const parts = id.split(runeBuildSeparator);
  const broken = parts.at(-1) === brokenRuneBuildPart;
  const build = makeRuneBuild(broken ? parts.slice(0, -1) : parts, broken);
  return build?.id === id ? build : undefined;
}

/** Whether a stored identifier names a build the game can actually equip. */
export function isRuneBuildId(id: string): boolean {
  return runeBuild(id) !== undefined;
}

/**
 * The build regardless of which set leads it. `Destroy/Blade/Will` and
 * `Will/Blade/Destroy` fill the same six slots, and a list holding both would
 * be offering the optimizer one answer twice.
 */
export function runeBuildKey(build: RuneBuild): string {
  return [...build.sets].sort().join(runeBuildSeparator) + (build.broken ? runeBuildSeparator + brokenRuneBuildPart : '');
}
