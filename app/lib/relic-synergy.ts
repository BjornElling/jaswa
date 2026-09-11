import { relicProperty } from './relic-properties';
import type { RelicMainProperty } from './relic-properties';

/**
 * How attractive a relic's main-property and unique-property pair is as an
 * account-wide investment.
 *
 * **This is a table, and nothing but a table.** Forty-eight cells, written
 * down, hand-editable one at a time. `docs/RELIC-CANONICAL.md` §5 states the
 * reasoning each cell was first filled in from, and §5.2 records why an earlier
 * version measured this from the player base instead and why that was wrong:
 * relics are new, most accounts engrave whatever they happened to craft, so
 * what the engraving statistics describe is the drop rate and not a judgement.
 * A table can be argued with and corrected; a measurement of luck cannot.
 */

export type RelicSynergyBand = 'exceptional' | 'strong' | 'neutral' | 'weak' | 'poor';

/**
 * The table, by unique-property id, in the order
 * `docs/RELIC-CANONICAL.md` §4 numbers them.
 *
 * Each cell is one final judgement, not a mechanical sub-score. It combines
 * the property's practical effect, the natural fit of the two stats, and the
 * breadth of monsters likely to want it. Direct stat scaling is evidence, not
 * the rule that decides the verdict: a technically neat pair can still be too
 * narrow to spend scarce stones on.
 *
 * **Edit a cell here when a better judgement is to hand.** Nothing derives this
 * and nothing regenerates it; `npm run verify:relic-synergy` only checks that
 * it stays complete and that no band falls out of use.
 */
const synergyTable: Record<number, Record<RelicMainProperty, RelicSynergyBand>> = {
  /* Sharp Conquest — DMG dealt per ATK */
  1: { HP: 'strong', ATK: 'exceptional', DEF: 'neutral' },
  /* Solid Conquest — DMG dealt per DEF */
  2: { HP: 'poor', ATK: 'poor', DEF: 'neutral' },
  /* Hearty Conquest — DMG dealt per MAX HP */
  3: { HP: 'strong', ATK: 'weak', DEF: 'weak' },
  /* Sharp Resolute — DMG taken per ATK */
  4: { HP: 'poor', ATK: 'weak', DEF: 'poor' },
  /* Solid Resolute — DMG taken per DEF */
  5: { HP: 'poor', ATK: 'poor', DEF: 'weak' },
  /* Hearty Resolute — DMG taken per MAX HP */
  6: { HP: 'strong', ATK: 'poor', DEF: 'neutral' },
  /* Nimble Valiant — ATK per SPD */
  7: { HP: 'strong', ATK: 'exceptional', DEF: 'neutral' },
  /* Solid Valiant — ATK per DEF */
  8: { HP: 'weak', ATK: 'neutral', DEF: 'neutral' },
  /* Hearty Valiant — ATK per MAX HP */
  9: { HP: 'neutral', ATK: 'neutral', DEF: 'weak' },
  /* Sharp Timeless — DEF per ATK */
  10: { HP: 'weak', ATK: 'weak', DEF: 'weak' },
  /* Nimble Timeless — DEF per SPD */
  11: { HP: 'neutral', ATK: 'weak', DEF: 'strong' },
  /* Hearty Timeless — DEF per MAX HP */
  12: { HP: 'strong', ATK: 'weak', DEF: 'strong' },
  /* Sharp Primal — MAX HP per ATK */
  13: { HP: 'neutral', ATK: 'neutral', DEF: 'weak' },
  /* Nimble Primal — MAX HP per SPD */
  14: { HP: 'exceptional', ATK: 'strong', DEF: 'strong' },
  /* Solid Primal — MAX HP per DEF */
  15: { HP: 'strong', ATK: 'weak', DEF: 'strong' },
  /* Hearty Restore — Recovery & Shield per MAX HP */
  16: { HP: 'neutral', ATK: 'poor', DEF: 'poor' },
};

/**
 * The fit of one main property with one unique property.
 *
 * Always answers, because the table covers every pair the game can produce and
 * the verifier holds it to that. An id the vocabulary does not know is not a
 * relic JASWA can read at all, and `readRelic` has already rejected it.
 */
export function relicSynergy(main: RelicMainProperty, propertyId: number): RelicSynergyBand {
  return synergyTable[propertyId]?.[main] ?? 'neutral';
}

export const relicSynergyBandOrder: readonly RelicSynergyBand[] = [
  'exceptional', 'strong', 'neutral', 'weak', 'poor',
];

export const relicSynergyBandLabels: Record<RelicSynergyBand, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  neutral: 'Neutral',
  weak: 'Weak',
  poor: 'Poor',
};

/**
 * Ascending, weakest fit first, which is the direction `useSortedRows` expects
 * a comparison to be written in — the table reverses it for the descending pass
 * the column opens on.
 */
export function compareRelicSynergy(left: RelicSynergyBand, right: RelicSynergyBand): number {
  return relicSynergyBandOrder.indexOf(right) - relicSynergyBandOrder.indexOf(left);
}

/** Every cell, for the verifier and for anything that wants to print the table. */
export function relicSynergyTable(): ReadonlyArray<{
  propertyId: number; main: RelicMainProperty; band: RelicSynergyBand;
}> {
  const cells = [];
  for (const [id, row] of Object.entries(synergyTable)) {
    for (const [main, band] of Object.entries(row)) {
      cells.push({ propertyId: Number(id), main: main as RelicMainProperty, band });
    }
  }
  return cells;
}

/** Whether the table holds a row for a property the vocabulary declares. */
export function hasRelicSynergyRow(propertyId: number): boolean {
  return relicProperty(propertyId) !== undefined && synergyTable[propertyId] !== undefined;
}
