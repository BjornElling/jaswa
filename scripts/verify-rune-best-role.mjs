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
 * exceeds its own ceiling (`candidateExpectedBound`) or its Potential — the skip that
 * makes the choice affordable is only sound while that holds — and on runes with one or
 * two substat events left, the expectation agrees with an exact enumeration of every
 * outcome.
 *
 *   node --import ./scripts/json-module-hook.mjs scripts/verify-rune-best-role.mjs
 */
import assert from 'node:assert/strict';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import {
  chanceThresholds, readingAllowance, runeAdvice, runeRankWorth,
} from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import {
  candidateChanceAskAt, candidateExpectedBound, candidateExpectedValue, candidateMaxValue,
  newRuneAdviceScope, ordinarySample, prepareRuneCandidate, readingScale, roleBuilds, runeRuns,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import {
  populationBar, populationShare, qualityReferences, referenceSampleSize,
} from '../app/domain/runes/cleanup/rune-quality-reference.ts';
import { slotMainProperties } from '../app/domain/runes/rune-properties.ts';
import { countJobs } from '../app/domain/runes/rune-power-up-outcomes.ts';
import { runeScaleStars } from '../app/domain/runes/rune-substat-weights.ts';
import { craftedScore, rulerCraftCredit } from '../app/domain/runes/craft/rune-craft-end-state.ts';

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

/**
 * Every drop of the slot as one role reads it in the candidate's position (§9.1):
 * each main the role puts here in a build that matches the candidate's other slots,
 * on the candidate's ruler, and every other main as a drop worth nothing.
 */
function slotPopulationOf(slot, candidate, role, line, builds, scope, references) {
  const parts = [];
  let zeros = 0;
  for (const main of slotMainProperties[slot]) {
    const position = main === candidate.main || ![2, 4, 6].includes(slot) || candidate.build.mains[slot] === 0
      ? candidate.build
      : builds.find((build) => build.mains[slot] === main
        && [2, 4, 6].every((at) => at === slot || build.mains[at] === candidate.build.mains[at]));
    const scale = position && readingScale(role, position, line, slot, main, scope);
    if (!scale) { zeros += referenceSampleSize; continue; }
    const { scores } = references.get({ slot, stars: runeScaleStars, main }, scale.prices, scope.ruler);
    parts.push({ scores, scale: main === candidate.main ? 1 : candidate.ceiling / scale.ceiling });
  }
  return { parts, zeros };
}

/** Every reading the engine weighs for one rune, rebuilt as `runeAdvice` builds them. */
function readingsOf(rune, settings, scope, references) {
  const credit = settings.craftCredit;
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
    for (const candidate of family) {
      const worth = runeRankWorth(settings, candidate.rank);
      const allowance = readingAllowance(settings, candidate.rank, false);
      const maxValue = candidateMaxValue(candidate) * worth;
      const expected = candidateExpectedValue(candidate, () => (runs ??= runeRuns(candidate.future)));
      let share = 2;
      let chance = 0;
      if (allowance !== null) {
        const { prices } = candidate.scoring;
        const reference = slotPopulationOf(rune.slot, candidate, role, line, builds, scope, references);
        if (candidate.best > 0) share = populationShare(reference, candidate.best);
        const step = candidateChanceAskAt(candidate, populationBar(reference, allowance, prices));
        chance = step.job ? countJobs([step.job])[0] : step.settled;
      }
      readings.push({
        role, candidate, rank: candidate.rank, maxValue, share, chance, allowed: allowance !== null,
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
  const references = qualityReferences();
  const bar = chanceThresholds[settings.powerUpPolicy - 1];
  const scope = newRuneAdviceScope(rulerCraftCredit);
  for (const rune of runes) {
    const row = advice.get(rune.id);
    const qualityVerdict = row.unprotectedAdvice?.verdict ?? row.verdict;
    const readings = readingsOf(rune, settings, scope, references);
    if (readings.length === 0) { check(row.role === null, `${label} ${rune.id}: a role named with no reading`); continue; }
    for (const reading of readings) {
      check(reading.rawExpected <= reading.rawMax + 1e-12,
        `${label} ${rune.id} ${reading.role.name}: expectation ${reading.rawExpected} above Potential ${reading.rawMax}`);
      check(reading.expected <= reading.bound + 1e-12,
        `${label} ${rune.id} ${reading.role.name}: expectation ${reading.expected} above its bound ${reading.bound}`);
    }
    const permitted = readings.filter((reading) => reading.allowed);
    const contributing = permitted.filter((reading) => reading.chance > 0);
    const cleared = row.chance >= bar;
    const pool = cleared ? contributing : permitted.length ? permitted : readings;
    const top = [...pool].sort((left, right) => right.expected - left.expected
      || right.maxValue - left.maxValue || left.share - right.share || right.chance - left.chance
      || left.role.id.localeCompare(right.role.id)
      || left.candidate.build.mains[2] - right.candidate.build.mains[2]
      || left.candidate.build.mains[4] - right.candidate.build.mains[4]
      || left.candidate.build.mains[6] - right.candidate.build.mains[6])[0];
    check(Math.max(0, ...permitted.map(({ chance }) => chance)) <= row.chance
      && row.chance <= Math.min(1, permitted.reduce((total, { chance }) => total + chance, 0)),
      `${label} ${rune.id}: union outside the marginal bounds`);
    if (cleared) choseAmongPassing += 1;
    check(cleared === (qualityVerdict !== 'sell'), `${label} ${rune.id}: verdict disagrees with the union`);
    check(row.role?.id === top.role.id && row.maxValue === top.maxValue && (row.readingChance ?? 0) === top.chance,
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
