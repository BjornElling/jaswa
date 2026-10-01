import styles from './shortfall-mark.module.css';
import type { Shortfall } from '../lib/monster-shortfall';
import { formatNumber } from '../lib/formatting';
import type { GeneralSettings } from '../lib/types';

/**
 * How a shortfall reads in one line.
 *
 * Whose wish it was is part of the sentence rather than a second colour: a
 * preference the user stated and a population default merely standing in are
 * different claims, and the mark looks identical for both.
 */
function describeShortfall(shortfall: Shortfall, general: GeneralSettings): string {
  const whose = shortfall.source === 'user' ? 'You want' : 'Most players want';
  const where = shortfall.where === undefined ? '' : `${shortfall.where}: `;

  if (shortfall.kind === 'stat' && shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose} ${shortfall.wanted} ${formatNumber(shortfall.target, general)},`
      + ` and this copy has ${formatNumber(shortfall.current, general)}.`;
  }
  /* A substat floor states both figures in percentage points, since that is how
     the game shows a roll and how the user typed the floor. */
  if (shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose} ${shortfall.wanted} at ${(shortfall.target / 100).toFixed(2)} % or better,`
      + ` and this copy rolled ${(shortfall.current / 100).toFixed(2)} %.`;
  }
  if (shortfall.present === undefined) {
    return `${where}${whose} ${shortfall.wanted}, and this copy has none.`;
  }
  return `${where}${whose} ${shortfall.wanted}, and this copy has ${shortfall.present}.`;
}

/**
 * A wish this copy does not meet, marked where the reader is already looking.
 *
 * The empty slot is rendered too, so a column that gains a mark does not gain a
 * box. Colour is never the whole signal: the mark names the gap in words for a
 * screen reader and on hover, which is the rule `quality-rule` set and the
 * reason a colour nobody can name is decoration.
 */
export function ShortfallMark({ shortfalls, general }: {
  shortfalls: readonly Shortfall[];
  general: GeneralSettings;
}) {
  if (shortfalls.length === 0) return <span className={styles.slot} aria-hidden="true" />;
  const reading = shortfalls.map((shortfall) => describeShortfall(shortfall, general)).join(' ');
  return <span className={`${styles.slot} ${styles.short}`} role="img" aria-label={reading} title={reading}>
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5.2v3.4" className={styles.bang} />
      <path d="M8 10.8h.01" className={styles.bang} />
    </svg>
  </span>;
}
