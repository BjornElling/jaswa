/**
 * **A Rune Clean-up table, kept up with the account rune by rune.**
 *
 * The table answers for every rune, and the player reads it by going into the
 * game and acting on it: selling, powering up, putting on a Gem, grinding a line —
 * one rune at a time or a whole box at once. A sync that brings that work back
 * should not cost a whole recalculation, and it must not reshuffle the list the
 * player was working down. So the held answer is kept and only the runes that
 * changed are judged again:
 *
 * - a rune whose every advised-on fact is as it was keeps its answer, and is shown
 *   as it now is — moving it to another monster changes where it is, not what it is;
 * - a rune that changed — a level, a new sub property, a Gem, a Grindstone, a
 *   reappraisal — or that is new to the account is judged again, alone, against the
 *   current roles, settings and reference lines. A rune's advice depends
 *   on nothing else (`rune-advice-memory.ts`), so the answer is the one a whole
 *   recalculation would give;
 * - until that answer arrives the row keeps its old rune *and* its old advice, so a
 *   row never shows a new level beside a verdict read off the old one;
 * - a rune that has left the account — sold or fed — leaves the table. Every other
 *   row keeps its place; only the rows below close the gap, and the row that left
 *   is the one the player acted on.
 *
 * Changed standards use the same replacement path. The caller compares the
 * mathematical dependencies of each set, and sends every affected rune together;
 * committing the batch keeps both the standards and the held row order coherent.
 */
import type { RuneAdvice } from './rune-cleanup-advice';
import type { Rune } from '../runes';

/** One rune's answer, the rune as it was when answered, and its place in the table. */
export type HeldRuneAdvice = {
  rune: Rune;
  /** `runeAdviceKey(rune)`, kept so a sync compares strings rather than re-serialising every rune twice. */
  key: string;
  advice: RuneAdvice;
  /** Breaks every sort tie. A rune new to the account takes the next one, after every rune held. */
  index: number;
};

/** Everything advice reads off a rune: all of it but where it is engraved. */
export const runeAdviceKey = (rune: Rune): string => JSON.stringify({ ...rune, occupiedId: null });

/** A whole calculation's answers, in the order its runes were read. */
export function heldRuneAdvice(runes: readonly Rune[], advice: ReadonlyMap<string, RuneAdvice>): Map<string, HeldRuneAdvice> {
  const held = new Map<string, HeldRuneAdvice>();
  runes.forEach((rune, index) => {
    const answer = advice.get(rune.id);
    if (answer) held.set(rune.id, { rune, key: runeAdviceKey(rune), advice: answer, index });
  });
  return held;
}

/** The runes whose held answer no longer fits: new to the account, or changed in anything advice reads. */
export function runesToJudgeAgain(held: ReadonlyMap<string, HeldRuneAdvice>, now: readonly Rune[]): Rune[] {
  return now.filter((rune) => {
    const entry = held.get(rune.id);
    return entry === undefined || (entry.rune !== rune && entry.key !== runeAdviceKey(rune));
  });
}

/**
 * The held answers with fresh ones laid over them. A rune the answer has no entry
 * for keeps what it had, so a failed rune can never blank a row.
 */
export function withFreshAdvice(
  held: ReadonlyMap<string, HeldRuneAdvice>, runes: readonly Rune[], advice: ReadonlyMap<string, RuneAdvice>,
): Map<string, HeldRuneAdvice> {
  const next = new Map(held);
  let nextIndex = Math.max(-1, ...[...held.values()].map((entry) => entry.index)) + 1;
  for (const rune of runes) {
    const answer = advice.get(rune.id);
    if (!answer) continue;
    const index = held.get(rune.id)?.index ?? nextIndex++;
    next.set(rune.id, { rune, key: runeAdviceKey(rune), advice: answer, index });
  }
  return next;
}

/**
 * A held answer as the table shows it: the rune as it now is wherever its answer
 * still fits. A rune no longer in the account has no row: a sold rune is not
 * something the player can act on, so showing it would only be clutter.
 */
export type ShownRuneAdvice = { rune: Rune; advice: RuneAdvice; index: number };

export function shownRuneAdvice(held: ReadonlyMap<string, HeldRuneAdvice>, now: ReadonlyMap<string, Rune>): ShownRuneAdvice[] {
  return [...held.values()].flatMap((entry) => {
    const current = now.get(entry.rune.id);
    if (current === undefined) return [];
    const fits = current === entry.rune || runeAdviceKey(current) === entry.key;
    return [{ rune: fits ? current : entry.rune, advice: entry.advice, index: entry.index }];
  });
}

/**
 * The rows on screen in the order the reader last arranged them.
 *
 * `sorted` is the table as the filters and the sort would give it now; `arranged`
 * is the order taken the last time the reader touched either. A row already
 * arranged keeps its place even where a sync has changed what the sort or a filter
 * reads off it, because a row that jumps away while the reader is working down the
 * list is worse than one that no longer fits its filter. A row that is new to the
 * table goes above them all, where a new rune also lands in the game's own box.
 */
export function inArrangedOrder<T>(
  sorted: readonly T[], all: ReadonlyMap<string, T>, arranged: { ids: readonly string[]; known: ReadonlySet<string> },
  idOf: (row: T) => string,
): T[] {
  const fresh = sorted.filter((row) => !arranged.known.has(idOf(row)));
  const kept = arranged.ids.flatMap((id) => {
    const row = all.get(id);
    return row === undefined ? [] : [row];
  });
  return [...fresh, ...kept];
}
