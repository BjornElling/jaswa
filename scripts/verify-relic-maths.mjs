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
 * The rates are drawn deliberately uneven, never flat: the recursion has to be
 * right for the per-level curve the game publishes, and a flat test would pass
 * on a model that had quietly collapsed to a single rate.
 *
 * Usage: node --import ./scripts/json-module-hook.mjs scripts/verify-relic-maths.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relicAdvice, relicOvertakeThresholds } from '../app/domain/relics/relic-advice.ts';
/* Imported from the model itself, not through the advice module's re-exports:
   this file's job is to check that implementation, so it names it directly. */
import {
  relicExpectedLevel, relicExpectedStrength,
  relicFinalLevelChances, relicLanding, relicNextAttemptChance, relicReachChance,
} from '../app/domain/relics/relic-power-up-model.ts';
import {
  relicMaximumDurability, relicMaximumLevel, relicNextLevelStrengthGain, relicOrdinaryLevelStrengthGain,
  relicPowerUpRates, relicStrengthIndex, relicThreshold,
} from '../app/domain/relics/relic-properties.ts';
import { relicProperties } from '../app/domain/relics/relic-properties.ts';
import { defaultRelicSynergy, relicSynergy, relicSynergyBandOrder } from '../app/domain/relics/relic-synergy.ts';
import { relicSynergyWeights } from '../app/domain/relics/relic-advice.ts';

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

/* A tier attempt buys the main level and the unique-property step together.
   The advice score is normalised against an ordinary level, so these ratios are
   the precise extra incentive rather than an arbitrary tier bonus. */
const ordinaryGain = relicNextLevelStrengthGain(7, 'ATK');
const atkTierGain = relicNextLevelStrengthGain(8, 'ATK');
const spdTierGain = relicNextLevelStrengthGain(8, 'SPD');
check(Math.abs(relicOrdinaryLevelStrengthGain - ordinaryGain) < 1e-12,
  'an ordinary level is the unit used by the investment score');
check(atkTierGain > ordinaryGain * 2 && spdTierGain > ordinaryGain * 2,
  `a successful tier crossing is worth ${Math.min(atkTierGain, spdTierGain) / ordinaryGain}× an ordinary level or more`);
const sharpConquest = relicProperties.find((property) => property.id === 1);
if (!sharpConquest) throw new Error('Sharp Conquest must exist for the tier-score check.');
const relicAt = (level, id) => ({
  id,
  mainProperty: 'ATK',
  mainPercent: 3 + level,
  unique: { definition: sharpConquest, threshold: relicThreshold(level, sharpConquest.per), percent: 1 },
  level,
  durability: 3,
  locked: false,
  obtainedOrder: Number(id),
});
const tierAdvice = relicAdvice([relicAt(7, '7'), relicAt(8, '8')], 1, defaultRelicSynergy);
const beforeTier = tierAdvice.get('7')?.investmentScore ?? 0;
const onTier = tierAdvice.get('8')?.investmentScore ?? 0;
check(onTier > beforeTier,
  `an Excellent +8 → +9 tier scores ${Math.round(onTier)} % above the ${Math.round(beforeTier)} % +7 → +8 step despite its lower chance`);

const equalOlder = relicAt(9, '9');
const equalNewer = relicAt(9, '10');
equalOlder.durability = 0;
equalNewer.durability = 0;
const equalAdvice = relicAdvice([equalOlder, equalNewer], 5, defaultRelicSynergy);
check(equalAdvice.get('9')?.verdict === 'keep' && equalAdvice.get('10')?.verdict === 'sell',
  'equal spent duplicates keep only the lower-rid incumbent');

/* §8 rule 2's duplicate gate. It compares the plain overtake chance against a
   per-band threshold, so the verdict is decidable from the figure the row
   already prints — and it must not move with the slider, which is the whole
   reason it is a separate gate. */
for (const [band, threshold] of Object.entries(relicOvertakeThresholds)) {
  let highest = -1;
  for (let incumbent = 0; incumbent <= 14; incumbent += 1) {
    if (relicReachChance(0, 3, incumbent + 1) >= threshold) highest = incumbent;
  }
  const at = relicReachChance(0, 3, highest + 1);
  const beyond = relicReachChance(0, 3, highest + 2);
  check(at >= threshold && beyond < threshold,
    `a ${band} challenger tries up to a +${highest} incumbent (${(at * 100).toFixed(1)} %) `
    + `and stops at +${highest + 1} (${(beyond * 100).toFixed(1)} %)`);
}
/* The thresholds must be ordered, or a worse pairing would be allowed a longer
   shot than a better one. */
const overtakeOrder = relicSynergyBandOrder.map((band) => relicOvertakeThresholds[band]);
check(overtakeOrder.every((value, at) => at === 0 || value > overtakeOrder[at - 1]),
  'a weaker fit must be held to a higher overtake chance than a stronger one');

/* The gate is blind to the slider. One challenger, five settings, one verdict. */
const duplicateIncumbent = relicAt(12, '11');
const duplicateChallenger = relicAt(0, '12');
const verdicts = new Set([1, 2, 3, 4, 5].map((stop) =>
  relicAdvice([duplicateIncumbent, duplicateChallenger], stop, defaultRelicSynergy).get('12')?.verdict));
check(verdicts.size === 1 && verdicts.has('sell'),
  'a hopeless duplicate sells at every slider stop, the boldest included');

/* The one modelling choice in the strength index is how the two halves are
   weighted. This holds the ordering the stones rest on — a full relic's
   expected gain is larger the lower it stands — at every weighting from
   all-main to all-unique. It does not re-decide the verdicts: the next-attempt
   score is normalised by an ordinary level's gain, which is zero when the
   unique half carries all the weight, so the advice is only defined at the
   shipped equal weighting.

   The synergy weight is read from the band itself; reading `.band` off the
   string `relicSynergy` returns once made every product NaN and every
   comparison false, so this check passed without measuring anything. */
let orderingStable = true;
for (const property of relicProperties) {
  for (const main of ['HP', 'ATK', 'DEF']) {
    const weight = relicSynergyWeights[relicSynergy(defaultRelicSynergy, main, property.id)];
    if (!(weight > 0)) throw new Error(`No synergy weight for ${main} on relic property ${property.id}.`);
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

/* ---- Durability, as its own subject -------------------------------------
   The recursions are only as good as their handling of the resource that
   stops them. These hold the three tables to what durability means, rather
   than to each other: a spent relic has no future, a first attempt is worth
   more than a later one, and no relic can land below where it stands. */
let durabilitySound = true;
let spentIsPresent = true;
let nextAttemptSound = true;
for (const rates of [relicPowerUpRates, flat]) {
  for (let level = 0; level <= relicMaximumLevel; level += 1) {
    /* d = 0 is the one case with no arithmetic in it at all: the relic is
       exactly what it is, with certainty, and can reach nothing above it. */
    const spent = relicFinalLevelChances(level, 0, rates);
    if (Math.abs(spent[level] - 1) > 1e-12) spentIsPresent = false;
    if (level < relicMaximumLevel && relicReachChance(level, 0, level + 1, rates) !== 0) spentIsPresent = false;
    if (relicNextAttemptChance(level, 0, rates) !== 0) nextAttemptSound = false;
    if (level < relicMaximumLevel
      && relicNextAttemptChance(level, 1, rates) !== rates[level]) nextAttemptSound = false;

    for (let durability = 0; durability <= 8; durability += 1) {
      const chances = relicFinalLevelChances(level, durability, rates);
      /* No mass below where the relic already stands: the level never falls. */
      for (let at = 0; at < level; at += 1) if (chances[at] > 1e-15) durabilitySound = false;
      /* An extra attempt is never a loss, and its value never grows. */
      const here = relicExpectedLevel(chances);
      const more = relicExpectedLevel(relicFinalLevelChances(level, durability + 1, rates));
      const evenMore = relicExpectedLevel(relicFinalLevelChances(level, durability + 2, rates));
      if (more < here - 1e-12) durabilitySound = false;
      if ((evenMore - more) > (more - here) + 1e-12) durabilitySound = false;
      if (relicReachChance(level, durability + 1, relicMaximumLevel, rates)
        < relicReachChance(level, durability, relicMaximumLevel, rates) - 1e-15) durabilitySound = false;
    }
  }
}
/* A relic at the ceiling is finished whatever durability it has left. */
if (relicNextAttemptChance(relicMaximumLevel, 3) !== 0) nextAttemptSound = false;
check(spentIsPresent, 'a relic with no durability is worth exactly what it is, and can reach nothing above it');
check(nextAttemptSound, 'the next attempt is the published rate, or zero where there is no attempt to make');
check(durabilitySound,
  'durability is counted exactly: never a landing below the start, never a loss from one more attempt, '
  + 'and never an increasing return from it');

/* ---- What an adversarial review found ------------------------------------
   Two independent reviews were set on this model with instructions to break
   it. Neither could produce a wrong number on a valid relic. Both found the
   same two ways to produce one on an invalid input, and these are the checks
   that keep those shut. */

/* A target above the ceiling. The duplicate gate asks for `incumbent + 1`, so
   it asks for +16 whenever the incumbent is a finished copy — a real call on a
   real account. It answered 0 only because the published table has fifteen
   entries and the sixteenth read back `undefined`; one entry longer and the
   relic climbed to a +16 the game has no room for. */
check(relicReachChance(9, 3, relicMaximumLevel + 1) === 0,
  'a target above +15 is unreachable, and says so from the ceiling rather than from an array length');

/* A malformed curve. The recursions take `rates` precisely so a check can swap
   it, which makes a truncated or out-of-range table the mistake that will
   actually be made — and it used to return a well-formed distribution summing
   to 1 with its mass in the wrong place. */
const rejects = (what, rates) => {
  try {
    relicFinalLevelChances(0, 3, rates);
    relicReachChance(0, 3, relicMaximumLevel, rates);
    relicNextAttemptChance(0, 3, rates);
    return false;
  } catch {
    return true;
  }
};
const malformed = [
  ['truncated', [1, 1, 1, 0.8]],
  ['empty', []],
  ['one too long', [...relicPowerUpRates, 0.1]],
  ['a rate above 1', relicPowerUpRates.map((rate, at) => at === 14 ? 2 : rate)],
  ['a negative rate', relicPowerUpRates.map((rate, at) => at === 5 ? -0.1 : rate)],
  ['a NaN rate', relicPowerUpRates.map((rate, at) => at === 5 ? NaN : rate)],
];
check(malformed.every(([what, rates]) => rejects(what, rates)),
  'a malformed power-up curve is refused outright rather than answered plausibly');
/* And the curves the checks above legitimately drive it with must still pass. */
check([relicPowerUpRates, flat, new Array(relicMaximumLevel).fill(1), new Array(relicMaximumLevel).fill(0),
  Array.from({ length: relicMaximumLevel }, (_, at) => 0.45 + at * 0.03)]
  .every((rates) => !rejects('legitimate', rates)),
  'every curve these checks drive the model with is still accepted');

/* ---- The mechanic itself, simulated -------------------------------------
   Every check above compares the recursions with closed forms or with each
   other, so all of them share the same reading of the game. This one does
   not: it plays the loop the power-up panel actually runs — roll, and on a
   failure spend one durability — and asks whether the tables predicted it.
   A seeded generator keeps the run reproducible, so a failure here is a real
   disagreement rather than an unlucky afternoon. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const random = seeded(20260916);
const runs = 200_000;
let worstSimulated = 0;
for (const [level, durability] of [[0, 3], [0, 1], [5, 2], [8, 3], [11, 3], [12, 1], [9, 2]]) {
  const counts = new Array(relicMaximumLevel + 1).fill(0);
  for (let run = 0; run < runs; run += 1) {
    let at = level;
    let left = durability;
    while (at < relicMaximumLevel && left > 0) {
      if (random() < (relicPowerUpRates[at] ?? 0)) at += 1;
      else left -= 1;
    }
    counts[at] += 1;
  }
  const predicted = relicFinalLevelChances(level, durability);
  for (let at = 0; at <= relicMaximumLevel; at += 1) {
    worstSimulated = Math.max(worstSimulated, Math.abs(predicted[at] - counts[at] / runs));
  }
}
/* Four sampling standard deviations at this run count. A real modelling error
   — a mis-spent durability, an off-by-one on the ceiling — moves a cell by
   percentage points, which is orders of magnitude clear of this bar. */
const simulationBar = 4 * 0.5 / Math.sqrt(runs);
check(worstSimulated < simulationBar,
  `playing the game's own loop ${runs.toLocaleString('en-GB')} times per case agrees with the tables `
  + `(worst cell ${worstSimulated.toExponential(2)}, sampling bar ${simulationBar.toExponential(2)})`);

/* ---- One implementation, and only one -----------------------------------
   The arithmetic above is worth nothing if a second copy of it grows up
   somewhere else: the page would then state two chances for one relic, and
   the wrong one would be whichever the reader happened to be looking at. The
   model is the single source of truth by rule, and this is the rule. */
const modelModule = 'relic-power-up-model.ts';
const allowedToHoldRates = new Set(['domain/relics/relic-properties.ts', 'domain/relics/relic-power-up-model.ts']);
/* Every app layer is scanned. The Math is the one deliberate exception because it
   quotes the published table to explain it; it is not another product reader. */
const appDirectory = fileURLToPath(new URL('../app/', import.meta.url));
const theMathPrefix = 'features/the-math/';
const offenders = [];
for (const entry of readdirSync(appDirectory, { recursive: true }).map((name) => String(name).split(sep).join('/'))) {
  if (entry.startsWith(theMathPrefix)) continue;
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry) || allowedToHoldRates.has(entry)) continue;
  const source = readFileSync(join(appDirectory, entry), 'utf8');
  /* Naming the table in an import says nothing about what a file does with it,
     and an import list spans lines, so the whole statement goes before the scan
     rather than being pattern-matched line by line. */
  const body = source.replace(/^(import|export)\b[\s\S]*?from\s+'[^']*';$/gm, '');
  /* Reading the table is the tell. Every re-derivation has to start there, and
     nothing else has a reason to touch it: a caller that wants a chance asks
     the model for one. Carrying the rates onward is fine — a default parameter
     and a hand-off to the model are the curve travelling as an argument, not
     arithmetic being done with it. */
  body.split('\n').forEach((line, at) => {
    if (!line.includes('relicPowerUpRates')) return;
    /* Every mention has to be the whole curve moving somewhere as one value:
       assigned as a default, or handed to a call. What it must never be is the
       subject of anything — a subscript, an operator, a `for … of`, a method —
       because that is the file deriving a probability of its own.

       Stated as what is allowed rather than as what is forbidden, so a form
       nobody thought of fails the check instead of slipping through it. */
    const allowed = /=\s*relicPowerUpRates\s*(?=[,)]|$)|[(,]\s*relicPowerUpRates\s*(?=[,)]|$)/g;
    if (line.replace(allowed, '').includes('relicPowerUpRates')) {
      offenders.push(`${entry}:${at + 1}`);
    }
  });
}
check(offenders.length === 0,
  offenders.length === 0
    ? `only ${modelModule} derives power-up probabilities; nothing else reads the rate table`
    : `power-up rates are read outside ${modelModule}: ${offenders.join(', ')}`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nRelic arithmetic holds.');
process.exitCode = failures ? 1 : 0;
