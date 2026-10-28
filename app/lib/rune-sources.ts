import { higherPriorityThan } from './monster-priority';
import type { MonsterPriority } from './monster-priority';
import type { Preset } from './presets';
import { runeLockOf } from './rune-locks';
import type { RuneLocks } from './rune-locks';
import type { RuneOptimizationSettings } from './rune-optimization-settings';

/**
 * **Whose runes one monster may take — the one rule.** Every question of which
 * engraved rune a monster of a preset may move onto itself is answered here,
 * and nowhere else: Rune Optimization's search and its re-reading of a found
 * build read the answer, and the page's switches only feed it
 * (`docs/RUNE-OPTIMIZATION.md` §3, `docs/DECK-PRESETS.md` §4).
 *
 * - **Its own runes** are its own, unless another deck of its pool holds one too.
 * - **A rune on another monster of its team** may be taken from a monster below
 *   it on the team's priority list; from one above it only with *Include runes
 *   from higher-priority monsters*.
 * - **A rune another deck of its pool holds** — any other team of a team pool
 *   such as World Guild Battle, any deck of another phase of Dimension Raid — is
 *   never ranked against this team: it may be taken only with *Include runes
 *   from higher-priority monsters*, and an engrave then takes it off that deck.
 *   That holds for a rune this monster carries as well: an overlap the game let
 *   be saved is the other deck's as much as this one's.
 * - ***Only runes not engraved in preset*** takes none of the two, and leaves
 *   *Include* nothing to decide.
 * - **A rune locked** to a monster of another deck of the pool stays there,
 *   whatever the switches say: a lock is the user's own word. Locks inside this
 *   team reach the search on their own (`runeLocksFor`).
 */
export type RuneSourceSettings = Pick<RuneOptimizationSettings, 'runesOnOtherMonsters' | 'includeHigherPriority'>;

/**
 * Whether *Include runes from higher-priority monsters* has anything to decide:
 * not in Scenario, which is no team, and not while only runes engraved on no
 * monster are taken. The page disables the switch exactly where this is false.
 */
export function includeHigherPriorityApplies(preset: Pick<Preset, 'kind'>, settings: Pick<RuneSourceSettings, 'runesOnOtherMonsters'>): boolean {
  return preset.kind !== 'scenario' && settings.runesOnOtherMonsters;
}

/**
 * Every engraved rune `unitId` may not take, by rune, with the copy holding it —
 * in this team, or in another deck of its pool — so a dimmed build can say whose
 * rune it would have taken.
 */
export function withheldRunes(
  preset: Pick<Preset, 'kind' | 'runeOwner' | 'poolRunes'>, unitId: string, priority: MonsterPriority,
  settings: RuneSourceSettings, locks: RuneLocks,
): Record<string, string> {
  const include = includeHigherPriorityApplies(preset, settings) && settings.includeHigherPriority;
  const above = new Set(higherPriorityThan(priority, unitId));
  const withheld: Record<string, string> = {};
  for (const [runeId, owner] of preset.runeOwner) {
    if (owner === unitId) continue;
    if (!settings.runesOnOtherMonsters || (!include && above.has(owner))) withheld[runeId] = owner;
  }
  for (const [runeId, holders] of preset.poolRunes) {
    /* No exception for a rune this monster carries here too: the game let the
       overlap be saved but fields neither team with it, so keeping it is no
       answer either. Taken like any other deck's rune, an engrave settles it. */
    const locked = holders.find((holder) => runeLockOf(locks, holder.presetId, holder.unitId, runeId) === 'locked');
    if (locked) withheld[runeId] = locked.unitId;
    else if (!include) withheld[runeId] ??= holders[0].unitId;
  }
  return withheld;
}
