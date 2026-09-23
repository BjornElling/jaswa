/**
 * The build-against-build gate for Rune Clean-up.
 *
 * `verify-rune-cleanup-calibration.mjs` checks the *model against a simulation*
 * and is deliberately not a second copy of the scorer. It cannot answer the
 * other question a refactor raises: does this build say the same thing the last
 * one did, rune by rune and field by field. That is what this script is for.
 *
 * It builds one fixed population from a fixed seed, runs `runeAdvice` over
 * several settings and preset scenarios, and records every public field of every
 * row. Given a baseline it diffs the two and reports, per field, how many rows
 * differ and by how much. Nothing here is random at run time: the same checkout
 * always produces the same records, so a difference is a change in the engine
 * and nothing else.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs \
 *     scripts/verify-rune-cleanup-equivalence.mjs [--write] [--quick]
 *
 * `--write` records the current tree as the baseline (`work/` is not committed,
 * so a baseline is always captured deliberately before a change, never inherited).
 *
 * **On `chance` and exactness.** Every field but `chance` is held to bit equality,
 * including `reason` — which carries the *printed* percentage, so a moved display
 * boundary is always adjudicated and never absorbed into a numeric tolerance.
 *
 * `chance` is the one field that is counted rather than derived
 * (`docs/RUNE-CLEANUP-MATH.md` §7), so a change that only moves how finely it is
 * counted, or in what order the runs are summed, may move it by the resolution and no
 * further. `--chance-tolerance` states how far, and it defaults to zero: a stage that
 * should not have touched the odds at all has to say so. A stage that did touch them
 * states its own figure and records a fresh baseline in the same commit.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  initialSubPropertyRange, slotMainProperties, subPropertyLevels, upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import { runeDefaultGradeOrder, runeDefaultGrades, runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(name.length + 3);
};
const write = flag('write');
const quick = flag('quick');
const chanceTolerance = Number(option('chance-tolerance', '0'));
const baselinePath = resolve(root, option('baseline', 'work/rune-cleanup-equivalence-baseline.json'));
if (!Number.isFinite(chanceTolerance) || chanceTolerance < 0) {
  throw new Error('--chance-tolerance must be a non-negative number.');
}

/* The same xorshift the calibration script uses, so the two agree about what a
   seed means and a population can be moved between them. */
function makeRandom(initial) {
  let state = initial >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
const choose = (random, values) => values[Math.floor(random() * values.length)];
const draw = (random, low, high) => low + Math.floor(random() * (high - low + 1));

const setNames = [
  'Energy', 'Guard', 'Swift', 'Blade', 'Rage', 'Focus', 'Endure', 'Fatal',
  'Despair', 'Vampire', 'Violent', 'Nemesis', 'Will', 'Shield', 'Revenge', 'Destroy',
  'Fight', 'Determination', 'Enhance', 'Accuracy', 'Tolerance', 'Seal', 'Intangible',
];

/* One reference line per preset family, as the page reads them off the account's
   own Lv. 40 averages. Fixed here so a flat-line conversion cannot drift. */
const referenceStats = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

// ---------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------

/** A legal rune as it leaves the box, before any power-up. */
function freshRune(random, id, { slot, stars, ancient, subCount }) {
  const mainStatId = choose(random, slotMainProperties[slot]);
  const legal = runeStatIds.filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat));
  const prefixStatId = random() < 0.5 ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < subCount; at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    if (statId === undefined) break;
    held.add(statId);
    const range = initialSubPropertyRange(stars, statId, ancient);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(stars, prefixStatId, ancient);
  return {
    id: String(id), setId: 1, setName: choose(random, setNames), slot, stars, ancient,
    defaultGrade: runeDefaultGrades[Math.max(0, subCount - 1)] ?? runeDefaultGrades[0],
    level: 0, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefix ? draw(random, prefix.minimum, prefix.maximum) : 0,
    subProperties, occupiedId: null, obtainedOrder: id,
  };
}

/** The game's own addition/upgrade loop, so every fixture is a state the game can reach. */
function powerUp(random, rune, targetLevel) {
  const bornLines = runeDefaultGradeOrder(rune.defaultGrade);
  for (const [eventIndex, level] of subPropertyLevels.entries()) {
    if (level <= rune.level || level > targetLevel) continue;
    if (eventIndex >= bornLines) {
      const held = new Set(rune.subProperties.map((property) => property.statId));
      const options = runeStatIds.filter((stat) => stat !== rune.mainStatId && stat !== rune.prefixStatId
        && !held.has(stat) && slotAllowsSubStat(rune.slot, stat));
      const statId = choose(random, options);
      const range = upgradeSubPropertyRange(rune.stars, statId, rune.ancient);
      rune.subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
    } else {
      const line = choose(random, rune.subProperties);
      const range = upgradeSubPropertyRange(rune.stars, line.statId, rune.ancient);
      line.value += draw(random, range.minimum, range.maximum);
    }
  }
  rune.level = targetLevel;
  return rune;
}

/**
 * The sweep §9.14 of the performance document asks for, enumerated rather than
 * sampled: every star class and lineage, every power-up stop that adds or
 * upgrades a line, every starting sub-property count, every slot.
 */
function sweptPopulation(random) {
  const lineages = [
    { stars: 4, ancient: false }, { stars: 5, ancient: false },
    { stars: 6, ancient: false }, { stars: 6, ancient: true },
  ];
  const levels = quick ? [0, 9, 12] : [0, 3, 6, 9, 12, 15];
  const counts = quick ? [2, 4] : [1, 2, 3, 4];
  const runes = [];
  let id = 0;
  for (const lineage of lineages) for (const subCount of counts) for (const level of levels) {
    for (let slot = 1; slot <= 6; slot += 1) {
      id += 1;
      const rune = freshRune(random, id, { ...lineage, slot, subCount });
      runes.push(powerUp(random, rune, level));
    }
  }
  return runes;
}

/**
 * The cases the sweep cannot produce, each one a boundary the engine is known to
 * treat specially. They carry names rather than numbers so a diff says which
 * shape moved.
 */
function namedFixtures(random) {
  const fixtures = [];
  const push = (name, rune) => { fixtures.push({ ...rune, id: `fixture:${name}` }); };

  /* No sub properties at all: `bestReachableFill` has nothing to improve and
     every gain must come from additions. */
  const bare = freshRune(random, 'bare', { slot: 3, stars: 6, ancient: false, subCount: 0 });
  push('no-subs', { ...bare, prefixStatId: null, prefixValue: 0 });

  /* Flat and percent of the same target stat held together — the case §9.8 says
     a branch key must not collapse, because HP+ and HP% have different ranges. */
  const flatAndPercent = freshRune(random, 'flat', { slot: 3, stars: 6, ancient: false, subCount: 0 });
  push('flat-beside-percent', {
    ...flatAndPercent, mainStatId: 5, prefixStatId: null, prefixValue: 0, level: 9,
    subProperties: [
      { statId: 1, value: 300, gemmed: false, grind: 0 },
      { statId: 2, value: 12, gemmed: false, grind: 0 },
      { statId: 3, value: 20, gemmed: false, grind: 0 },
      { statId: 4, value: 9, gemmed: false, grind: 0 },
    ],
  });

  /* A line already gemmed and a line already ground: the craft credit must not
     pay the same line twice, and a gem may only replace the converted line. */
  const crafted = freshRune(random, 'crafted', { slot: 4, stars: 6, ancient: false, subCount: 0 });
  push('already-crafted', {
    ...crafted, mainStatId: 6, prefixStatId: null, prefixValue: 0, level: 12,
    subProperties: [
      { statId: 8, value: 10, gemmed: true, grind: 0 },
      { statId: 9, value: 8, gemmed: false, grind: 4 },
      { statId: 10, value: 14, gemmed: false, grind: 0 },
      { statId: 2, value: 11, gemmed: false, grind: 3 },
    ],
  });

  /* A slot-2 main no shipped preset names, so every preset's build finder must
     reject it and the row falls back to "No preset can use it". */
  const wrongMain = freshRune(random, 'wrong', { slot: 2, stars: 6, ancient: false, subCount: 4 });
  push('incompatible-main', { ...wrongMain, mainStatId: 11 });

  /* Maxed, with nothing left to roll: the chance is a certainty either way and
     no distribution may be built for it. */
  const maxed = freshRune(random, 'maxed', { slot: 1, stars: 6, ancient: false, subCount: 4 });
  push('maxed-perfect', { ...powerUp(random, maxed, 15), subProperties: maxed.subProperties });

  /* One addition and one upgrade left, on a rune whose lines are few and equal,
     which is where a chance lands on a simple fraction and so on a display
     boundary. */
  const dyadic = freshRune(random, 'dyadic', { slot: 5, stars: 6, ancient: false, subCount: 0 });
  push('few-events', {
    ...dyadic, mainStatId: 1, prefixStatId: null, prefixValue: 0, level: 9,
    subProperties: [
      { statId: 8, value: 11, gemmed: false, grind: 0 },
      { statId: 10, value: 15, gemmed: false, grind: 0 },
      { statId: 12, value: 12, gemmed: false, grind: 0 },
    ],
  });

  return fixtures;
}

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

const baseSettings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1,
  gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1, keepMoreForLargerSets: false,
};

const shipped = defaultRunePotentialPresets();

/** A preset stripped of every positive target: it can never yield a candidate. */
function emptyTargetPreset() {
  const source = shipped[0];
  return { ...source, id: 'fixture-empty-targets', name: 'Empty targets', targets: {} };
}

/**
 * A preset that names slots 4 and 6 and leaves slot 2 blank.
 *
 * `presetBuilds` and `judgeAgainstBuild` both read a blank slot as "every legal
 * main, at the broken rank"; `runeAdvice`'s build finder reads it as "this preset
 * judges nothing". That disagreement is §10.4's subject and Stage 8's decision,
 * and it has to be pinned here *before* any refactor collapses the two readings.
 */
function unstatedSlotPreset() {
  const source = shipped[0];
  return {
    ...source, id: 'fixture-unstated-slot', name: 'Unstated slot',
    slots: { ...source.slots, slot2: { preferred: [], acceptable: [] } },
  };
}

/** Two presets with the same vocabulary, to pin the tie order candidates keep. */
function twinPresets() {
  const source = shipped[1];
  return [
    { ...source, id: 'fixture-twin-a', name: 'Twin A' },
    { ...source, id: 'fixture-twin-b', name: 'Twin B' },
  ];
}

/** A preset aiming only at Resistance — disjoint from every shipped role. */
function disjointPreset() {
  const source = shipped[0];
  return {
    ...source, id: 'fixture-disjoint', name: 'Disjoint',
    targets: { res: 60 },
  };
}

function scenarios() {
  const fixturePresets = [
    ...shipped, emptyTargetPreset(), unstatedSlotPreset(), ...twinPresets(), disjointPreset(),
  ];
  const all = [
    { name: 'defaults', settings: baseSettings, presets: shipped },
    { name: 'max-craft', presets: shipped, settings: { ...baseSettings, enchantedGems: 4, grindstones: 4, gemGrade: 'Legend', grindstoneGrade: 'Legend' } },
    { name: 'half-craft', presets: shipped, settings: { ...baseSettings, enchantedGems: 2, grindstones: 1, gemGrade: 'Rare', grindstoneGrade: 'Legend' } },
    { name: 'broken-rejected', presets: shipped, settings: { ...baseSettings, brokenRunes: 5 } },
    { name: 'strict', presets: shipped, settings: { ...baseSettings, runeQuality: 5, powerUpPolicy: 5, acceptedRunes: 5 } },
    { name: 'permissive', presets: shipped, settings: { ...baseSettings, runeQuality: 1, powerUpPolicy: 1, acceptedRunes: 1, brokenRunes: 1 } },
    { name: 'multiple-matches', presets: fixturePresets, settings: baseSettings },
    { name: 'fixture-presets', presets: fixturePresets, settings: baseSettings },
  ];
  return quick ? all.filter((scenario) => ['defaults', 'fixture-presets'].includes(scenario.name)) : all;
}

// ---------------------------------------------------------------------------
// Running and recording
// ---------------------------------------------------------------------------

/** Everything a row can say, in one flat record per rune per scenario. */
async function record(runes, presets, settings) {
  const advice = await runeAdvice(runes, presets, settings, referenceStats);
  const rows = [];
  const counts = new Map();
  for (const rune of runes) {
    const answer = advice.get(rune.id);
    if (!answer) { rows.push({ id: rune.id, missing: true }); continue; }
    rows.push({
      id: rune.id, verdict: answer.verdict, reason: answer.reason,
      preset: answer.preset?.id ?? null, rank: answer.rank,
      maxValue: answer.maxValue, standing: answer.standing, chance: answer.chance,
    });
    const key = `${answer.preset?.id ?? '—'}/${answer.verdict}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { rows, counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))) };
}

/**
 * The degenerate inputs rule 3 of `AGENTS.md` requires of every feature: nothing
 * filled in at all. These assert rather than diff — an empty account has one
 * right answer and it is not a number that can drift.
 */
async function degenerateChecks(runes) {
  const failures = [];
  const expect = (claim, condition) => { if (!condition) failures.push(claim); };
  const nothing = await runeAdvice([], shipped, baseSettings, referenceStats);
  expect('no runes yields no advice', nothing.size === 0);
  const noPresets = await runeAdvice(runes, [], baseSettings, referenceStats);
  expect('no presets yields one row per rune', noPresets.size === runes.length);
  expect('no presets sells every rune',
    [...noPresets.values()].every((answer) => answer.verdict === 'sell'));
  const emptyOnly = await runeAdvice(runes, [emptyTargetPreset()], baseSettings, referenceStats);
  expect('a preset with no positive target can use nothing',
    [...emptyOnly.values()].every((answer) => answer.preset === null));
  const neither = await runeAdvice([], [], baseSettings, referenceStats);
  expect('no runes and no presets is still an empty map', neither.size === 0);
  return failures;
}

/**
 * Every chance sitting within a whisker of a display rounding boundary.
 *
 * `percent()` rounds at the half, so a value exactly on `k + 0.5` prints one
 * percentage point either way depending on the last ulp of a summation. §10.2
 * settled the one known instance by compensated summation and found the older
 * build was the one printing the wrong number, so these are listed rather than
 * forbidden: a difference here is a prompt to adjudicate, not a verdict.
 */
function displayBoundaries(results) {
  const found = [];
  for (const [scenario, { rows }] of Object.entries(results)) {
    for (const row of rows) {
      if (typeof row.chance !== 'number' || row.chance <= 0) continue;
      const percent = row.chance * 100;
      if (percent < 10) continue;
      const distance = Math.abs(percent - Math.floor(percent) - 0.5);
      if (distance < 1e-9) found.push({ scenario, id: row.id, chance: row.chance, printed: row.reason });
    }
  }
  return found;
}

async function buildResults() {
  const random = makeRandom(0x5eed_1a7e);
  const runes = [...sweptPopulation(random), ...namedFixtures(random)];
  const results = {};
  for (const scenario of scenarios()) {
    results[scenario.name] = await record(runes, scenario.presets, scenario.settings);
  }
  return { runes, results };
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/* `standing` is held to bit equality alongside `maxValue`, and for the same reason:
   it is a deterministic function of the preset, the slot and the rune, so a refactor
   has no business moving it. It is the one of the two the gates actually read. */
const exactFields = ['verdict', 'reason', 'preset', 'rank', 'maxValue', 'standing'];

function diff(before, after) {
  const problems = [];
  const notes = [];
  const beforeNames = Object.keys(before).sort();
  const afterNames = Object.keys(after).sort();
  if (beforeNames.join() !== afterNames.join()) {
    problems.push(`scenario set changed: ${beforeNames.join(', ')} -> ${afterNames.join(', ')}`);
    return { problems, notes };
  }
  let worstChance = 0;
  let chanceDiffers = 0;
  for (const name of beforeNames) {
    const old = before[name];
    const now = after[name];
    if (old.rows.length !== now.rows.length) {
      problems.push(`${name}: ${old.rows.length} rows became ${now.rows.length}`);
      continue;
    }
    const perField = new Map();
    for (let at = 0; at < old.rows.length; at += 1) {
      const left = old.rows[at];
      const right = now.rows[at];
      if (left.id !== right.id) { problems.push(`${name}: row ${at} is ${right.id}, was ${left.id}`); continue; }
      for (const field of exactFields) {
        if (Object.is(left[field], right[field])) continue;
        const seen = perField.get(field) ?? [];
        seen.push(`${left.id}: ${JSON.stringify(left[field])} -> ${JSON.stringify(right[field])}`);
        perField.set(field, seen);
      }
      const delta = Math.abs((left.chance ?? 0) - (right.chance ?? 0));
      if (delta > 0) { chanceDiffers += 1; worstChance = Math.max(worstChance, delta); }
    }
    for (const [field, seen] of perField) {
      problems.push(`${name}: ${seen.length} ${field} difference(s) — ${seen.slice(0, 4).join('; ')}${seen.length > 4 ? '; …' : ''}`);
    }
    const oldCounts = JSON.stringify(old.counts);
    const newCounts = JSON.stringify(now.counts);
    if (oldCounts !== newCounts) problems.push(`${name}: assignment counts changed\n    was ${oldCounts}\n    now ${newCounts}`);
  }
  if (chanceDiffers > 0) {
    const line = `chance: ${chanceDiffers} row(s) differ, largest |Δ| ${worstChance.toExponential(3)}`;
    if (worstChance > chanceTolerance) problems.push(`${line} (tolerance ${chanceTolerance})`);
    else notes.push(`${line} — within the stated tolerance ${chanceTolerance}`);
  }
  return { problems, notes };
}

// ---------------------------------------------------------------------------

const started = Date.now();
const { runes, results } = await buildResults();
const elapsed = Date.now() - started;

const failures = await degenerateChecks(runes.slice(0, 24));
const boundaries = displayBoundaries(results);

console.log(`Rune Clean-up equivalence: ${runes.length} runes x ${Object.keys(results).length} scenarios in ${elapsed} ms`);
if (boundaries.length > 0) {
  console.log(`Chances sitting on a display rounding boundary (${boundaries.length}):`);
  for (const item of boundaries.slice(0, 8)) {
    console.log(`  ${item.scenario}/${item.id}: ${item.chance} printed as ${item.printed}`);
  }
}
for (const failure of failures) console.log(`FAIL degenerate input: ${failure}`);

if (write) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify({ results, boundaries }, null, 1)}\n`);
  console.log(`Baseline written to ${baselinePath}`);
  if (failures.length > 0) { console.log('FAIL'); process.exit(1); }
  console.log('PASS (baseline recorded — nothing compared)');
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.log(`No baseline at ${baselinePath}. Record one with --write before changing the engine.`);
  process.exit(1);
}

const { problems, notes } = diff(baseline.results, results);
for (const note of notes) console.log(`note: ${note}`);
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length === 0 && failures.length === 0) {
  console.log('PASS — every field identical to the baseline');
  process.exit(0);
}
console.log('FAIL');
process.exit(1);
