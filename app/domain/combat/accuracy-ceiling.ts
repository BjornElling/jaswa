import type { PresetContentId } from '../placements/preset-contents';
import { hardestPveFloor, highestResistanceOn, pveAreaOf } from '../reference/pve-stages';
import type { DungeonId } from '../speed/speed-contents';
import { percentStatCap, resistanceFloorPercent } from './combat-stat-limits';
export { percentStatCap, resistanceFloorPercent } from './combat-stat-limits';

/** One ceiling, in percent, and the part of the area it holds for where the area has several. */
export type AccuracyCeiling = { part?: string; percent: number };

/** The most Accuracy that still does anything against enemies whose highest Resistance is this. */
function againstResistance(highest: number): number {
  return Math.max(0, highest - resistanceFloorPercent);
}

/** The most Accuracy, in percent, any monster can put to use on the floor a Cairos dungeon is tuned for. */
export function usefulAccuracy(id: DungeonId): number {
  const floor = hardestPveFloor(id);
  const resistance = floor === undefined ? undefined : highestResistanceOn(floor);
  if (resistance === undefined) throw new Error(`The PvE database's ${id} floor has no stated Resistance.`);
  return againstResistance(resistance);
}

/**
 * The most Accuracy that still does anything in an area: the most resistant
 * enemy's Resistance, less the floor above.
 *
 * Against players — whose Resistance is whatever their runes give, up to the
 * cap — that is the cap less the floor. Against the game's own enemies it is
 * read from the PvE database wherever it has the area, and from a stated
 * figure where it does not; an area whose enemies no source covers names none
 * rather than a guessed figure.
 */
const player: readonly AccuracyCeiling[] = [{ percent: againstResistance(percentStatCap) }];

const stated: Partial<Readonly<Record<PresetContentId, readonly AccuracyCeiling[]>>> = {
  'arena-attack': player, 'arena-defense': player, 'interserver-defense': player,
  'siege': player, 'siege-defense': player, 'world-guild': player, 'world-guild-defense': player,
  /* One deck serves every difficulty, and Hell's floors resist more than the
     other two, so the area names both rather than one figure that is wrong for
     half of it. Normal shares Hard's figure and asks no more of a team built
     for Hard, so the two parts are named for the harder of each, short enough
     for one line. The elemental towers and the Spires are not covered by
     either. Normal and Hard: Fandom, *Trial of Ascension* (read October 21,
     2026): "The accuracy required is 45% for both toa and toah". **Modelled:**
     Hell's 55 is community guidance no source found states, and the PvE
     database has no Trial enemies to derive it from. */
  'trial-of-ascension': [{ part: 'Hard', percent: 45 }, { part: 'Hell', percent: 55 }],
  /* The PvE database has no Rift beasts: the r/summonerswar FAQ's "PvE accuracy
     requirements: 0% Rifts, 15% R5". Its 15 % for R5 is what the database's R5
     boss gives as well. */
  'ice-beast': [{ percent: 0 }], 'fire-beast': [{ percent: 0 }], 'wind-beast': [{ percent: 0 }],
  'light-beast': [{ percent: 0 }], 'dark-beast': [{ percent: 0 }],
};

/** Whether the area's enemies are players, whose stats are whatever their runes give. */
export function facesPlayers(content: PresetContentId): boolean {
  return stated[content] === player;
}

/**
 * The area's ceilings, or none where no source covers its enemies. An area of
 * the PvE database takes its hardest floor's, named by that floor — the floor
 * Speed Tuning reads for a Cairos dungeon, so the overlay and Speed Tuning
 * cannot name two figures for one dungeon.
 */
export function accuracyCeilings(content: PresetContentId | undefined): readonly AccuracyCeiling[] {
  if (content === undefined) return [];
  const own = stated[content];
  if (own !== undefined) return own;
  const area = pveAreaOf(content);
  const floor = area === undefined ? undefined : hardestPveFloor(area);
  const resistance = floor === undefined ? undefined : highestResistanceOn(floor);
  return floor === undefined || resistance === undefined ? [] : [{ part: floor.name, percent: againstResistance(resistance) }];
}
