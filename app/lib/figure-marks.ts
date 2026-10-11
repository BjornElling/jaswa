import { artifactMainPropertyOrder } from './artifact-properties';
import type { GearKind, GearMainAdvice, MainStatAdvice, MainStatBasis } from './main-stat-model';
import { contradictsAdvice, honouredMainStat, mainStatStatement } from './main-stat-model';
import type { MonsterCopyPreferences } from './monster-preferences';
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

const leadWords: Readonly<Record<LeadStat, { name: string; stat: string; reaches: string }>> = {
  atk: { name: 'Attack lead', stat: 'ATK', reaches: 'DMG' },
  def: { name: 'Defence lead', stat: 'DEF', reaches: 'E.HP and E.HP D' },
  hp: { name: 'HP lead', stat: 'HP', reaches: 'E.HP and E.HP D' },
  criRate: { name: 'Crit lead', stat: 'CRI Rate', reaches: 'DMG' },
};

/* The leads each composite counts, in the order its formula reads them. */
const compositeLeads: Readonly<Record<string, readonly LeadStat[]>> = {
  dmg: ['atk', 'criRate'], ehp: ['hp', 'def'], ehpD: ['hp', 'def'],
};

/**
 * One fixed-size mark after a figure explains what the fight adds that the
 * figure beside it does not show, or does. A stat is the copy's own, so its mark
 * says where its lead goes instead; a composite counts the fight, so its mark
 * names what it counted (`monster-stats.ts` `combatAt`). A figure with none
 * carries no mark.
 */
export function combatBonusMarks(figure: string, bonuses: CombatBonuses): FigureMark[] {
  const leadOf = (stat: LeadStat) => bonuses.leads?.[stat];
  const reading = figure in compositeLeads
    ? compositeReading(figure, bonuses)
    : [
      figure === 'criRate' && bonuses.alwaysCrits ? 'Always crits' : undefined,
      figure === 'criRate' && bonuses.alwaysElementAdvantage ? 'Element advantage adds 15% CRI Rate to DMG' : undefined,
      (leadStats as readonly string[]).includes(figure) && leadOf(figure as LeadStat)
        ? `${leadWords[figure as LeadStat].name} adds ${leadOf(figure as LeadStat)}% ${leadWords[figure as LeadStat].stat} to ${leadWords[figure as LeadStat].reaches}, not to this figure or its range`
        : undefined,
    ].filter(Boolean).join('. ');
  return reading === '' ? [] : [{ key: 'combat-bonuses', tone: 'green', reading, glyph: 'info' }];
}

function compositeReading(figure: string, bonuses: CombatBonuses): string {
  const counted = [
    ...compositeLeads[figure].flatMap((stat) => {
      const lead = bonuses.leads?.[stat];
      return lead ? [`${leadWords[stat].name} ${lead}%`] : [];
    }),
    figure === 'dmg' && bonuses.alwaysCrits ? 'a certain crit' : undefined,
    figure === 'dmg' && bonuses.alwaysElementAdvantage ? 'element advantage' : undefined,
  ].filter((part): part is string => Boolean(part));
  return counted.length === 0 ? '' : `Counted with ${counted.join(', ')}`;
}

/** Whose wish it was stays in the sentence, so a user choice and a population default make different claims. */
function describeShortfall(shortfall: Shortfall, general: GeneralSettings): string {
  const whose = shortfall.source === 'user' ? 'You want' : 'Most players want';
  const where = shortfall.where === undefined ? '' : `${shortfall.where}: `;

  if (shortfall.kind === 'stat' && shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose} ${shortfall.wanted} ${shortfall.over ? 'at most' : 'at least'} ${formatNumber(shortfall.target, general)},`
      + ` and this copy has ${formatNumber(shortfall.current, general)}.`;
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

const basisWords: Readonly<Record<MainStatBasis, string>> = {
  runes: 'Its six runes lift',
  statistics: 'The game’s rune statistics lift',
};

const pieceWords: Readonly<Record<GearKind, string>> = { artifact: 'artifacts', relic: 'the relic' };

function adviceWords(advice: GearMainAdvice): string {
  const byWorth = [...artifactMainPropertyOrder].sort((left, right) => advice.worth[right] - advice.worth[left]);
  const preferred = byWorth.filter((stat) => advice.bands[stat] === 'preferred');
  const acceptable = byWorth.filter((stat) => advice.bands[stat] === 'acceptable');
  return `${preferred.join(' or ')}${acceptable.length === 0 ? '' : ` (accepting ${acceptable.join(' or ')})`}`;
}

/**
 * What the overlay says about a copy's stated main, after its label.
 *
 * **Red** where mains are accepted but none preferred: that is not yet an
 * answer, so it is ignored and the maths decides (`mainStatStatement`). **Yellow**
 * where a preferred answer contradicts what the maths would choose
 * (`contradictsAdvice`): something to reconsider, not something broken — the
 * owner's answer still stands, and the mark only says what the maths makes of
 * this copy. Nothing where nothing was stated.
 */
export function mainStatAdviceMarks(
  preferences: MonsterCopyPreferences | undefined, advice: MainStatAdvice | undefined,
): FigureMark[] {
  if (mainStatStatement(preferences) === 'no-preferred') {
    return [{
      key: 'main-stat-no-preferred',
      tone: 'red',
      reading: 'Accepted main stats count only beside a preferred one, so the maths decides for now: choose at least one preferred main stat.',
      glyph: 'ring',
    }];
  }
  const stated = honouredMainStat(preferences);
  if (stated === undefined || advice === undefined) return [];
  const pieces = (['artifact', 'relic'] as const).filter((kind) => contradictsAdvice(stated, advice[kind]));
  if (pieces.length === 0) return [];
  const lifts = [...artifactMainPropertyOrder].sort((left, right) => advice.need[right] - advice.need[left])
    .map((stat) => `${stat} +${Math.round(advice.need[stat])}%`).join(', ');
  const same = pieces.length === 2 && adviceWords(advice.artifact) === adviceWords(advice.relic);
  const answers = same
    ? `artifacts and the relic want ${adviceWords(advice.artifact)}`
    : pieces.map((kind) => `${pieceWords[kind]} want${kind === 'relic' ? 's' : ''} ${adviceWords(advice[kind])}`).join('; ');
  const reading = `${basisWords[advice.basis]} ${lifts} over base, so by the maths ${answers}.`;
  return [{ key: 'main-stat-advice', tone: 'yellow', reading, glyph: 'info' }];
}

/**
 * A monster's runes or artifacts that another team of its pool holds too
 * (`DECK-PRESETS.md` §4). The game lets the overlap be saved and fields each
 * item on one team only, so it is a fault of every team involved.
 */
export function sharedInPoolMarks(shared: number, what: 'runes' | 'artifacts'): FigureMark[] {
  if (shared === 0) return [];
  const reading = shared === 1 ? `1 of these ${what} is engraved on another team too.`
    : `${shared} of these ${what} are engraved on another team too.`;
  return [{ key: 'shared-in-pool', tone: 'red', reading, glyph: 'ring' }];
}

/**
 * A sell verdict on a rune that is engraved somewhere. Selling it empties its
 * slot in every place it is engraved — Default and each preset that saves it
 * (`DECK-PRESETS.md` §1, rule 9) — which the verdict alone does not say.
 */
export function engravedSaleMarks(verdict: string, places: number): FigureMark[] {
  if (verdict !== 'sell' || places === 0) return [];
  const reading = places === 1 ? 'Engraved: selling it empties that slot.'
    : `Engraved in ${places} places: selling it empties a slot in each.`;
  return [{ key: 'engraved-sale', tone: 'red', reading, glyph: 'ring' }];
}
