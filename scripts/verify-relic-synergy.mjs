#!/usr/bin/env node

/**
 * Proves the relic synergy table is complete and still says something
 * (`docs/RELIC-CANONICAL.md` §5).
 *
 * The table is hand-written and hand-edited — that is the point of it — so
 * nothing regenerates it and nothing can check whether a cell is *right*. What
 * can be checked is that it stays whole: every unique property the vocabulary
 * declares has a row, every row has all three main properties, every value is a
 * band, and no band has fallen out of use. A five-step scale with an empty step
 * is a four-step scale nobody meant to write.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-synergy.mjs
 */
import { relicProperties, relicMainPropertyOrder } from '../app/lib/relic-properties.ts';
import {
  hasRelicSynergyRow, relicSynergyBandOrder, relicSynergyTable,
} from '../app/lib/relic-synergy.ts';

let failures = 0;
function check(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

const cells = relicSynergyTable();
const expected = relicProperties.length * relicMainPropertyOrder.length;
check(cells.length === expected,
  `the table holds all ${expected} cells (it holds ${cells.length})`);

const missing = relicProperties.filter((property) => !hasRelicSynergyRow(property.id));
check(missing.length === 0,
  missing.length === 0
    ? 'every unique property the vocabulary declares has a row'
    : `no row for ${missing.map((property) => `${property.id} ${property.name}`).join(', ')}`);

const stray = cells.filter((cell) => !relicSynergyBandOrder.includes(cell.band));
check(stray.length === 0, 'every cell holds one of the five bands');

/* Practical account coverage can make every main equally niche. The verifier
   protects the table's completeness and vocabulary; it must not invent a
   mechanical difference where the one user-facing judgement finds none. */

const tally = new Map(relicSynergyBandOrder.map((band) => [band, 0]));
for (const cell of cells) tally.set(cell.band, (tally.get(cell.band) ?? 0) + 1);
for (const [band, held] of tally) {
  check(held >= 3, `band ${band} holds ${held} of the ${expected} cells`);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nRelic synergy holds.');
process.exitCode = failures ? 1 : 0;
