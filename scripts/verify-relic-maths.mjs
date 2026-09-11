#!/usr/bin/env node

/**
 * Proves the three relic recursions are exact (`docs/RELIC-CANONICAL.md` §7).
 *
 * Every verdict on the Relics page is `a synergy weight × one of these numbers`,
 * so if a recursion is wrong the whole page is wrong in a way no screenshot
 * would show. `P` is checked against the closed forms derived independently of
 * it, and the other two against `P` and against each other:
 *
 * ```
 * P(l,1) = Π p_i
 * P(l,2) = (Π p_i)·[1 + Σ q_j]
 * P(l,3) = (Π p_i)·[1 + Σ q_i + Σ q_i² + Σ_{i<j} q_i q_j]
 * ```
 *
 * The `q_i²` term is the one a hand-written version drops: two failures can
 * land on the same level, so the sum is over multisets and not over pairs.
 *
 * The rates are drawn deliberately uneven, never flat. Today the app fills the
 * table with one pooled estimate, but the recursion has to be right for the
 * per-level curve the game actually uses, and a flat test would pass on a
 * model that had quietly collapsed to a single rate.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-maths.mjs
 */
import {
  relicExpectedLevel, relicExpectedStrength, relicFinalLevelChances, relicLanding, relicReachChance,
} from '../app/lib/relic-advice.ts';
import {
  relicMaximumDurability, relicMaximumLevel, relicPowerUpRates, relicStrengthIndex, relicThreshold,
} from '../app/lib/relic-properties.ts';
import { relicProperties } from '../app/lib/relic-properties.ts';
import { relicSynergy } from '../app/lib/relic-synergy.ts';
import { relicSynergyWeights } from '../app/lib/relic-advice.ts';

let failures = 0;
function check(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

/** Success on every remaining level, with no failure at all. */
function noFailures(rates, level) {
  return rates.slice(level, relicMaximumLevel).reduce((product, rate) => product * rate, 1);
}

/** The closed form for one durability, written out rather than recursed. */
function closedForm(rates, level, durability) {
  if (level >= relicMaximumLevel) return 1;
  if (durability <= 0) return 0;
  const clean = noFailures(rates, level);
  const q = rates.slice(level, relicMaximumLevel).map((rate) => 1 - rate);
  if (durability === 1) return clean;
  const once = q.reduce((sum, value) => sum + value, 0);
  if (durability === 2) return clean * (1 + once);
  let pairs = 0;
  for (let i = 0; i < q.length; i += 1) for (let j = i + 1; j < q.length; j += 1) pairs += q[i] * q[j];
  const squares = q.reduce((sum, value) => sum + value * value, 0);
  return clean * (1 + once + squares + pairs);
}

/* The published table, written out here so a change to the shipped one has to
   be a deliberate change to this check as well. */
const published = [1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1];
check(relicPowerUpRates.length === relicMaximumLevel
  && relicPowerUpRates.every((rate, at) => rate === published[at]),
  'the shipped power-up rates are the game’s published table');

/* The shape of that table is the whole economics of a relic, so the two facts
   that follow from it are held here rather than left to a comment. */
check(relicReachChance(0, relicMaximumDurability, relicMaximumLevel, relicPowerUpRates) < 0.0005,
  `a fresh relic reaches +15 about once in ${Math.round(1 / relicReachChance(0, 3, 15, relicPowerUpRates)).toLocaleString('en')} tries`);
const fresh = relicExpectedStrength(0, 3, 'ATK') - relicStrengthIndex(0, 'ATK');
const high = relicExpectedStrength(12, 3, 'ATK') - relicStrengthIndex(12, 'ATK');
check(fresh > high * 5,
  `power-up stones buy ${(fresh / high).toFixed(0)}× more on a +0 relic than on a +12 one`);

/* The threshold tiers. A power-up moves the unique half by cutting the
   threshold, never by raising the percentage, and the three source stats do not
   move together: over the fifteen levels ATK, DEF and MAX HP multiply by 5 and
   SPD by only 3, against the main property's 6. */
let tiersSound = true;
for (const source of ['ATK', 'DEF', 'HP', 'SPD']) {
  for (let level = 1; level <= relicMaximumLevel; level += 1) {
    if (relicThreshold(level, source) > relicThreshold(level - 1, source)) tiersSound = false;
  }
  /* Steps every three levels and nowhere else. */
  for (let level = 0; level < relicMaximumLevel; level += 1) {
    const stepped = relicThreshold(level, source) !== relicThreshold(level + 1, source);
    if (stepped !== ((level + 1) % 3 === 0)) tiersSound = false;
  }
}
check(tiersSound, 'the threshold falls, and only at +3, +6, +9, +12 and +15');
check(relicThreshold(0, 'HP') === 18 * relicThreshold(0, 'ATK')
  && relicThreshold(relicMaximumLevel, 'HP') === 18 * relicThreshold(relicMaximumLevel, 'ATK'),
  'the MAX HP thresholds are exactly 18× the ATK/DEF ones');
const growth = (source) => relicStrengthIndex(relicMaximumLevel, source, 0) / relicStrengthIndex(0, source, 0);
check(Math.abs(growth('ATK') - 5) < 1e-9 && Math.abs(growth('SPD') - 3) < 1e-9,
  `a unique property grows ×${growth('ATK')} on ATK/DEF/MAX HP and ×${growth('SPD')} on SPD, against the main property's ×6`);

/* The one modelling choice in the strength index is how the two halves are
   weighted. It is only a defensible choice if the answers do not turn on it, so
   every pair is re-decided at every weighting from all-main to all-unique and
   the power-up ordering has to survive. */
let orderingStable = true;
for (const property of relicProperties) {
  for (const main of ['HP', 'ATK', 'DEF']) {
    const weight = relicSynergyWeights[relicSynergy(main, property.id).band];
    const at = (share) => [0, 3, 6, 9, 12].map((level) =>
      weight * (relicExpectedStrength(level, 3, property.per, relicPowerUpRates, share)
        - relicStrengthIndex(level, property.per, share)));
    const reference = at(0.5);
    for (const share of [0, 0.25, 0.75, 1]) {
      const other = at(share);
      for (let i = 1; i < reference.length; i += 1) {
        /* Stones must always be worth more on the lower relic, whatever the
           weighting. That is the ordering every verdict rests on. */
        if (other[i] > other[i - 1] || reference[i] > reference[i - 1]) orderingStable = false;
      }
    }
  }
}
check(orderingStable,
  'the power-up ordering holds at every weighting of the two halves, from all-main to all-unique');

/* A stated seed, so a failure is reproducible and a pass is not one lucky draw. */
let state = 20260911;
const nextRandom = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };

const trials = 200;
let worstReach = 0;
for (let trial = 0; trial < trials; trial += 1) {
  const rates = Array.from({ length: relicMaximumLevel }, () => 0.2 + 0.75 * nextRandom());
  for (let level = 0; level <= relicMaximumLevel; level += 1) {
    for (let durability = 0; durability <= relicMaximumDurability; durability += 1) {
      const recursed = relicReachChance(level, durability, relicMaximumLevel, rates);
      worstReach = Math.max(worstReach, Math.abs(recursed - closedForm(rates, level, durability)));
    }
  }
}
check(worstReach < 1e-12,
  `P(l,d) matches the closed forms over ${trials} uneven rate curves (worst gap ${worstReach.toExponential(2)})`);

/* The worked example from the brief, computed by hand at the top level. */
const example = Array.from({ length: relicMaximumLevel }, (_, level) => 0.5 + level * 0.02);
const byHand = example[13] * (1 - (1 - example[14]) ** 2) + (1 - example[13]) * example[13] * example[14];
check(Math.abs(relicReachChance(13, 2, relicMaximumLevel, example) - byHand) < 1e-12,
  'P(13,2) matches p₁₃·[1 − (1 − p₁₄)²] + (1 − p₁₃)·p₁₃·p₁₄ exactly');

/* The boundaries that separate the two recursions, and the monotonicity that
   is the whole reason the second one exists: a relic can only be worth more
   for having another attempt in hand, at any level. */
const flat = Array.from({ length: relicMaximumLevel }, () => 0.762);
let boundaries = true;
let monotone = true;
for (const source of ['ATK', 'SPD']) {
  for (let level = 0; level <= relicMaximumLevel; level += 1) {
    const stopped = relicExpectedStrength(level, 0, source, flat);
    if (Math.abs(stopped - relicStrengthIndex(level, source)) > 1e-12) boundaries = false;
    for (let durability = 1; durability <= relicMaximumDurability; durability += 1) {
      if (relicExpectedStrength(level, durability, source, flat)
        < relicExpectedStrength(level, durability - 1, source, flat) - 1e-12) monotone = false;
    }
    if (level < relicMaximumLevel && relicExpectedStrength(level, relicMaximumDurability, source, flat)
      > relicExpectedStrength(level + 1, relicMaximumDurability, source, flat) + 1e-12) monotone = false;
  }
}
check(boundaries, 'V(l,0) is the relic’s realised strength on both halves');
check(monotone, 'V never falls when a level or an attempt is added');

/* The case that makes two recursions necessary rather than one. */
const spentHigh = relicExpectedStrength(12, 0, 'ATK', flat);
check(relicReachChance(12, 0, relicMaximumLevel, flat) === 0 && spentHigh > 0.7,
  `a +12 with no durability is worth ${(100 * spentHigh).toFixed(0)} % of a finished relic while its P(+15) is 0`);

check(Math.abs(relicExpectedLevel(relicFinalLevelChances(15, 0, flat)) - relicMaximumLevel) < 1e-12,
  'a finished relic reads back as exactly +15');

/* The third recursion carries the whole landing distribution, and the other two
   are readings of it: its mass on +15 is P, and its mean is V. Three
   recursions written from three sets of boundaries have to agree, and if one
   drifts this is what says so. */
let worstMass = 0;
let worstAgainstReach = 0;
let worstAgainstStrength = 0;
let medianSound = true;
for (const rates of [flat, Array.from({ length: relicMaximumLevel }, (_, at) => 0.45 + at * 0.03)]) {
  for (let level = 0; level <= relicMaximumLevel; level += 1) {
    for (let durability = 0; durability <= relicMaximumDurability; durability += 1) {
      const chances = relicFinalLevelChances(level, durability, rates);
      worstMass = Math.max(worstMass, Math.abs(chances.reduce((sum, value) => sum + value, 0) - 1));
      worstAgainstReach = Math.max(worstAgainstReach,
        Math.abs(chances[relicMaximumLevel] - relicReachChance(level, durability, relicMaximumLevel, rates)));
      const mean = chances.reduce((sum, value, at) => sum + value * relicStrengthIndex(at, 'ATK'), 0);
      worstAgainstStrength = Math.max(worstAgainstStrength,
        Math.abs(mean - relicExpectedStrength(level, durability, 'ATK', rates)));
      const landing = relicLanding(chances);
      /* A median never reports a level the relic cannot reach, and its tail is
         the first one to cross a half. */
      const tail = chances.slice(landing.level).reduce((sum, value) => sum + value, 0);
      const above = chances.slice(landing.level + 1).reduce((sum, value) => sum + value, 0);
      if (landing.level < level || Math.abs(tail - landing.chance) > 1e-12
        || (tail < 0.5 && landing.level !== 0) || (above >= 0.5 && landing.level < relicMaximumLevel)) {
        medianSound = false;
      }
    }
  }
}
check(worstMass < 1e-12, `the landing distribution always sums to 1 (worst gap ${worstMass.toExponential(2)})`);
check(worstAgainstReach < 1e-12, 'its mass on +15 is exactly P(l,d)');
check(worstAgainstStrength < 1e-12, 'its mean strength is exactly V(l,d)');
check(medianSound, 'the reported landing level is the first whose tail reaches a half');

console.log(failures ? `\n${failures} check(s) failed.` : '\nRelic arithmetic holds.');
process.exitCode = failures ? 1 : 0;
