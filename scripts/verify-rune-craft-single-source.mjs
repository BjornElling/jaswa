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
 * So `app/domain/runes/craft/rune-craft-end-state.ts` is the only module under `app/` allowed to
 * read the §8 tables or decide what a craft item does, and this check fails if a
 * sixth copy starts to appear. It is source text rather than behaviour on purpose:
 * a second implementation that happens to agree today is still a second
 * implementation, and it will not agree after the next change to either one.
 *
 * The tables themselves stay in `rune-craft-items.ts`, which is the import reader and
 * has to know them. What it must not do is decide anything with them.
 *
 * **One second implementation is sanctioned, and this check cannot see it.** The
 * Clean-up chance shader, `platform/gpu/shaders/rune-chance-shader.ts`, applies the same
 * rules in WGSL — one converted line, a same-id re-Gem keeping its stone, no
 * duplicate id, never a forced Gem — because the card cannot call TypeScript. It is
 * the bargain `docs/HARDWARE-ACCELERATION.md` makes: `runeChanceAgreement` in its
 * backend proves it against `rune-craft-end-state.ts` on this machine's card before
 * its answers are used, and `verify:rune-chance-layout` holds what it reads. A symbol
 * scan like this one reads TypeScript names, not shader source.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const searched = join(root, 'app');

/** The two files that are allowed to know, and what each of them is for. */
const owners = new Map([
  [join('app', 'domain', 'runes', 'craft', 'rune-craft-items.ts'), 'holds the §8 tables and reads the export'],
  [join('app', 'domain', 'runes', 'craft', 'rune-craft-end-state.ts'), 'is the one place the rules are applied'],
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
  'canGemReplaceValue',
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
const endState = readFileSync(join(root, 'app', 'domain', 'runes', 'craft', 'rune-craft-end-state.ts'), 'utf8');
for (const required of ['craftedScore', 'gemOptions', 'groundValue', 'isGrindableStatId']) {
  if (!endState.includes(`export function ${required}`) && !endState.includes(`export const ${required}`)) {
    offences.push(`rune-craft-end-state.ts no longer exports ${required}`);
  }
}

/* **Gems & Grinds' Ignore stays on Gems & Grinds** (`docs/RUNE-CRAFT-ITEMS.md`). It
   hides a suggestion there; it does not forbid the item on the rune, so Rune
   Optimization must still be free to place an ignored Gem where it makes the best
   build. Only the preference plumbing and the Gems & Grinds views may name the list. */
const ignoreReaders = [
  join('app', 'domain', 'profiles', 'craft-ignores.ts'),
  join('app', 'domain', 'profiles', 'preference-defaults.ts'),
  join('app', 'domain', 'model.ts'),
  join('app', 'ingest', 'preferences.ts'),
  join('app', 'shell', 'root.tsx'),
  join('app', 'features', 'craft-advice') + sep,
];
for (const path of everyFile(searched)) {
  const name = relative(root, path).split('/').join(sep);
  if (ignoreReaders.some((allowed) => name === allowed || name.startsWith(allowed))) continue;
  if (/craftIgnore|craft-ignores/i.test(readFileSync(path, 'utf8'))) {
    offences.push(`${name} reads Gems & Grinds' ignore list, which belongs to that page alone`);
  }
}

if (offences.length > 0) {
  console.error('The Gem and Grindstone rules have started to spread:');
  for (const offence of offences) console.error(`  ${offence}`);
  console.error('\nEvery caller takes its answer from app/domain/runes/craft/rune-craft-end-state.ts.');
  process.exit(1);
}

console.log(`PASS: only ${owners.size} files know what a Gem or a Grindstone does, and one of them`
  + ' is the table.');
