import { isRecord } from './preference-reading';
import type { RuneVerdict } from './rune-cleanup-advice';
import type { Rune } from './runes';

/**
 * **The runes the user has taken out of Rune Clean-up's hands.**
 *
 * Unsellable is keyed by `rune_id`, the game's own persistent identifier, so a
 * choice made once survives every later import and every live sync from the
 * helper. It is the user's statement, not the account's: nothing an import
 * carries sets, clears or moves it.
 *
 * A rune locked to a monster (`rune-locks.ts`) is held the same way while the
 * lock stands. Both override the advice as a Keep does — a filter for Keep
 * shows them — and differ only in the word, so the table says which runes the
 * engine kept and which the user did.
 */
export type RuneHold = {
  /** Never to be sold, whatever the engine reads it as. */
  unsellable?: true;
};

export type RuneHolds = Record<string, RuneHold>;

/** What the user made of a rune, where Locked outranks Unsellable. */
export type RuneHoldVerdict = 'locked' | 'unsellable';

/** The advice a row shows: the engine's, or the user's own word over it. */
export type ShownRuneVerdict = RuneVerdict | RuneHoldVerdict;

export const runeHoldLabels: Record<RuneHoldVerdict, string> = {
  locked: 'Locked',
  unsellable: 'Unsellable',
};

export function runeHoldVerdict(hold: RuneHold | undefined, locked = false): RuneHoldVerdict | null {
  if (locked) return 'locked';
  if (hold?.unsellable) return 'unsellable';
  return null;
}

/** What a filter reads: a held rune is a kept one, whatever the engine said. */
export const filteredRuneVerdict = (verdict: ShownRuneVerdict): RuneVerdict =>
  verdict === 'locked' || verdict === 'unsellable' ? 'keep' : verdict;

/** Whether the rune overlay's lock can be put on: it locks a rune to its monster in Scenario, so only an engraved one. */
export const canLockRune = (rune: Rune): boolean => rune.occupiedId !== null;

/**
 * The stored map, rune by rune (`preference-reading.ts`). A choice is kept only
 * as `true`, the one form the overlay writes; a record left with nothing true
 * says nothing and is not kept.
 */
export function readRuneHolds(value: unknown): RuneHolds {
  if (!isRecord(value)) return {};
  const read: RuneHolds = {};
  for (const [runeId, stored] of Object.entries(value)) {
    if (runeId.length === 0 || !isRecord(stored)) continue;
    if (stored.unsellable === true) read[runeId] = { unsellable: true };
  }
  return read;
}
