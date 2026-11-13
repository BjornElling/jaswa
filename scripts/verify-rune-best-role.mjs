/**
 * The gate on how Rune Clean-up chooses a rune's Best role.
 *
 * `docs/RUNE-CLEANUP-MATH.md` §9.6 states two promises and this holds both, against the
 * engine's own readings rebuilt from the model's exported pieces:
 *
 * 1. **A passing reading always wins over a failing one.** Where any build of any role
 *    clears both the quality floor and the chance bar, Best role is one of those — so
 *    a row can never name a role that says Sell while another role says Keep.
 * 2. **Among the readings it chooses from, the one the rune is expected to be worth most
 *    to wins**, not the one with the best best-case.
 *
 * It also holds the arithmetic under the second promise: no reading's expectation
 * exceeds its own ceiling (`candidateExpectedBound`) or its Max value — the skip that
 * makes the choice affordable is only sound while that holds — and on runes with one or
 * two substat events left, the expectation agrees with an exact enumeration of every
 * outcome.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs \
 *     scripts/verify-rune-best-role.mjs
 */
import assert from 'node:assert/strict';
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/ingest/preferences.ts';
import {
  acceptedWorth, brokenWorth, chanceThresholds, runeAdvice, slotFloorMaxValues,
} from '../app/lib/rune-cleanup-advice.ts';
import {
  candidateChance, candidateExpectedBound, candidateExpectedValue, candidateMaxValue,
  newRuneAdviceScope, ordinaryBox, ordinarySample, prepareRuneCandidate, roleBuilds, runeRuns,
  slotMainFamily, standingIn,
} from '../app/lib/rune-cleanup-model.ts';
import { canonicalCraftCredit, craftedScore } from '../app/lib/rune-craft-end-state.ts';

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
const roles = defaultRuneRoles();

/* The Intangible preference widens a rune's own retention share, which the
   readings below do not rebuild, so the population leaves them out; the choice being
   checked is the same for every set. */
const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) => [0, 6, 9, 12].flatMap((level) =>
  ordinarySample(slot, 6, 8, level)
    .filter((rune) => rune.setName !== 'Intangible')
    .map((rune) => ({ ...rune, id: `${rune.id}:${level}` }))));

let failures = 0;
const check = (ok, message) => {
  if (!ok) { failures += 1; console.log(`  FAIL ${message}`); }
};

/** Every reading the engine weighs for one rune, rebuilt as `runeAdvice` builds them. */
function readingsOf(rune, settings, shares, scope) {
  const credit = canonicalCraftCredit;
  const accepted = acceptedWorth[settings.acceptedRunes - 1];
  const broken = brokenWorth[settings.brokenRunes - 1];
  const worthOf = (rank) => (rank === 'preferred' ? 1 : rank === 'acceptable' ? accepted : broken);
  const readings = [];
  let runs = null;
  for (const role of roles) {
    const line = base.get(role.type);
    const builds = roleBuilds(role);
    const family = builds
      .filter((build) => ![2, 4, 6].includes(rune.slot)
        || build.mains[rune.slot] === rune.mainStatId || build.mains[rune.slot] === 0)
      .map((build) => prepareRuneCandidate(rune, role, build, line, credit, scope))
      .filter(Boolean);
    if (family.length === 0) continue;
    const box = ordinaryBox(slotMainFamily(role, builds, rune.slot, family[0].main, 6, line, scope));
    const floor = shares[rune.slot - 1];
    for (const candidate of family) {
      const worth = worthOf(candidate.rank);
      const maxValue = candidateMaxValue(candidate) * worth;
      const threshold = worth > 0 ? floor / worth : Number.POSITIVE_INFINITY;
      const expected = candidateExpectedValue(candidate, () => (runs ??= runeRuns(candidate.future)));
      readings.push({
        role, candidate, rank: candidate.rank, maxValue, value: standingIn(box, maxValue),
        passesValue: maxValue >= floor,
        chance: candidateChance(candidate, threshold),
        expected: expected * worth, bound: candidateExpectedBound(candidate) * worth,
        rawExpected: expected, rawMax: candidateMaxValue(candidate),
      });
    }
  }
  return readings;
}

/** The exact expectation, over every outcome of a rune's remaining events. */
function exactExpectation(candidate) {
  const { future, scoring } = candidate;
  const lines = future.held.map((line) => ({ ...line }));
  let total = 0;
  const score = () => craftedScore(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore);
  const additions = (left, used, weight) => {
    if (left === 0) { total += weight * score(); return; }
    const free = [...future.pool.keys()].filter((index) => !used.has(index));
    for (const index of free) {
      const interval = future.poolInitial[index];
      const width = interval.maximum - interval.minimum + 1;
      for (let roll = interval.minimum; roll <= interval.maximum; roll += 1) {
        lines.push({ statId: future.pool[index], value: roll, grind: 0, gemmed: false });
        used.add(index);
        additions(left - 1, used, weight / free.length / width);
        used.delete(index);
        lines.pop();
      }
    }
  };
  const upgrades = (left, weight) => {
    if (left === 0) { additions(future.additions, new Set(), weight); return; }
    for (let at = 0; at < future.held.length; at += 1) {
      const interval = future.heldUpgrade[at];
      const width = interval.maximum - interval.minimum + 1;
      for (let roll = interval.minimum; roll <= interval.maximum; roll += 1) {
        lines[at].value += roll;
        upgrades(left - 1, weight / future.held.length / width);
        lines[at].value -= roll;
      }
    }
  };
  upgrades(future.held.length > 0 ? future.upgrades : 0, 1);
  const ratio = total / candidate.ceiling;
  return candidate.rune.ancient ? ratio : Math.min(1, ratio);
}

/* Both a strict and a lenient setting: the strict one leaves most runes with no passing
   reading, so it exercises the fallback; the lenient one gives many runes several
   passing readings, so it exercises the choice between them. */
const scenarios = [
  ['default', defaultRunePotentialSettings],
  ['lenient', { ...defaultRunePotentialSettings, runeQuality: 1, powerUpPolicy: 1 }],
];
let exactChecked = 0;
let choseAmongPassing = 0;
let movedFromBestCase = 0;
for (const [label, settings] of scenarios) {
  const advice = await runeAdvice(runes, roles, settings, base);
  /* Below +12 a rune is held to the fresh-rune balance, so the floor is asked per level. */
  const floors = slotFloorMaxValues(roles, settings, base);
  const bar = chanceThresholds[settings.powerUpPolicy - 1];
  const scope = newRuneAdviceScope();
  for (const rune of runes) {
    const row = advice.get(rune.id);
    const qualityVerdict = row.unprotectedAdvice?.verdict ?? row.verdict;
    const readings = readingsOf(rune, settings, floors, scope);
    if (readings.length === 0) { check(row.role === null, `${label} ${rune.id}: a role named with no reading`); continue; }
    for (const reading of readings) {
      check(reading.rawExpected <= reading.rawMax + 1e-12,
        `${label} ${rune.id} ${reading.role.name}: expectation ${reading.rawExpected} above Max value ${reading.rawMax}`);
      check(reading.expected <= reading.bound + 1e-12,
        `${label} ${rune.id} ${reading.role.name}: expectation ${reading.expected} above its bound ${reading.bound}`);
    }
    const passing = readings.filter((reading) => reading.passesValue && reading.chance >= bar);
    const pool = passing.length > 0 ? passing : readings;
    const top = [...pool].sort((left, right) => right.expected - left.expected
      || right.maxValue - left.maxValue || right.value - left.value || right.chance - left.chance
      || left.role.id.localeCompare(right.role.id))[0];
    if (passing.length > 0) {
      choseAmongPassing += 1;
      check(passing.some((reading) => reading.role.id === row.role?.id && reading.maxValue === row.maxValue),
        `${label} ${rune.id}: Best role ${row.role?.name} is not one of the readings that pass`);
      check(qualityVerdict !== 'sell', `${label} ${rune.id}: sold although a reading passes`);
    } else {
      check(qualityVerdict === 'sell', `${label} ${rune.id}: kept although no reading passes`);
    }
    check(row.role?.id === top.role.id && row.maxValue === top.maxValue && row.chance === top.chance,
      `${label} ${rune.id}: chose ${row.role?.name} ${row.maxValue}, the highest expectation is `
      + `${top.role.name} ${top.maxValue} (${top.expected})`);
    const bestCase = [...pool].sort((left, right) => right.maxValue - left.maxValue)[0];
    if (bestCase.role.id !== top.role.id) movedFromBestCase += 1;

    if (label === 'default' && (rune.level === 6 || rune.level === 9)) {
      for (const reading of readings) {
        const exact = exactExpectation(reading.candidate);
        exactChecked += 1;
        check(Math.abs(exact - reading.rawExpected) < 0.005,
          `${rune.id} ${reading.role.name}: expectation ${reading.rawExpected} against exact ${exact}`);
      }
    }
  }
}

console.log(`Best role: ${runes.length} runes x ${scenarios.length} settings; `
  + `${choseAmongPassing} chosen among passing readings, ${movedFromBestCase} where the best case would name another role; `
  + `${exactChecked} expectations against exact enumeration.`);
assert.ok(choseAmongPassing > 0, 'no rune had a passing reading, so promise 1 was never exercised');
assert.ok(movedFromBestCase > 0, 'no rune was one the best case would have judged differently');
assert.equal(failures, 0, `${failures} check(s) failed`);
console.log('PASS');
