#!/usr/bin/env node

/**
 * Enforces `docs/MONSTER-NAME-ELEMENT-DECISION.md`.
 *
 * **The rule:** where two monsters of different elements share one displayed
 * name, every one of them shows its element in parentheses — `DHALSIM (Water)`.
 * A name that is already unique is shown exactly as the catalogue has it.
 *
 * The rule contradicts the house instinct to keep labels short (`AGENTS.md` §5),
 * which makes it the kind of thing a later reader removes as clutter in good
 * faith. This command is the guard against that: it fails loudly the moment an
 * ambiguous name is rendered without its element.
 *
 * It calls the app's real `monsterPresentation` rather than reimplementing the
 * rule, because a verifier holding its own copy of the logic would keep passing
 * after the app stopped obeying it. It derives the expectation independently
 * from the catalogue, so the two only agree when the app is actually right.
 *
 * Usage: node scripts/verify-element-qualified-names.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(repositoryRoot, 'app/data/swarfarm-monsters.json');
const catalogModulePath = resolve(repositoryRoot, 'app/domain/monsters/monster-catalog.ts');

const elementNames = { 1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark' };

/* `<family><tier><element>`. Ambiguity is judged within a family and tier, so
   two unrelated monsters that share a name — Theomars at 17111 and at 19211 —
   are not read as one monster with two elements. */
function familyAndTier(id) {
  return String(id).slice(0, -1);
}

function elementOf(id) {
  return elementNames[Number(String(id).at(-1))];
}

/* Joins a name to a catalogue id so the name can be read back off the front.
   A space would not do: names contain spaces, and "Poison Master" would read
   back as "Poison".

   Kept as this file's own constant rather than imported from the app: the
   expectation below is derived from the catalogue independently, which is what
   makes this a check and not a restatement. Written as an escape because a
   literal NUL makes git treat the file as binary and is invisible in an
   editor — see the same note in `monster-catalog.ts`. */
const nameKeySeparator = '\0';

async function main() {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const { monsterPresentation } = await import(pathToFileURL(catalogModulePath).href);

  /* The expectation, derived from the catalogue rather than from the app: a
     catalogue name is ambiguous when one family and tier carries it in more
     than one element. */
  const elementsPerName = new Map();
  for (const monster of catalog.monsters) {
    const id = String(monster.com2us_id);
    const element = elementOf(id);
    if (!element) continue;
    const key = `${monster.name}${nameKeySeparator}${familyAndTier(id)}`;
    const seen = elementsPerName.get(key) ?? new Set();
    seen.add(element);
    elementsPerName.set(key, seen);
  }
  const ambiguous = new Set();
  for (const [key, elements] of elementsPerName) {
    if (elements.size > 1) ambiguous.add(key.split(nameKeySeparator)[0]);
  }

  const missing = [];
  const unexpected = [];
  const wrongElement = [];

  for (const monster of catalog.monsters) {
    const id = String(monster.com2us_id);
    const element = elementOf(id);
    if (!element) continue;
    const shown = monsterPresentation(id).name;
    const qualifier = `(${element})`;

    if (ambiguous.has(monster.name)) {
      if (!shown.includes(qualifier)) {
        missing.push(`${id} ${monster.name} — shown as "${shown}", expected ${qualifier}`);
      }
      continue;
    }
    /* A unique name must stay bare. This half matters as much as the other: it
       is what stops the rule quietly widening into "every monster, always",
       which the decision explicitly rejected.
       Measured against the catalogue name, because a few rows arrive with the
       element already in them — `Dimensional Minion (Water)` — and that is the
       game's own naming, not this rule applied where it should not be. */
    const added = Object.values(elementNames)
      .filter((each) => shown.includes(`(${each})`) && !monster.name.includes(`(${each})`));
    for (const each of added) {
      if (each === element) unexpected.push(`${id} ${monster.name} — shown as "${shown}", name is unambiguous`);
      else wrongElement.push(`${id} ${monster.name} — shown as "${shown}", element is ${element}`);
    }
  }

  const report = (label, entries) => {
    if (!entries.length) return;
    console.error(`\n${entries.length} ${label}:`);
    for (const entry of entries.slice(0, 20)) console.error(`  ${entry}`);
    if (entries.length > 20) console.error(`  … and ${entries.length - 20} more.`);
  };

  const ambiguousCount = ambiguous.size;
  const qualifiedCount = catalog.monsters.filter((monster) => {
    const element = elementOf(monster.com2us_id);
    return element && ambiguous.has(monster.name);
  }).length;

  if (missing.length || unexpected.length || wrongElement.length) {
    console.error('Element-qualified monster names do not match docs/MONSTER-NAME-ELEMENT-DECISION.md.');
    report('ambiguous name(s) shown without their element', missing);
    report('unambiguous name(s) given an element they should not carry', unexpected);
    report('name(s) qualified with the wrong element', wrongElement);
    console.error('\nThe rule is binding. Read the decision document before changing it.');
    process.exitCode = 1;
    return;
  }

  console.log(`${qualifiedCount} monster record(s) across ${ambiguousCount} ambiguous name(s) are correctly qualified by element.`);
  console.log('Every unambiguous name is shown bare. docs/MONSTER-NAME-ELEMENT-DECISION.md holds.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
