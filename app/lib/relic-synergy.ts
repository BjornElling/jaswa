import { relicProperty } from './relic-properties';
import type { RelicMainProperty } from './relic-properties';

/**
 * How well a relic's main property and its unique property go together.
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
 * The reasoning behind a row is always the same three questions, and §5.1 sets
 * them out: does the main property raise the stat the unique property *reads*
 * (which multiplies the relic's own output), does it raise the stat the relic
 * *grants* (which merely adds to it), and does the relic push the monster the
 * way its main property already points.
 *
 * **Edit a cell here when a better judgement is to hand.** Nothing derives this
 * and nothing regenerates it; `npm run verify:relic-synergy` only checks that
 * it stays complete and that no band falls out of use.
 */
const synergyTable: Record<number, Record<RelicMainProperty, RelicSynergyBand>> = {
  /* Sharp Conquest — DMG dealt per ATK */
  1: { HP: 'poor', ATK: 'exceptional', DEF: 'poor' },
  /* Solid Conquest — DMG dealt per DEF */
  2: { HP: 'poor', ATK: 'neutral', DEF: 'strong' },
  /* Hearty Conquest — DMG dealt per MAX HP */
  3: { HP: 'strong', ATK: 'neutral', DEF: 'poor' },
  /* Sharp Resolute — DMG taken per ATK */
  4: { HP: 'neutral', ATK: 'strong', DEF: 'neutral' },
  /* Solid Resolute — DMG taken per DEF */
  5: { HP: 'neutral', ATK: 'poor', DEF: 'exceptional' },
  /* Hearty Resolute — DMG taken per MAX HP */
  6: { HP: 'exceptional', ATK: 'poor', DEF: 'neutral' },
  /* Nimble Valiant — ATK per SPD */
  7: { HP: 'weak', ATK: 'exceptional', DEF: 'weak' },
  /* Solid Valiant — ATK per DEF */
  8: { HP: 'poor', ATK: 'strong', DEF: 'strong' },
  /* Hearty Valiant — ATK per MAX HP */
  9: { HP: 'strong', ATK: 'strong', DEF: 'poor' },
  /* Sharp Timeless — DEF per ATK */
  10: { HP: 'neutral', ATK: 'strong', DEF: 'strong' },
  /* Nimble Timeless — DEF per SPD */
  11: { HP: 'neutral', ATK: 'weak', DEF: 'exceptional' },
  /* Hearty Timeless — DEF per MAX HP */
  12: { HP: 'exceptional', ATK: 'poor', DEF: 'strong' },
  /* Sharp Primal — MAX HP per ATK */
  13: { HP: 'strong', ATK: 'strong', DEF: 'neutral' },
  /* Nimble Primal — MAX HP per SPD */
  14: { HP: 'exceptional', ATK: 'weak', DEF: 'neutral' },
  /* Solid Primal — MAX HP per DEF */
  15: { HP: 'strong', ATK: 'poor', DEF: 'exceptional' },
  /* Hearty Restore — Recovery & Shield per MAX HP */
  16: { HP: 'exceptional', ATK: 'poor', DEF: 'neutral' },
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
