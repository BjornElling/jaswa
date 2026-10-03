import styles from './figure-marks.module.css';
import type { FigureMark, FigureMarkTone } from '../lib/figure-marks';

/**
 * **The marks after a figure** — one vocabulary for every note a figure can carry,
 * on the figure's own line.
 *
 * Every mark that applies is shown; none hides another. They stand side by side
 * in the order of their tone — red, then yellow, then green — so the most urgent is
 * read first, and each is coloured: a mark with no tone of its own would be one
 * the reader cannot rank. The tones are the verdict colours (`globals.css`):
 *
 * - **red** — something is wrong with the figure. Nothing uses it yet.
 * - **yellow** — something is left to do: a wish the copy does not meet yet, a
 *   found build the account has moved out from under.
 * - **green** — a fact in the figure's favour: a monster that always crits.
 *
 * Each says what it means in words, for a screen reader and on hover.
 */
const toneOrder: Record<FigureMarkTone, number> = { red: 0, yellow: 1, green: 2 };

function Glyph({ glyph }: { glyph: FigureMark['glyph'] }) {
  if (glyph === 'info') {
    return <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 7.4v3.4" className={styles.stroke} />
      <path d="M8 5.2h.01" className={styles.stroke} />
    </svg>;
  }
  /* A slashed ring, because the triangle is already the unrefined artifact's. */
  if (glyph === 'slashed') {
    return <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M4.1 11.9 11.9 4.1" />
    </svg>;
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 5.2v3.4" className={styles.stroke} />
    <path d="M8 10.8h.01" className={styles.stroke} />
  </svg>;
}

/**
 * The marks, in tone order. `reserve` keeps room for that many even when fewer
 * apply, for a figure set flush right, where a mark arriving would otherwise push
 * the figure left (`AGENTS.md` §2). After a figure set flush left nothing needs
 * reserving: a mark arriving there moves nothing.
 */
export function FigureMarks({ marks, reserve = 0 }: { marks: readonly FigureMark[]; reserve?: number }) {
  const shown = [...marks].sort((left, right) => toneOrder[left.tone] - toneOrder[right.tone]);
  const spare = Math.max(0, reserve - shown.length);
  return <span className={styles.marks}>
    {shown.map((mark) => <span key={mark.key} className={styles.mark} data-tone={mark.tone}
      role="img" aria-label={mark.reading} title={mark.reading}>
      <Glyph glyph={mark.glyph} />
    </span>)}
    {Array.from({ length: spare }, (_, at) => <span key={`spare-${at}`} className={styles.mark} aria-hidden="true" />)}
  </span>;
}
