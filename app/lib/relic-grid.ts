import { relicMaximumLevel, relicPropertyLabel } from './relic-properties';
import type { Relic } from './relics';
import type { RelicSynergy } from './relic-synergy';
import { compareRelicSynergy } from './relic-synergy';
import type { RelicAdvice, RelicVerdict } from './relic-advice';
import { relicVerdictOrder } from './relic-advice';

export type RelicSortKey =
  | 'index' | 'unique' | 'main' | 'synergy' | 'level' | 'durability' | 'outlook' | 'engraved' | 'advice';

/**
 * Whether a relic's level can still move, and why not when it cannot.
 *
 * The distinction is the whole point of the column. A `+4` with attempts left
 * is a relic nobody has got round to; a `+4` with none is a relic that will be
 * `+4` for ever, and the two ask for opposite decisions from a reader who can
 * only see the number.
 */
export type RelicLevelState = 'open' | 'spent' | 'maxed';

export function relicLevelState(relic: Relic): RelicLevelState {
  if (relic.level >= relicMaximumLevel) return 'maxed';
  return relic.durability > 0 ? 'open' : 'spent';
}

export type RelicRow = {
  relic: Relic;
  index: number;
  synergy: RelicSynergy | null;
  advice: RelicAdvice;
  levelState: RelicLevelState;
  /** How many monsters the relic is engraved on. */
  engraved: number;
};

/**
 * The unique property as one readable line.
 *
 * The two numbers come from the relic's own record and are always true. The
 * words around them come from the vocabulary and appear only for a family
 * somebody has read off the game panel, so an unnamed family states what it
 * grants per threshold and stops there rather than inventing a stat to name
 * (`ARTIFACT-CANONICAL.md` §14).
 */
export function relicEffectText(relic: Relic, format: (value: number) => string): string {
  const { definition, threshold, percent } = relic.unique;
  const amount = `${definition.effect?.reduces ? '−' : '+'}${format(percent)} %`;
  if (!definition.effect) return `${amount} per ${format(threshold)}`;
  return `${definition.effect.grants} ${amount} per ${format(threshold)} ${definition.effect.per}`;
}

/** Highest verdict first: Power up, then Keep, then Sell. */
function verdictRank(verdict: RelicVerdict): number {
  return relicVerdictOrder.indexOf(verdict);
}

/**
 * Which way a column points when it is first clicked. The useful end of a
 * ranking is what a heading should open on, and for every column here that is
 * the end the user is looking for — the best fit, the highest level, the most
 * room left — so only the two identity columns start at their first entry.
 */
export const defaultRelicSortDirections: Record<RelicSortKey, boolean> = {
  index: true, unique: true, main: true,
  synergy: false, level: false, durability: false, outlook: false, engraved: false, advice: true,
};

const mainOrder = { HP: 0, ATK: 1, DEF: 2 } as const;

/**
 * Every comparison here is written ascending, which is the one direction
 * `useSortedRows` accepts: the hook reverses it for the descending pass, and a
 * comparison that reversed itself would cancel that out and open the column at
 * its useless end. Which end a column *opens* on is stated separately, in
 * `defaultRelicSortDirections`.
 */
export function compareRelicRows(left: RelicRow, right: RelicRow, key: RelicSortKey): number {
  switch (key) {
    case 'index':
      return left.index - right.index;
    case 'unique':
      /* By family, then by the strength of the line inside it: the two numbers
         only mean the same thing within one family, so they order a family's
         own copies and never rank one family against another. */
      return left.relic.unique.definition.id - right.relic.unique.definition.id
        || left.relic.unique.percent - right.relic.unique.percent
        || right.relic.unique.threshold - left.relic.unique.threshold;
    case 'main':
      return mainOrder[left.relic.mainProperty] - mainOrder[right.relic.mainProperty];
    case 'synergy':
      return compareRelicSynergy(left.synergy, right.synergy);
    case 'level':
      return left.relic.level - right.relic.level;
    case 'durability':
      return left.relic.durability - right.relic.durability;
    case 'outlook':
      return left.advice.expectedLevel - right.advice.expectedLevel;
    case 'engraved':
      return left.engraved - right.engraved;
    case 'advice':
      /* Power up, Keep, Sell is the order the verdicts are declared in, and the
         ascending pass follows it. */
      return verdictRank(left.advice.verdict) - verdictRank(right.advice.verdict);
    default:
      return 0;
  }
}

/** What a row answers to in the search field. */
export function relicSearchText(row: RelicRow, format: (value: number) => string): string {
  return [
    relicPropertyLabel(row.relic.unique.definition),
    row.relic.mainProperty,
    relicEffectText(row.relic, format),
    row.advice.reason,
  ].join(' ').toLowerCase();
}
