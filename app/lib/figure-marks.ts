import { artifactMainPropertyOrder } from './artifact-properties';
import type { GearKind, GearMainAdvice, MainStatAdvice, MainStatBasis } from './main-stat-model';
import { contradictsAdvice, honouredMainStat, mainStatStatement } from './main-stat-model';
import type { MonsterCopyPreferences } from './monster-preferences';
import type { Shortfall } from './monster-shortfall';
import type { CombatBonuses, LedStat, StatFigure, TeammateSets } from './monster-stats';
import { alwaysCritsFloor, elementAdvantageLift, teamSetBonuses } from './monster-stats';
import { statLabels } from './stat-labels';
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

const leadNames: Readonly<Record<LedStat, string>> = {
  atk: `${statLabels.atk} lead`, def: `${statLabels.def} lead`, hp: `${statLabels.hp} lead`, spd: `${statLabels.spd} lead`,
  criRate: 'Crit lead', criDmg: `${statLabels.criDmg} lead`, acc: `${statLabels.acc} lead`, res: `${statLabels.res} lead`,
};

/* A building's name by the stat it raises; a Sanctuary is named by its element. */
const buildingNames: Readonly<Record<'hp' | 'atk' | 'def' | 'spd' | 'criDmg', string>> = {
  hp: 'Crystal Altar', atk: 'Ancient Sword', def: 'Guardstone', spd: 'Sky Tribe Totem', criDmg: 'Fallen Ancient Guardian',
};

/* The stats a source raises by a share of base; every other one by points. */
const baseShareStats: ReadonlySet<StatFigure> = new Set(['hp', 'atk', 'def', 'spd']);

/**
 * What the fight adds to one stat, as a page shows it after the panel's figure:
 * `amount` is the fight's figure less the panel's, and `raisedTo` the CRI Rate a
 * guaranteed crit lifts the fight's to, which is said instead of an amount. The
 * reading names every source — a lead, the team sets the copy and its teammates
 * complete, a building, the totem, element advantage — one sentence each, in
 * the share of base or the points the game states it in. A stat nothing reaches
 * has an amount of 0 and no reading.
 */
export type FightAddition = { amount: number; raisedTo: number | null; reading: string };

export function fightAddition(stat: StatFigure, display: number, figure: number, bonuses: CombatBonuses,
  ownSets: TeammateSets, element: string | undefined): FightAddition {
  const share = baseShareStats.has(stat) ? ` of base ${statLabels[stat]}` : '';
  const percent = (value: number) => `+${value}%${share}`;
  const lead = bonuses.leads?.[stat];
  const sets = teamSetBonuses.flatMap((set) => {
    const count = (ownSets[set.name] ?? 0) + (bonuses.teammateSets?.[set.name] ?? 0);
    return count > 0 && set.stat === stat ? [`${count} × ${set.name} ${percent(count * set.value)}`] : [];
  });
  const buildings = bonuses.buildings;
  const building = buildings !== undefined && stat in buildingNames
    ? buildings[stat as keyof typeof buildingNames] : 0;
  const sanctuary = buildings !== undefined && stat === 'atk' && element !== undefined ? buildings.elementAtk[element] ?? 0 : 0;
  const lifted = stat === 'criRate' && bonuses.alwaysCrits;
  const parts = [
    lead ? `${leadNames[stat]} ${percent(lead)}` : '',
    ...sets,
    building ? `${buildingNames[stat as keyof typeof buildingNames]} ${percent(building)}` : '',
    sanctuary ? `${element} Sanctuary ${percent(sanctuary)}` : '',
    stat === 'criRate' && bonuses.alwaysElementAdvantage ? `Element advantage ${percent(elementAdvantageLift)}` : '',
    lifted ? `Always crits: at least ${alwaysCritsFloor}%` : '',
  ].filter((part) => part !== '');
  return { amount: figure - display, raisedTo: lifted ? figure : null, reading: parts.map((part) => `${part}.`).join(' ') };
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
 * A reserved rune or artifact that another team of its pool holds too
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
