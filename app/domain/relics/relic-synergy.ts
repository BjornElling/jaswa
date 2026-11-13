import { relicMainPropertyOrder, relicProperties, relicProperty } from './relic-properties';
import type { RelicMainProperty } from './relic-properties';
import { isRecord } from '../profiles/preference-reading';

/**
 * How attractive a relic's main-property and unique-property pair is as an
 * account-wide investment — **the one place JASWA states it.**
 *
 * Two layers, one answer. JASWA ships a judgement for all forty-eight cells
 * (`defaultCells`); the user may overrule any of them in the synergy editor,
 * and those choices are saved as the `relicSynergy` preference. Neither layer
 * is read on its own anywhere else: every page, verdict and filter receives a
 * `RelicSynergyTable` built here by `resolveRelicSynergy`, so an edit reaches
 * every reading at once and no view can fall back on the shipped cells behind
 * the user's back. The table type is branded for that reason — only this
 * module can make one.
 *
 * `docs/RELIC-CANONICAL.md` §5 states the reasoning the shipped cells were
 * first filled in from, and §5.2 why they are not measured from the player
 * base's engraving statistics: relics are new, most accounts engrave whatever
 * they happened to craft, and so those statistics describe the drop rate rather
 * than a judgement.
 */

export type RelicSynergyBand = 'excellent' | 'good' | 'niche' | 'poor' | 'trash';

/** Best first: the order the editor cycles in and the filter lists. */
export const relicSynergyBandOrder: readonly RelicSynergyBand[] = [
  'excellent', 'good', 'niche', 'poor', 'trash',
];

export const relicSynergyBandLabels: Record<RelicSynergyBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  niche: 'Niche',
  poor: 'Poor',
  trash: 'Trash',
};

export const isRelicSynergyBand = (value: unknown): value is RelicSynergyBand =>
  relicSynergyBandOrder.includes(value as RelicSynergyBand);

type Cells = Readonly<Record<number, Readonly<Record<RelicMainProperty, RelicSynergyBand>>>>;

/**
 * The shipped judgement, by unique-property id in the order
 * `docs/RELIC-CANONICAL.md` §4 numbers them.
 *
 * Each cell is one final judgement, not a mechanical sub-score. It combines
 * the property's practical effect, the natural fit of the two stats, and the
 * breadth of monsters likely to want it. Direct stat scaling is evidence, not
 * the rule that decides the verdict: a technically neat pair can still be too
 * narrow to spend scarce stones on.
 *
 * These are starting values, as the rune roles are: a cell the user has set
 * in the editor wins over the one here, and Reset to defaults returns to these.
 */
const defaultCells: Cells = {
  /* Sharp Conquest — DMG dealt per ATK */
  1: { HP: 'good', ATK: 'excellent', DEF: 'niche' },
  /* Solid Conquest — DMG dealt per DEF */
  2: { HP: 'trash', ATK: 'trash', DEF: 'niche' },
  /* Hearty Conquest — DMG dealt per MAX HP */
  3: { HP: 'good', ATK: 'poor', DEF: 'poor' },
  /* Sharp Resolute — DMG taken per ATK */
  4: { HP: 'trash', ATK: 'poor', DEF: 'trash' },
  /* Solid Resolute — DMG taken per DEF */
  5: { HP: 'trash', ATK: 'trash', DEF: 'poor' },
  /* Hearty Resolute — DMG taken per MAX HP */
  6: { HP: 'good', ATK: 'trash', DEF: 'niche' },
  /* Nimble Valiant — ATK per SPD */
  7: { HP: 'good', ATK: 'excellent', DEF: 'niche' },
  /* Solid Valiant — ATK per DEF */
  8: { HP: 'poor', ATK: 'niche', DEF: 'niche' },
  /* Hearty Valiant — ATK per MAX HP */
  9: { HP: 'niche', ATK: 'niche', DEF: 'poor' },
  /* Sharp Timeless — DEF per ATK */
  10: { HP: 'poor', ATK: 'poor', DEF: 'poor' },
  /* Nimble Timeless — DEF per SPD */
  11: { HP: 'niche', ATK: 'poor', DEF: 'good' },
  /* Hearty Timeless — DEF per MAX HP */
  12: { HP: 'good', ATK: 'poor', DEF: 'good' },
  /* Sharp Primal — MAX HP per ATK */
  13: { HP: 'niche', ATK: 'niche', DEF: 'poor' },
  /* Nimble Primal — MAX HP per SPD */
  14: { HP: 'excellent', ATK: 'good', DEF: 'good' },
  /* Solid Primal — MAX HP per DEF */
  15: { HP: 'good', ATK: 'poor', DEF: 'good' },
  /* Hearty Restore — Recovery & Shield per MAX HP */
  16: { HP: 'niche', ATK: 'trash', DEF: 'trash' },
};

/**
 * The cells the user has set, by unique-property id and then main. Only a cell
 * that differs from the shipped one is a choice: setting a cell back to its
 * default removes it, so the record counts decisions, and a later change to the
 * shipped judgement reaches every cell the user never overruled.
 */
export type RelicSynergyChoices = Readonly<Record<string, Readonly<Partial<Record<RelicMainProperty, RelicSynergyBand>>>>>;

declare const resolvedTable: unique symbol;

/** The synergy every reading uses: the shipped cells with the user's choices on top. */
export type RelicSynergyTable = {
  readonly cells: Cells;
  readonly [resolvedTable]: true;
};

function tableOf(cells: Cells): RelicSynergyTable {
  return { cells } as RelicSynergyTable;
}

/** The shipped judgement alone: what Reset to defaults returns to. */
export const defaultRelicSynergy: RelicSynergyTable = tableOf(defaultCells);

export function resolveRelicSynergy(choices: RelicSynergyChoices): RelicSynergyTable {
  const cells: Record<number, Record<RelicMainProperty, RelicSynergyBand>> = {};
  for (const property of relicProperties) {
    const row = { ...defaultCells[property.id] };
    const chosen = choices[String(property.id)];
    for (const main of relicMainPropertyOrder) {
      const band = chosen?.[main];
      if (band !== undefined) row[main] = band;
    }
    cells[property.id] = row;
  }
  return tableOf(cells);
}

/**
 * The fit of one main property with one unique property.
 *
 * The table covers every pair the game can produce and the verifier holds it
 * to that, and `readRelic` has already rejected an id the vocabulary does not
 * know. A pair missing here is therefore a defect, and it throws rather than
 * passing as a middle band, which would judge a relic on a fit nobody wrote down.
 */
export function relicSynergy(table: RelicSynergyTable, main: RelicMainProperty, propertyId: number): RelicSynergyBand {
  const band = table.cells[propertyId]?.[main];
  if (band === undefined) throw new Error(`No synergy is recorded for ${main} on relic property ${propertyId}.`);
  return band;
}

/** One cell changed, every other kept — the editor's draft step. */
export function withRelicSynergyCell(
  table: RelicSynergyTable, propertyId: number, main: RelicMainProperty, band: RelicSynergyBand,
): RelicSynergyTable {
  return tableOf({ ...table.cells, [propertyId]: { ...table.cells[propertyId], [main]: band } });
}

/** The cells of a table that differ from the shipped ones: what is saved. */
export function relicSynergyChoices(table: RelicSynergyTable): RelicSynergyChoices {
  const choices: Record<string, Partial<Record<RelicMainProperty, RelicSynergyBand>>> = {};
  for (const property of relicProperties) {
    for (const main of relicMainPropertyOrder) {
      const band = table.cells[property.id]?.[main];
      if (band === undefined || band === defaultCells[property.id]?.[main]) continue;
      (choices[String(property.id)] ??= {})[main] = band;
    }
  }
  return choices;
}

export function isDefaultRelicSynergyCell(table: RelicSynergyTable, propertyId: number, main: RelicMainProperty): boolean {
  return table.cells[propertyId]?.[main] === defaultCells[propertyId]?.[main];
}

export function sameRelicSynergy(left: RelicSynergyTable, right: RelicSynergyTable): boolean {
  return relicProperties.every((property) => relicMainPropertyOrder.every((main) =>
    left.cells[property.id]?.[main] === right.cells[property.id]?.[main]));
}

/**
 * The stored choices, one cell at a time (`AGENTS.md` §0). A cell naming a
 * property the vocabulary does not know, a main that is not HP, ATK or DEF, or
 * a band that is not one of the five is dropped and reads its shipped value;
 * every other cell is kept. A cell equal to the shipped one is not a choice and
 * is not carried.
 */
export function readRelicSynergyChoices(value: unknown): RelicSynergyChoices {
  if (!isRecord(value)) return {};
  const choices: Record<string, Partial<Record<RelicMainProperty, RelicSynergyBand>>> = {};
  for (const [id, row] of Object.entries(value)) {
    const propertyId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || relicProperty(propertyId) === undefined || !isRecord(row)) continue;
    for (const main of relicMainPropertyOrder) {
      const band = row[main];
      if (!isRelicSynergyBand(band) || band === defaultCells[propertyId]?.[main]) continue;
      (choices[id] ??= {})[main] = band;
    }
  }
  return choices;
}

/**
 * The band a click moves a cell to: one step down the scale, Trash wrapping
 * round to Excellent, or one step up for a step of `-1`.
 */
export function cycledRelicSynergyBand(band: RelicSynergyBand, step: 1 | -1 = 1): RelicSynergyBand {
  const at = relicSynergyBandOrder.indexOf(band);
  const count = relicSynergyBandOrder.length;
  return relicSynergyBandOrder[(at + step + count) % count];
}

/**
 * Ascending, weakest fit first, which is the direction `useSortedRows` expects
 * a comparison to be written in — the table reverses it for the descending pass
 * the column opens on.
 */
export function compareRelicSynergy(left: RelicSynergyBand, right: RelicSynergyBand): number {
  return relicSynergyBandOrder.indexOf(right) - relicSynergyBandOrder.indexOf(left);
}

/** Every cell of a table, for the verifier and for anything that prints it whole. */
export function relicSynergyCells(table: RelicSynergyTable): ReadonlyArray<{
  propertyId: number; main: RelicMainProperty; band: RelicSynergyBand;
}> {
  const cells = [];
  for (const [id, row] of Object.entries(table.cells)) {
    for (const [main, band] of Object.entries(row)) {
      cells.push({ propertyId: Number(id), main: main as RelicMainProperty, band });
    }
  }
  return cells;
}

/** Whether the shipped table holds a row for a property the vocabulary declares. */
export function hasRelicSynergyRow(propertyId: number): boolean {
  return relicProperty(propertyId) !== undefined && defaultCells[propertyId] !== undefined;
}
