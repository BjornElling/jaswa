import { ancientMarkLetter } from '../../domain/runes/ancient-mark';
import styles from './ancient-mark.module.css';

/**
 * The rendered Ancient mark: one bold gold-edged letter after a name.
 *
 * Its accessible name is the whole word, so a screen reader hears
 * "Determination Ancient" where the page shows `Determination A`. The title
 * carries the same word for a pointer, and is what the Playwright suite
 * addresses the mark by.
 */
export function AncientMark() {
  /* An `<abbr>`, which is what this is: one letter standing for one word. The
     element also keeps the mark out of the two blanket rules the result cards
     lay on a cell's `span`s and `b`s — `display: block` and the second line's
     colour — which turned `Violent A` into two lines with the mark on the
     wrong one. A mark is not a line of a cell, and an element that is not text
     in a cell cannot be styled as one by accident. */
  return <abbr className={`type-label ${styles.mark}`} role="img" aria-label="Ancient" title="Ancient">
    {ancientMarkLetter}
  </abbr>;
}

/**
 * A name, with the mark after it when the thing named is Ancient.
 *
 * Every list that names a rune, a gem or a grindstone renders through this, so
 * the mark cannot appear in one table's spelling and not another's.
 */
export function AncientName({ name, ancient }: { name: string; ancient: boolean }) {
  return <>{name}{ancient && <AncientMark />}</>;
}
