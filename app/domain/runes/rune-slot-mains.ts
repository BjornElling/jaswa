import type { RuneMainStat } from '../profiles/rune-roles';
import { runeMainStatIds, runeMainStats } from '../profiles/rune-roles';
import { slotMainProperties } from './rune-properties';

/**
 * Every main a monster's slots 2, 4 and 6 can be asked for — the game's whole
 * list for each slot, flat mains included.
 *
 * `RuneMainStat` is the Clean-up roles' vocabulary and has no word for a flat
 * HP +, ATK + or DEF +: a role judges rune *quality*, where a flat main is
 * simply the weaker roll. A monster's owner asks something else — which main
 * this copy will have engraved — and the game offers seven or eight mains per slot, so an
 * overlay offering four or five of them was answering a narrower question than
 * the one on screen. This vocabulary is that one plus the three flat mains, and
 * it stays out of the roles so the Clean-up engine keeps its own.
 *
 * Each slot lists its mains in the order `RUNE-CANONICAL.md` §3's table reads,
 * which is the game's own.
 */
export type RuneSlotMain = RuneMainStat | 'HP+' | 'Atk+' | 'Def+';

const flatMainIds = { 'HP+': 1, 'Atk+': 3, 'Def+': 5 } as const;

const idsByMain: Readonly<Record<RuneSlotMain, number>> = { ...runeMainStatIds, ...flatMainIds };

const mainsById: ReadonlyMap<number, RuneSlotMain> = new Map(
  [...runeMainStats, ...Object.keys(flatMainIds) as RuneSlotMain[]].map((main) => [idsByMain[main], main]),
);

/** A main by the export's effect id, or `undefined` for one no slot 2, 4 or 6 can carry. */
export function runeSlotMainByEffect(effectId: number): RuneSlotMain | undefined {
  return mainsById.get(effectId);
}

/** The export's effect id for a main, so a reader can name it in `runes.ts`'s game words. */
export function runeSlotMainEffect(main: RuneSlotMain): number {
  return idsByMain[main];
}

function mainsAllowedIn(slot: number): readonly RuneSlotMain[] {
  return (slotMainProperties[slot] ?? [])
    .map((id) => mainsById.get(id))
    .filter((main): main is RuneSlotMain => main !== undefined);
}

export const runeSlotMainsBySlot: Readonly<Record<'slot2' | 'slot4' | 'slot6', readonly RuneSlotMain[]>> = {
  slot2: mainsAllowedIn(2),
  slot4: mainsAllowedIn(4),
  slot6: mainsAllowedIn(6),
};
