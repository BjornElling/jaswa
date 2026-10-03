import type { Shortfall } from './monster-shortfall';
import { formatNumber } from './formatting';
import type { GeneralSettings } from './types';

export type FigureMarkTone = 'red' | 'yellow' | 'green';

export type FigureMark = {
  key: string;
  tone: FigureMarkTone;
  /** What the mark means, in one sentence. */
  reading: string;
  glyph: 'ring' | 'info' | 'slashed';
};

export const alwaysCritsMark: FigureMark = { key: 'always-crits', tone: 'green', reading: 'Always crits', glyph: 'info' };

/** Whose wish it was stays in the sentence, so a user choice and a population default make different claims. */
function describeShortfall(shortfall: Shortfall, general: GeneralSettings): string {
  const whose = shortfall.source === 'user' ? 'You want' : 'Most players want';
  const where = shortfall.where === undefined ? '' : `${shortfall.where}: `;

  if (shortfall.kind === 'stat' && shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose} ${shortfall.wanted} ${shortfall.over ? 'at most' : 'at least'} ${formatNumber(shortfall.target, general)},`
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

/** A wish this copy does not meet is something left to finish, not something broken. */
export function shortfallMarks(shortfalls: readonly Shortfall[], general: GeneralSettings): FigureMark[] {
  if (shortfalls.length === 0) return [];
  const reading = shortfalls.map((shortfall) => describeShortfall(shortfall, general)).join(' ');
  return [{ key: 'shortfall', tone: 'yellow', reading, glyph: 'ring' }];
}

/** A found build that no longer holds as the search found it. Empty where it still does. */
export function buildIssueMarks(reading: string): FigureMark[] {
  return reading === '' ? [] : [{ key: 'build-issue', tone: 'yellow', reading, glyph: 'slashed' }];
}
