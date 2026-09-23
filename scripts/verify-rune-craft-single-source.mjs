/**
 * **The Gem and Grindstone rules live in one file, and this is what keeps them there.**
 *
 * They did not, and the cost was not hypothetical. The same four rules were applied
 * in five places — a rune's own projection, the perfect rune of its slot, the box of
 * ordinary runes it is measured in, the probability engine and the craft planner —
 * and two of them had drifted apart. The projection offered the Gem to the *weakest*
 * line; the ceiling enumerated every line against every Gem and kept the best pair.
 * Measured against the rules written out from `RUNE-CANONICAL.md` §8, the first was
 * up to nine per cent short on a real rune, and nothing failed.
 *
 * So `app/lib/rune-craft-end-state.ts` is the only module under `app/` allowed to
 * read the §8 tables or decide what a craft item does, and this check fails if a
 * sixth copy starts to appear. It is source text rather than behaviour on purpose:
 * a second implementation that happens to agree today is still a second
 * implementation, and it will not agree after the next change to either one.
 *
 * The tables themselves stay in `rune-craft-items.ts`, which is the import reader and
 * has to know them. What it must not do is decide anything with them.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const searched = join(root, 'app');

/** The two files that are allowed to know, and what each of them is for. */
const owners = new Map([
  [join('app', 'lib', 'rune-craft-items.ts'), 'holds the §8 tables and reads the export'],
  [join('app', 'lib', 'rune-craft-end-state.ts'), 'is the one place the rules are applied'],
]);

/**
 * Reaching for any of these outside the two owners means deciding what a craft item
 * does somewhere new. `craftRollValue` and `craftValueRange` are the tables; the two
 * grindable lists are the legality rule that a Grindstone never touches CRI Rate,
 * CRI Dmg, Resistance or Accuracy — and never the innate.
 */
const guarded = [
  'craftValueRange', 'craftRollValue', 'grindableStatIds', 'isGrindableStat',
  /* And half a Gem decision, which is the shape the last duplicate took: what a Gem
     would roll on an id, held apart from which line it may replace. A caller with
     that half is a caller about to write the other half somewhere new. The whole
     rule — `gemOptions` and `craftedScore` — is what callers are given instead. */
  'gemCredit',
];

function everyFile(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...everyFile(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

const offences = [];
for (const path of everyFile(searched)) {
  const name = relative(root, path).split('/').join(sep);
  if (owners.has(name)) continue;
  const source = readFileSync(path, 'utf8');
  for (const symbol of guarded) {
    if (new RegExp(`\\b${symbol}\\b`).test(source)) offences.push(`${name} reaches for ${symbol}`);
  }
}

/* And the owner of the rules has to still be the owner: a file that no longer states
   them has been hollowed out by a refactor that moved them somewhere else. */
const endState = readFileSync(join(root, 'app', 'lib', 'rune-craft-end-state.ts'), 'utf8');
for (const required of ['craftedScore', 'gemOptions', 'groundValue', 'isGrindableStatId']) {
  if (!endState.includes(`export function ${required}`) && !endState.includes(`export const ${required}`)) {
    offences.push(`rune-craft-end-state.ts no longer exports ${required}`);
  }
}

if (offences.length > 0) {
  console.error('The Gem and Grindstone rules have started to spread:');
  for (const offence of offences) console.error(`  ${offence}`);
  console.error('\nEvery caller takes its answer from app/lib/rune-craft-end-state.ts.');
  process.exit(1);
}

console.log(`PASS: only ${owners.size} files know what a Gem or a Grindstone does, and one of them`
  + ' is the table.');
