import type { Shortfall } from './monster-shortfall';
import type { CombatBonuses, LeadStat } from './monster-stats';
import { leadStats } from './monster-stats';
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

const leadWords: Readonly<Record<LeadStat, { name: string; stat: string }>> = {
  atk: { name: 'Attack lead', stat: 'ATK' },
  def: { name: 'Defence lead', stat: 'DEF' },
  spd: { name: 'Speed lead', stat: 'SPD' },
  hp: { name: 'HP lead', stat: 'HP' },
  criRate: { name: 'Crit lead', stat: 'CRI Rate' },
};

/**
 * One fixed-size mark after a figure explains every contribution the calculation
 * adds to it that the figure itself does not show: a lead, and for CRI Rate the
 * crit conditions. A stat with none carries no mark.
 */
export function combatBonusMarks(figure: string, bonuses: CombatBonuses): FigureMark[] {
  const lead = (leadStats as readonly string[]).includes(figure) ? bonuses.leads?.[figure as LeadStat] : undefined;
  const words = leadWords[figure as LeadStat];
  const reading = [
    figure === 'criRate' && bonuses.alwaysCrits ? 'Always crits' : undefined,
    figure === 'criRate' && bonuses.alwaysElementAdvantage ? 'Element advantage adds 15% CRI Rate' : undefined,
    lead ? `${words.name} adds ${lead}% ${words.stat}, counted in its range` : undefined,
  ].filter(Boolean).join('. ');
  return reading === '' ? [] : [{ key: 'combat-bonuses', tone: 'green', reading, glyph: 'info' }];
}

/** Whose wish it was stays in the sentence, so a user choice and a population default make different claims. */
function describeShortfall(shortfall: Shortfall, general: GeneralSettings): string {
  const whose = shortfall.source === 'user' ? 'You want' : 'Most players want';
  const where = shortfall.where === undefined ? '' : `${shortfall.where}: `;

  if (shortfall.kind === 'stat' && shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose} ${shortfall.wanted} ${shortfall.over ? 'at most' : 'at least'} ${formatNumber(shortfall.target, general)},`
      + ` and this copy has ${formatNumber(shortfall.current, general)}${shortfall.withLead ? ' with its lead' : ''}.`;
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
