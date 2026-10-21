import { presetContent } from './preset-contents';
import type { PresetContentId } from './preset-contents';
import { isDungeonId, speedContent } from './speed-contents';
import type { DungeonId } from './speed-contents';

/** One ceiling, in percent, and the part of the area it holds for where the area has several. */
export type AccuracyCeiling = { part?: string; percent: number };

/**
 * The chance a harmful effect is resisted never falls below 15 %, however far
 * Accuracy outruns Resistance (Fandom, *Guide: Accuracy and Resistance*: "the
 * Rate of Resistance cannot go below 15%"). Every reading of useful accuracy
 * takes the floor from here.
 */
export const resistanceFloorPercent = 15;

/** Resistance and Accuracy stop at 100 %, as CRI Rate does (`criticalRateCapPercent`). */
export const percentStatCap = 100;

/** The most Accuracy that still does anything against enemies whose highest Resistance is this. */
function againstResistance(highest: number): number {
  return Math.max(0, highest - resistanceFloorPercent);
}

/** The most accuracy, in per cent, any monster can put to use on a dungeon floor of the speed snapshot. */
export function usefulAccuracy(id: DungeonId): number {
  return againstResistance(Math.max(...speedContent(id).stages.flatMap((stage) => stage.resists)));
}

/**
 * The most Accuracy that still does anything in an area: the most resistant
 * enemy's Resistance, less the floor above.
 *
 * Against players — whose Resistance is whatever their runes give, up to the
 * cap — that is the cap less the floor. Against the game's own enemies it is
 * read from their stats wherever a source gives them, and an area whose enemies
 * no source covers names none rather than a guessed figure.
 */
const player: readonly AccuracyCeiling[] = [{ percent: againstResistance(percentStatCap) }];

/*
 * The Dimension Hole dungeons at level 5, the highest, from Swarfarm's enemy
 * data (`swarfarm.com/api/v2/levels/`, read October 21, 2026): every enemy of
 * Sanctuary of Dreaming Fairies and Castle of Forgotten Heroes resists 50 % at
 * most, of the other three 49 %. Swarfarm has no enemies for Hellground of
 * Raging Fires, which names none.
 */
const dimensionHoleResistance: Partial<Readonly<Record<PresetContentId, number>>> = {
  'dreaming-fairies': 50, 'forgotten-heroes': 50, 'roaring-beasts': 49, 'tough-beast-men': 49, 'silent-death': 49,
};

const stated: Partial<Readonly<Record<PresetContentId, readonly AccuracyCeiling[]>>> = {
  'arena-attack': player, 'arena-defense': player, 'interserver-defense': player,
  'siege': player, 'siege-defense': player, 'world-guild': player, 'world-guild-defense': player,
  /* One deck serves every difficulty, and Hell's floors resist more than the
     other two, so the area names both rather than one figure that is wrong for
     half of it. The elemental towers and the Spires are not covered by either.
     Normal and Hard: Fandom, *Trial of Ascension* (read October 21, 2026): "The
     accuracy required is 45% for both toa and toah". **Modelled:** Hell's 55 is
     community guidance no source found states, and Swarfarm has no Trial
     enemies to derive it from as `usefulAccuracy` does for a Cairos floor. */
  /* Normal shares Hard's figure and asks no more of a team built for Hard, so
     the two parts are named for the harder of each, short enough for one line. */
  'trial-of-ascension': [{ part: 'Hard', percent: 45 }, { part: 'Hell', percent: 55 }],
  /* Swarfarm has no enemies for the Rift. The R5 boss resists 30 % (Theria
     Games, *Summoners War Chaos Beast Guide*), so 15 % — the r/summonerswar
     FAQ's own figure: "PvE accuracy requirements: 0% Rifts, 15% R5". The Rift
     beasts take the same FAQ's 0 %. */
  'rift-raid': [{ part: 'R5', percent: againstResistance(30) }],
  'ice-beast': [{ percent: 0 }], 'fire-beast': [{ percent: 0 }], 'wind-beast': [{ percent: 0 }],
  'light-beast': [{ percent: 0 }], 'dark-beast': [{ percent: 0 }],
};

/** Whether the area's enemies are players, whose stats are whatever their runes give. */
export function facesPlayers(content: PresetContentId): boolean {
  return stated[content] === player;
}

/**
 * The area's ceilings, or none where no source covers its enemies. A Cairos
 * dungeon's is its Speed Tuning floor's, read from the same snapshot, so the
 * overlay and Speed Tuning cannot name two figures for one dungeon.
 */
export function accuracyCeilings(content: PresetContentId | undefined): readonly AccuracyCeiling[] {
  if (content === undefined) return [];
  const own = stated[content];
  if (own !== undefined) return own;
  const speed = presetContent(content).speed;
  if (isDungeonId(speed)) {
    const floor = speedContent(speed).floorName;
    return [{ ...(floor === null ? {} : { part: floor }), percent: usefulAccuracy(speed) }];
  }
  const resistance = dimensionHoleResistance[content];
  return resistance === undefined ? [] : [{ part: 'Level 5', percent: againstResistance(resistance) }];
}
