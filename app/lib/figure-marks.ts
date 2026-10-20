import { artifactMainPropertyOrder } from './artifact-properties';
import type { GearKind, GearMainAdvice, MainStatAdvice, MainStatBasis } from './main-stat-model';
import { contradictsAdvice, honouredMainStat, mainStatStatement } from './main-stat-model';
import type { MonsterCopyPreferences } from './monster-preferences';
import type { Shortfall } from './monster-shortfall';
import type { CombatBonuses, LeadStat, TeammateSets } from './monster-stats';
import { leadStats, combatStatBonus, elementAdvantageLift, teamSetBonuses } from './monster-stats';
import { percentStatCap } from './accuracy-ceiling';
import { statLabels } from './stat-labels';
import type { StatKey } from './stat-labels';
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
  atk: { name: `${statLabels.atk} lead`, stat: statLabels.atk },
  def: { name: `${statLabels.def} lead`, stat: statLabels.def },
  hp: { name: `${statLabels.hp} lead`, stat: statLabels.hp },
  criRate: { name: 'Crit lead', stat: statLabels.criRate },
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
export function combatBonusMarks(figure: string, bonuses: CombatBonuses, ownValue?: number, ownSets: TeammateSets = {}): FigureMark[] {
  const counted = figure in compositeLeads ? compositeLeads[figure] : [figure];
  const additions = [
    ...counted.flatMap((stat) => (leadStats as readonly string[]).includes(stat)
      ? leadReading(stat as LeadStat, bonuses) : []),
    ...counted.flatMap((stat) => teamSetReadings(stat, bonuses, ownSets)),
    counted.includes('criRate') && bonuses.alwaysCrits ? 'Guaranteed crits' : undefined,
    counted.includes('criRate') && bonuses.alwaysElementAdvantage ? `Element advantage (+${elementAdvantageLift}% ${statLabels.criRate})` : undefined,
  ].filter(Boolean).join('; ');
  const reading = figure === 'acc' || figure === 'res'
    ? pointBonusReading(figure, bonuses, ownValue, ownSets)
    : additions ? `${figure in compositeLeads ? 'Calculated with' : 'Added to the shown value in battle:'} ${additions}.` : '';
  return reading === '' ? [] : [{ key: 'combat-bonuses', tone: 'green', reading, glyph: 'info' }];
}

function teamSetReadings(figure: string, bonuses: CombatBonuses, ownSets: TeammateSets): string[] {
  return teamSetBonuses.flatMap((set) => {
    const count = (ownSets[set.name] ?? 0) + (bonuses.teammateSets?.[set.name] ?? 0);
    return count && set.stat === figure ? [`${count} ${set.name} set${count === 1 ? '' : 's'} (+${count * set.value}% ${set.stat === 'acc' || set.stat === 'res' ? '' : 'base '}${statLabels[set.stat as StatKey]})`] : [];
  });
}

function leadReading(stat: LeadStat, bonuses: CombatBonuses): string[] {
  const lead = bonuses.leads?.[stat];
  return lead ? [`${leadWords[stat].name} (+${lead}% ${stat === 'criRate' ? '' : 'base '}${leadWords[stat].stat})`] : [];
}

function pointBonusReading(figure: 'acc' | 'res', bonuses: CombatBonuses, ownValue: number | undefined, ownSets: TeammateSets): string {
  const teammateBonus = combatStatBonus(figure, bonuses);
  const ownBonus = combatStatBonus(figure, { ...bonuses, teammateSets: ownSets });
  const bonus = ownBonus + teammateBonus;
  if (bonus === 0) return '';
  const value = ownValue === undefined ? '' : ` Battle total: ${Math.min(percentStatCap, ownValue + bonus)}% ${statLabels[figure]}.`;
  return `Added to the shown value in battle: ${teamSetReadings(figure, bonuses, ownSets).join('; ')}.${value}`;
}

/** Whose wish it was stays in the sentence, so a user choice and a population default make different claims. */
function describeShortfall(shortfall: Shortfall, general: GeneralSettings): string {
  const whose = shortfall.source === 'user' ? 'Your target' : 'Common target';
  const where = shortfall.where === undefined ? '' : `${shortfall.where}: `;

  if (shortfall.kind === 'stat' && shortfall.target !== undefined && shortfall.current !== undefined) {
    return `${where}${whose}: ${shortfall.wanted} ${shortfall.over ? '≤' : '≥'} ${formatNumber(shortfall.target, general)};`
      + ` current: ${formatNumber(shortfall.current, general)}.`;
  }
  if (shortfall.present === undefined) {
    return `${where}${whose}: ${shortfall.wanted}; current: none.`;
  }
  return `${where}${whose}: ${shortfall.wanted}; current: ${shortfall.present}.`;
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
  runes: 'runes',
  statistics: 'rune statistics',
};

const pieceWords: Readonly<Record<GearKind, string>> = { artifact: 'artifacts', relic: 'relic' };

function adviceWords(advice: GearMainAdvice): string {
  const byWorth = [...artifactMainPropertyOrder].sort((left, right) => advice.worth[right] - advice.worth[left]);
  const preferred = byWorth.filter((stat) => advice.bands[stat] === 'preferred');
  const acceptable = byWorth.filter((stat) => advice.bands[stat] === 'acceptable');
  return `${preferred.join(' or ')}${acceptable.length === 0 ? '' : ` (also ${acceptable.join(' or ')})`}`;
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
      reading: 'Choose at least one preferred main stat. Using suggested mains for now.',
      glyph: 'ring',
    }];
  }
  const stated = honouredMainStat(preferences);
  if (stated === undefined || advice === undefined) return [];
  const pieces = (['artifact', 'relic'] as const).filter((kind) => contradictsAdvice(stated, advice[kind]));
  if (pieces.length === 0) return [];
  const same = pieces.length === 2 && adviceWords(advice.artifact) === adviceWords(advice.relic);
  const answers = same
    ? `artifacts and relic ${adviceWords(advice.artifact)}`
    : pieces.map((kind) => `${pieceWords[kind]} ${adviceWords(advice[kind])}`).join('; ');
  const reading = `Suggested mains from ${basisWords[advice.basis]}: ${answers}.`;
  return [{ key: 'main-stat-advice', tone: 'yellow', reading, glyph: 'info' }];
}

/**
 * A monster's runes or artifacts that another team of its pool holds too
 * (`DECK-PRESETS.md` §4). The game lets the overlap be saved and fields each
 * item on one team only, so it is a fault of every team involved.
 */
export function sharedInPoolMarks(shared: number, what: 'runes' | 'artifacts'): FigureMark[] {
  if (shared === 0) return [];
  const reading = `${shared} ${shared === 1 ? what.slice(0, -1) : what} shared with another team.`;
  return [{ key: 'shared-in-pool', tone: 'red', reading, glyph: 'ring' }];
}

/**
 * A sell verdict on a rune that is engraved somewhere. Selling it empties its
 * slot in every place it is engraved — Scenario and each preset that saves it
 * (`DECK-PRESETS.md` §1, rule 9) — which the verdict alone does not say.
 */
export function engravedSaleMarks(verdict: string, places: number): FigureMark[] {
  if (verdict !== 'sell' || places === 0) return [];
  const reading = places === 1 ? 'Engraved: selling it empties that slot.'
    : `Engraved in ${places} places: selling it empties a slot in each.`;
  return [{ key: 'engraved-sale', tone: 'red', reading, glyph: 'ring' }];
}
