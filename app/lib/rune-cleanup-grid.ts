/**
 * One row of the Rune Clean-up table: what it holds, how it sorts, what a search
 * matches on.
 *
 * It holds no arithmetic. Every figure comes from `rune-cleanup-advice.ts`, which
 * gets it from `rune-cleanup-model.ts`; this only decides how a row is read and
 * ordered, which is why a change of sort can never change a number.
 */
import { ancientSearchWord, withAncientMark } from './ancient-mark';
import { runeStatName, runeSubValue } from './runes';
import type { Rune } from './runes';
import type { RuneAdvice } from './rune-cleanup-advice';
import { runeVerdictLabels } from './rune-cleanup-advice';

export type RuneCleanupRow = {
  rune: Rune;
  /** Its place in the import, which breaks every tie so a sort is stable. */
  index: number;
  advice: RuneAdvice;
  /**
   * Where the rune is: the wearer's name, `Inventory` when nothing wears it, and
   * `null` for a wearer this import does not contain — a gap in the import, which
   * must not read as an empty inventory.
   */
  location: string | null;
};

export type RuneCleanupSortKey =
  'set' | 'slot' | 'main' | 'subs' | 'level' | 'location' | 'preset' | 'maxValue' | 'chance' | 'advice';

/**
 * Which way a column opens. The two figures the page is for open at their best,
 * because the first question anyone asks a three-thousand-row table is "show me
 * the good ones"; the descriptive columns open alphabetically or lowest-first.
 */
export const defaultRuneCleanupSortDirections: Readonly<Record<RuneCleanupSortKey, boolean>> = {
  set: true, slot: true, main: true, subs: true, level: true, location: true,
  preset: true, maxValue: false, chance: false, advice: true,
};

/** The verdicts in the order they rank, so sorting by advice reads as a priority. */
const verdictRank: Readonly<Record<string, number>> = { 'power-up': 0, keep: 1, sell: 2 };

/**
 * The set as the row names it, in plain text — the sort key, the search index
 * and what a reader would read aloud.
 *
 * An Ancient rune is judged exactly as an ordinary one and shares its set's filter
 * button, but it is not the same item in the hand: it takes Ancient gems and
 * grindstones and no others (`RUNE-CANONICAL.md` §7). Two rows reading `Fatal 4
 * CtD %` where one of them cannot take the grindstone you were about to spend is a
 * row that cannot be acted on, so the distinction stays — as the mark of
 * `ancient-mark.ts` rather than as a word in front of the set, which sorted the
 * Ancient half of every set under A and away from the ordinary half.
 * `craft-item-best-use.tsx` and the gem box name them the same way.
 */
export function runeSetLabel(rune: Rune): string {
  return withAncientMark(rune.setName, rune.ancient);
}

/** The sub properties said in one breath, which is also what a search matches. */
export function runeSubText(rune: Rune): string {
  return rune.subProperties
    .map((property) => `${runeStatName(property.statId) ?? '?'} ${runeSubValue(property)}`)
    .join('  ');
}

export function compareRuneCleanupRows(
  left: RuneCleanupRow, right: RuneCleanupRow, key: RuneCleanupSortKey,
): number {
  switch (key) {
    case 'set': return runeSetLabel(left.rune).localeCompare(runeSetLabel(right.rune));
    case 'slot': return left.rune.slot - right.rune.slot;
    case 'main': return (runeStatName(left.rune.mainStatId) ?? '').localeCompare(runeStatName(right.rune.mainStatId) ?? '');
    case 'subs': return runeSubText(left.rune).localeCompare(runeSubText(right.rune));
    case 'level': return left.rune.level - right.rune.level;
    case 'location': return (left.location ?? '').localeCompare(right.location ?? '');
    case 'preset': return (left.advice.preset?.name ?? '').localeCompare(right.advice.preset?.name ?? '');
    case 'maxValue': return left.advice.maxValue - right.advice.maxValue;
    case 'chance': return left.advice.chance - right.advice.chance;
    case 'advice': return (verdictRank[left.advice.verdict] ?? 3) - (verdictRank[right.advice.verdict] ?? 3);
    default: return 0;
  }
}

/** Everything a search box should match on one row, lower-cased once. */
export function runeCleanupSearchText(row: RuneCleanupRow): string {
  return [
    runeSetLabel(row.rune),
    /* The mark no longer spells the word out, and "ancient" is what a player
       types when they want those rows. */
    row.rune.ancient ? ancientSearchWord : '',
    `slot ${row.rune.slot}`,
    `+${row.rune.level}`,
    runeStatName(row.rune.mainStatId) ?? '',
    runeSubText(row.rune),
    row.advice.preset?.name ?? '',
    runeVerdictLabels[row.advice.verdict],
    row.location ?? '',
  ].join(' ').toLowerCase();
}
