/**
 * How JASWA says "Ancient" beside a name.
 *
 * Ancient is a property of a rune, a gem or a grindstone — not part of what the
 * thing is called. Writing it into the name (`Ancient Determination`) made one
 * set read as two, pushed every Set column wide enough to hold the longest set
 * name plus a word, and sorted the Ancient half of a set under A rather than
 * beside the ordinary half. So the name stays the name and a single letter
 * carries the property: `Determination A`.
 *
 * This module is the plain-string half, for a sort key, a search index, an
 * accessible name and the two native `<select>`s that can hold no markup.
 * `app/ui/gear/ancient-mark.tsx` is the rendered half, and the two must say
 * the same thing — which is why the letter is declared once, here.
 */

/** The letter itself. One character, so a column of names stays a column. */
export const ancientMarkLetter = 'A';

/** `Determination A`, or the bare name where nothing is Ancient. */
export function withAncientMark(name: string, ancient: boolean): string {
  return ancient ? `${name} ${ancientMarkLetter}` : name;
}

/**
 * The word a search box still has to match.
 *
 * "ancient" is what a player types when they want the Ancient rows, and the
 * mark no longer spells it out — so every search index that used to pick the
 * word up from the visible label carries it deliberately instead.
 */
export const ancientSearchWord = 'ancient';
