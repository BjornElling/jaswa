/**
 * Slot evenness across the Rune Clean-up policy, on fresh drops.
 *
 * `verify:rune-slot-neutrality` holds the finished `+15` box and the shipped
 * settings. This script holds the other half of `docs/RUNE-CLEANUP-MATH.md` §9.4:
 * a separate set of `+0` drops, judged by the shipped presets at both ends of Power-up
 * policy, Rune quality floor, Accepted and Broken, plus the middle stops, must be
 * recommended for power-up at about the same rate per usable main in every slot.
 * Pearson's χ² on five degrees of freedom and the odd/even ratio are the gates; the
 * most restrictive policy and floor together leave too few runes to measure, and
 * the most lenient corner must keep nearly everything.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { ordinarySample, presetBuilds } from '../app/lib/rune-cleanup-model.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import { countJobs } from '../app/lib/rune-power-up-outcomes.ts';

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 17, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
/* The holdout starts beyond every id used to fit SlotShares. Its complete
   main × grade × set coverage keeps the comparison about policy, not a lucky
   collection of sets. A second holdout checks the two difficult cases. */
const perSlot = 400;
const presets = defaultRunePotentialPresets();
const builds = presets.flatMap((preset) => presetBuilds(preset));
const scenarios = [
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
  const eligible = [1, 2, 3, 4, 5, 6].map((slot) => runes.filter((rune) => rune.slot === slot
    && (slot % 2 === 1 || builds.some((build) => build.mains[slot] === 0 || build.mains[slot] === rune.mainStatId))).length);
  const settings = {
    ...defaultRunePotentialSettings, powerUpPolicy, runeQuality, acceptedRunes, brokenRunes, keepMoreForLargerSets,
  };
  const result = await runeAdvice(runes, presets, settings, base,
    (jobs) => countJobs(jobs.map((job) => ({ ...job, runs: 512 }))));
  const counts = [1, 2, 3, 4, 5, 6].map((slot) => runes.filter((rune) => rune.slot === slot
    && result.get(rune.id)?.verdict === 'power-up').length);
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
  const scarce = powerUpPolicy === 5 && runeQuality === 5;
  const ceiling = powerUpPolicy === 1 && runeQuality === 1 && acceptedRunes === 1 && brokenRunes === 1;
  const oddRate = [0, 2, 4].reduce((sum, at) => sum + counts[at], 0)
    / [0, 2, 4].reduce((sum, at) => sum + eligible[at], 0);
  const evenRate = [1, 3, 5].reduce((sum, at) => sum + counts[at], 0)
    / [1, 3, 5].reduce((sum, at) => sum + eligible[at], 0);
  const parityRatio = Math.max(oddRate, evenRate) / Math.max(1e-9, Math.min(oddRate, evenRate));
  if (scarce ? total > 10 : ceiling ? rate < 0.98 : chi > 20.5 || parityRatio > 1.5) {
    console.error(`${label}: slot rates exceed the holdout's sampling allowance.`);
    failures += 1;
  }
}
if (failures > 0) process.exitCode = 1;
else console.log(`\nPASS: ${scenarios.length} policy settings keep every slot's fresh drops at an even rate.`);
