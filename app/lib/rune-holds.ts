import { isRecord } from './preference-reading';
import type { RuneVerdict } from './rune-cleanup-advice';
import type { Rune } from './runes';

/**
 * **The runes the user has taken out of Rune Clean-up's hands.**
 *
 * Keyed by `rune_id`, the game's own persistent identifier, so a choice made
 * once survives every later import and every live sync from the helper. It is
 * the user's statement, not the account's: nothing an import carries sets,
 * clears or moves it, and a rune the next import no longer holds simply has
 * no row to engrave it on.
 *
 * Both choices override the advice the same way a Keep does — a filter for
 * Keep shows them — and differ only in the word, so the table says which runes
 * the engine kept and which the user did.
 */
export type RuneHold = {
  /** Never to be sold, whatever the engine reads it as. */
  unsellable?: true;
  /** Staying on the monster it is on. Only an engraved rune can be locked, but a
      lock is kept when the rune leaves: the next sync must not undo it. */
  locked?: true;
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

export function runeHoldVerdict(hold: RuneHold | undefined): RuneHoldVerdict | null {
  if (hold?.locked) return 'locked';
  if (hold?.unsellable) return 'unsellable';
  return null;
}

/** What a filter reads: a held rune is a kept one, whatever the engine said. */
export const filteredRuneVerdict = (verdict: ShownRuneVerdict): RuneVerdict =>
  verdict === 'locked' || verdict === 'unsellable' ? 'keep' : verdict;

/** Whether the lock can be put on: only an engraved rune has a monster to be locked to. */
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
    const hold: RuneHold = {};
    if (stored.unsellable === true) hold.unsellable = true;
    if (stored.locked === true) hold.locked = true;
    if (runeHoldVerdict(hold) !== null) read[runeId] = hold;
  }
  return read;
}
