#!/usr/bin/env node

/**
 * Proves the relic synergy table is complete, still says something, and is
 * the only one (`docs/RELIC-CANONICAL.md` §5).
 *
 * The shipped table is hand-written and the user may overrule any cell of it —
 * that is the point of it — so nothing regenerates it and nothing can check
 * whether a cell is *right*. What can be checked is that it stays whole: every
 * unique property the vocabulary declares has a row, every row has all three
 * main properties, every value is a band, and no band has fallen out of use. A
 * five-step scale with an empty step is a four-step scale nobody meant to write.
 *
 * And that the user's cells are read the way every other choice is: one cell at
 * a time, a cell equal to the shipped one not carried, and a table resolved from
 * them differing from the shipped one in exactly those cells.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-synergy.mjs
 */
import { relicProperties, relicMainPropertyOrder } from '../app/domain/relics/relic-properties.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cycledRelicSynergyBand, defaultRelicSynergy, hasRelicSynergyRow, readRelicSynergyChoices, relicSynergy,
  relicSynergyBandOrder, relicSynergyCells, relicSynergyChoices, resolveRelicSynergy, sameRelicSynergy,
  withRelicSynergyCell,
} from '../app/domain/relics/relic-synergy.ts';

let failures = 0;
function check(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

const cells = relicSynergyCells(defaultRelicSynergy);
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

/* The user's cells, read one at a time (`AGENTS.md` §0). */
const stored = {
  1: { HP: 'trash', ATK: 'excellent', DEF: 'nonsense' },
  2: 'not a row',
  99: { HP: 'excellent' },
  '07': { HP: 'excellent' },
  14: { DEF: 'poor', SPD: 'excellent' },
};
const read = readRelicSynergyChoices(stored);
check(JSON.stringify(read) === JSON.stringify({ 1: { HP: 'trash' }, 14: { DEF: 'poor' } }),
  'a stored cell is kept or dropped on its own, and a cell equal to the shipped one is not carried');
check(JSON.stringify(readRelicSynergyChoices(undefined)) === '{}' && JSON.stringify(readRelicSynergyChoices([])) === '{}',
  'no stored record reads as no choices');

const resolved = resolveRelicSynergy(read);
const differing = relicSynergyCells(resolved).filter((cell) =>
  cell.band !== relicSynergy(defaultRelicSynergy, cell.main, cell.propertyId));
check(differing.length === 2 && relicSynergy(resolved, 'HP', 1) === 'trash' && relicSynergy(resolved, 'DEF', 14) === 'poor',
  'a resolved table differs from the shipped one in exactly the chosen cells');
check(JSON.stringify(relicSynergyChoices(resolved)) === JSON.stringify(read),
  'saving a resolved table stores exactly the chosen cells');
const undone = withRelicSynergyCell(resolved, 1, 'HP', relicSynergy(defaultRelicSynergy, 'HP', 1));
check(JSON.stringify(relicSynergyChoices(undone)) === JSON.stringify({ 14: { DEF: 'poor' } }),
  'setting a cell back to its shipped band removes the choice');
check(sameRelicSynergy(resolveRelicSynergy({}), defaultRelicSynergy), 'no choices resolve to the shipped table');

let band = relicSynergyBandOrder[0];
const visited = [];
for (let at = 0; at < relicSynergyBandOrder.length; at += 1) { visited.push(band); band = cycledRelicSynergyBand(band); }
check(JSON.stringify(visited) === JSON.stringify(relicSynergyBandOrder) && band === relicSynergyBandOrder[0]
  && cycledRelicSynergyBand(relicSynergyBandOrder[0], -1) === relicSynergyBandOrder.at(-1),
  'a click steps down through every band and wraps; Shift steps back up');

/* One table. Every reading takes a resolved table as an argument, so the
   shipped cells can be reached only through `relic-synergy.ts`; a second table
   of bands anywhere under app/ would be a judgement the editor cannot reach. A
   module is a suspect when it writes an HP cell and at least five band names. */
const appRoot = fileURLToPath(new URL('../app/', import.meta.url));
const sources = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(entry)) sources.push(path);
  }
};
walk(appRoot);
const bandCell = /\b(HP|ATK|DEF):\s*['"](strong|useful|niche|poor|trash)['"]/g;
const strays = sources.filter((path) => !path.endsWith('relic-synergy.ts')
  && (readFileSync(path, 'utf8').match(bandCell) ?? []).length >= 3);
check(strays.length === 0, strays.length === 0
  ? 'no module outside relic-synergy.ts writes synergy cells of its own'
  : `synergy cells written in ${strays.map((path) => relative(appRoot, path)).join(', ')}`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nRelic synergy holds.');
process.exitCode = failures ? 1 : 0;
