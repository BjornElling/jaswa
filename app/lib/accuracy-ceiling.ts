import type { PresetContentId } from './preset-contents';

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

/**
 * The most Accuracy that still does anything in an area.
 *
 * A harmful effect lands unless the target resists it, and the game always
 * leaves the target the floor above to resist with. Resistance itself stops at
 * the cap, so against players — whose Resistance is whatever their runes give,
 * up to that cap — Accuracy past the cap less the floor buys nothing. Against
 * the game's own enemies Resistance is set per stage, so an area names a figure
 * only where its most resistant enemy is known; the rest name none rather than
 * a guessed one.
 */
const player: readonly AccuracyCeiling[] = [{ percent: percentStatCap - resistanceFloorPercent }];

const ceilings: Partial<Readonly<Record<PresetContentId, readonly AccuracyCeiling[]>>> = {
  'arena-attack': player, 'arena-defense': player, 'interserver-defense': player,
  'siege': player, 'siege-defense': player, 'world-guild': player, 'world-guild-defense': player,
  /* One deck serves every difficulty, and Hell's floors resist more than the
     other two, so the area names both rather than one figure that is wrong for
     half of it. The elemental towers and the Spires are not covered by either.
     **Modelled:** 45 and 55 are common community guidance; no source found on
     October 19, 2026 states either figure, and JASWA has no Trial enemy data to
     derive them from as `usefulAccuracy` does for a Cairos floor. */
  'trial-of-ascension': [{ part: 'Normal/Hard', percent: 45 }, { part: 'Hell', percent: 55 }],
};

/** The area's ceilings, or none where its enemies set no known one. */
export function accuracyCeilings(content: PresetContentId | undefined): readonly AccuracyCeiling[] {
  return (content === undefined ? undefined : ceilings[content]) ?? [];
}
