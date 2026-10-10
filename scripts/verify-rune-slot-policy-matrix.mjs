/**
 * Complete-funnel slot evenness on an independent holdout of mixed-grade drops.
 * All original mains remain in the denominator. Each slider stop and the extreme
 * combinations use +0 -> +9 -> +12, with early Sell removing the body permanently.
 * Pearson's chi-square tests non-sparse survivors; sparse results are explicitly
 * unmeasured. All 625 settings additionally hold floor and preference monotonicity.
 */
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { ordinarySample } from '../app/lib/rune-cleanup-model.ts';
import { runeAdvice, qualityThresholds, slotFloorMaxValues } from '../app/lib/rune-cleanup-advice.ts';
import { countJobs } from '../app/lib/rune-power-up-outcomes.ts';

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 17, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
/* The holdout starts beyond every id used to fit RuneFloorCalibration. Its complete
   main × grade × set coverage keeps the comparison about policy, not a lucky
   collection of sets. A second holdout checks the two difficult cases. */
const perSlot = Number(process.env.JASWA_BALANCE_RUNES ?? 400);
if (!Number.isInteger(perSlot) || perSlot <= 0) throw new Error('JASWA_BALANCE_RUNES must be a positive integer.');
const roles = defaultRuneRoles();

const middle = { powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 3, brokenRunes: 3, offset: 50_000 };
const scenarios = [
  ...['powerUpPolicy', 'runeQuality', 'acceptedRunes', 'brokenRunes'].flatMap((field) =>
    [1, 2, 3, 4, 5].map((value) => ({ ...middle, [field]: value }))),
  ...[1, 5].flatMap((powerUpPolicy) => [5, 1].flatMap((runeQuality) =>
    [[1, 1], [1, 5], [5, 1], [5, 5]].map(([acceptedRunes, brokenRunes]) =>
      ({ powerUpPolicy, runeQuality, acceptedRunes, brokenRunes, offset: 50_000 })))),
  { powerUpPolicy: 3, runeQuality: 5, acceptedRunes: 3, brokenRunes: 3, offset: 50_000 },
  { powerUpPolicy: 3, runeQuality: 4, acceptedRunes: 3, brokenRunes: 3, offset: 50_000 },
  { powerUpPolicy: 1, runeQuality: 5, acceptedRunes: 5, brokenRunes: 5, offset: 60_000 },
  { powerUpPolicy: 3, runeQuality: 5, acceptedRunes: 3, brokenRunes: 3, offset: 60_000 },
  { powerUpPolicy: 3, runeQuality: 4, acceptedRunes: 3, brokenRunes: 3, offset: 60_000 },
  /* The balance is measured on the shipped set weights, so the preference turned
     off must hold as well. */
  { powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 3, brokenRunes: 3, offset: 50_000, keepMoreForLargerSets: false },
  { powerUpPolicy: 5, runeQuality: 1, acceptedRunes: 5, brokenRunes: 5, offset: 50_000, keepMoreForLargerSets: false },
];
let failures = 0;
for (const { powerUpPolicy, runeQuality, acceptedRunes, brokenRunes, offset, keepMoreForLargerSets = true } of scenarios) {
  const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) => ordinarySample(slot, 6, perSlot, 0, 'drop', offset));
  const eligible = [1, 2, 3, 4, 5, 6].map(() => perSlot);
  const settings = {
    ...defaultRunePotentialSettings, powerUpPolicy, runeQuality, acceptedRunes, brokenRunes, keepMoreForLargerSets,
  };
  const checkpoints = [runes, ...[9, 12].map((level) => [1, 2, 3, 4, 5, 6].flatMap((slot) => ordinarySample(slot, 6, perSlot, level, 'drop', offset)))];
  const result = await runeAdvice(checkpoints.flat(), roles, settings, base,
    (jobs) => countJobs(jobs.map((job) => ({ ...job, runs: 512 }))));
  const counts = [1, 2, 3, 4, 5, 6].map((slot) => runes.filter((rune, index) => rune.slot === slot
    && result.get(rune.id)?.verdict === 'power-up'
    && result.get(checkpoints[1][index]?.id)?.verdict === 'power-up'
    && result.get(checkpoints[2][index]?.id)?.verdict === 'keep').length);
  const rate = counts.reduce((sum, count) => sum + count, 0) / eligible.reduce((sum, count) => sum + count, 0);
  const chi = counts.reduce((sum, count, at) => {
    const expected = eligible[at] * rate;
    return expected > 0 && expected < eligible[at] ? sum + (count - expected) ** 2 / expected
      + (count - expected) ** 2 / (eligible[at] - expected) : sum;
  }, 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const rates = counts.map((count, at) => count / eligible[at]);
  const label = `policy ${powerUpPolicy}, floor ${runeQuality}, accepted ${acceptedRunes}, broken ${brokenRunes},`
    + ` 4-sets ${keepMoreForLargerSets ? 'kept more' : 'even'}, seed ${offset}`;
  console.log(`${label}: ${rates.map((value) => (100 * value).toFixed(1)).join(' / ')} %; ${total} kept; chi2 ${chi.toFixed(1)}`);
  const scarce = total < 30;
  const oddRate = [0, 2, 4].reduce((sum, at) => sum + counts[at], 0)
    / [0, 2, 4].reduce((sum, at) => sum + eligible[at], 0);
  const evenRate = [1, 3, 5].reduce((sum, at) => sum + counts[at], 0)
    / [1, 3, 5].reduce((sum, at) => sum + eligible[at], 0);
  console.log(`  odd/even ratio: ${(Math.max(oddRate, evenRate) / Math.max(1e-9, Math.min(oddRate, evenRate))).toFixed(2)}${scarce ? "; sparse — balance unmeasured" : ""}`);
  if (scarce ? false : chi > 20.5) {
    console.error(`${label}: slot rates exceed the holdout's sampling allowance.`);
    failures += 1;
  }
}
if (failures > 0) process.exitCode = 1;
else console.log(`\nPASS: ${scenarios.length} complete funnels; sparse results explicitly unmeasured.`);

/* All 625 combinations must preserve the quality anchor and inherit every less
   demanding neighbour. This covers settings the stochastic holdout does not cross. */
const grid = new Map();
let combinations = 0;
for (let quality = 1; quality <= 5; quality += 1) {
  for (let policy = 1; policy <= 5; policy += 1) {
    for (let accepted = 1; accepted <= 5; accepted += 1) {
      for (let broken = 1; broken <= 5; broken += 1) {
        const values = slotFloorMaxValues(roles, { ...defaultRunePotentialSettings,
          runeQuality: quality, powerUpPolicy: policy, acceptedRunes: accepted, brokenRunes: broken }, base);
        const key = (q, p, a, b) => `${q}|${p}|${a}|${b}`;
        const neighbours = [grid.get(key(quality - 1, policy, accepted, broken)),
          grid.get(key(quality, policy - 1, accepted, broken)), grid.get(key(quality, policy, accepted - 1, broken)),
          grid.get(key(quality, policy, accepted, broken - 1))];
        if (!values.every((value, at) => Number.isFinite(value) && value >= qualityThresholds[quality - 1]
          && neighbours.every((previous) => !previous || value >= previous[at]))) {
          console.error(`Non-monotone floor at ${key(quality, policy, accepted, broken)}`);
          process.exitCode = 1;
        }
        grid.set(key(quality, policy, accepted, broken), values);
        combinations += 1;
      }
    }
  }
}
console.log(`${combinations} settings combinations preserve minimum quality and stricter-choice floors.`);
