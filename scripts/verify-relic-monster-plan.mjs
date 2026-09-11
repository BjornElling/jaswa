#!/usr/bin/env node

/**
 * Proves the "Use for mons" plan keeps the promises `docs/RELIC-CANONICAL.md`
 * §11 makes for it.
 *
 * Five of them are checkable without a browser, and every one has failed in
 * some earlier draft of this model:
 *
 * 1. **Exactly one answer per monster** (§11.1) — including for a monster the
 *    statistics have never heard of, which is the case a scoring model quietly
 *    drops.
 * 2. **The limit gates and never queues** (§11.5) — every monster is told its
 *    own best relic, and is routed to the next best only once the import's own
 *    counts say the game would refuse the engraving. Checked against a roster
 *    several times larger than the limit, which is where a reserving pass and
 *    this one visibly disagree.
 * 3. **Display filters never enter the calculation** (§11.6) — a row must read
 *    identically computed alone and computed beside the whole roster, down to
 *    one monster in isolation.
 * 4. **Suitability scales strength rather than adding to it** (§11.4.1) —
 *    re-run on the exact case that settled it, so the additive model cannot
 *    creep back in without this failing.
 * 5. **The tiers and the floor hold their stated shape** (§11.2) — monotone,
 *    bounded, and never zero, which is what lets §11.1's promise be kept.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-monster-plan.mjs
 */
import {
  relicEngravingLimit, relicMainPercent, relicStrengthIndex, relicThreshold,
} from '../app/lib/relic-properties.ts';
import {
  allocateRelicEngravings, assertRelicAllocation, relicMainUsageTier, relicMonsterScore,
  relicSuitability, relicSynergySuitability, relicUniqueUsageTier, relicUsageTierCredits,
  relicSuitabilityWeights, relicUsagePriors,
} from '../app/lib/relic-monster-fit.ts';
import { relicSynergyBandOrder } from '../app/lib/relic-synergy.ts';
import { relicUsageObservations, relicUsageStatistics } from '../app/lib/relic-monster-statistics.ts';

let failures = 0;
function check(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

/** A relic as `readRelic` would have produced it, for the fields this model reads. */
function relic(id, mainProperty, propertyId, per, level) {
  return {
    id: String(id),
    mainProperty,
    mainPercent: relicMainPercent(level),
    unique: {
      definition: { id: propertyId, grants: 'DMG dealt', per, name: `test-${propertyId}` },
      threshold: relicThreshold(level, per),
      percent: 1,
    },
    level,
    durability: 3,
    locked: false,
    obtainedOrder: id,
  };
}

/* One usage panel, stated rather than read, so the tier boundaries are exercised
   at values chosen for them instead of wherever the dataset happens to sit. */
function usage(mainShares, uniqueShares, observations = 5000) {
  return {
    mainShares,
    uniqueShares: new Map(Object.entries(uniqueShares).map(([id, share]) => [Number(id), share])),
    mainObservations: observations,
    uniqueObservations: observations,
  };
}

console.log('\nthe usage tiers (§11.2)');

check(relicMainUsageTier(0.40) === 'preferred' && relicMainUsageTier(0.3999) === 'plausible'
  && relicMainUsageTier(0.20) === 'plausible' && relicMainUsageTier(0.1999) === 'unwanted',
  'a main property tiers at exactly 40 % and 20 %, inclusive at the boundary');
check(relicUniqueUsageTier(0.20) === 'preferred' && relicUniqueUsageTier(0.1999) === 'plausible'
  && relicUniqueUsageTier(0.10) === 'plausible' && relicUniqueUsageTier(0.0999) === 'unwanted',
  'a unique property tiers at exactly 20 % and 10 %, the main cuts halved');

/* Monotone in the share: a property nobody engraves less often than another
   can never earn more credit. It is the one property of the tiers that a future
   edit could break without any single boundary looking wrong. */
let monotone = true;
for (let share = 0; share <= 1.0001; share += 0.001) {
  const nextShare = Math.min(1, share + 0.001);
  if (relicUsageTierCredits[relicMainUsageTier(nextShare)] < relicUsageTierCredits[relicMainUsageTier(share)]
    || relicUsageTierCredits[relicUniqueUsageTier(nextShare)] < relicUsageTierCredits[relicUniqueUsageTier(share)]) {
    monotone = false;
  }
}
check(monotone, 'credit never falls as the observed share rises');

const credits = Object.values(relicUsageTierCredits);
check(credits.every((credit) => credit > 0 && credit <= 1),
  'every tier credit is above zero and at most one, so no relic can score zero (§11.1)');

const bands = relicSynergyBandOrder.map((band) => relicSynergySuitability[band]);
check(bands.every((value, index) => index === 0 || value < bands[index - 1]),
  'the five synergy bands are strictly decreasing, exceptional first');
check(bands.every((value) => value > 0 && value <= 1), 'every band is above zero and at most one');

const weightTotal = relicSuitabilityWeights.main + relicSuitabilityWeights.unique
  + relicSuitabilityWeights.synergy;
check(Math.abs(weightTotal - 1) < 1e-12, `the three suitability weights sum to 1 (they sum to ${weightTotal})`);

/* The floor is structural: all three terms bottom out together, so the worst
   possible fit is the bottom credit itself and never zero. */
const worst = relicSuitability(relic(1, 'DEF', 4, 'ATK', 0), usage({ HP: 1, ATK: 0, DEF: 0 }, { 4: 0 }));
check(Math.abs(worst.fit - relicUsageTierCredits.unwanted) < 1e-12,
  `the worst possible fit is ${relicUsageTierCredits.unwanted}, not zero (it is ${worst.fit.toFixed(3)})`);
const best = relicSuitability(relic(1, 'HP', 14, 'SPD', 0), usage({ HP: 1, ATK: 0, DEF: 0 }, { 14: 1 }));
check(Math.abs(best.fit - 1) < 1e-12, `the best possible fit is exactly 1 (it is ${best.fit.toFixed(3)})`);

console.log('\nsuitability scales strength (§11.4.1)');

/* The case that settled the form of the model. A is a +6 ATK relic whose main
   and unique the population favours on this monster; B is a +15 DEF relic whose
   main it does not. An additive 0.50·S + 0.30·F + 0.20·Y recommends B. */
const atkMonster = usage({ HP: 0.30, ATK: 0.55, DEF: 0.15 }, { 1: 0.35, 2: 0.12 });
const a = relic(1, 'ATK', 1, 'ATK', 6);
const b = relic(2, 'DEF', 2, 'DEF', 15);
const fitA = relicSuitability(a, atkMonster);
const fitB = relicSuitability(b, atkMonster);
const scoreA = relicMonsterScore(a, fitA);
const scoreB = relicMonsterScore(b, fitB);
check(scoreA > scoreB,
  `a +6 relic the monster's players favour beats a +15 relic they do not `
  + `(${scoreA.toFixed(3)} to ${scoreB.toFixed(3)})`);

const additiveA = 0.5 * relicStrengthIndex(a.level, 'ATK') + 0.3 * fitA.fit + 0.2 * fitA.synergy;
const additiveB = 0.5 * relicStrengthIndex(b.level, 'DEF') + 0.3 * fitB.fit + 0.2 * fitB.synergy;
check(additiveB > additiveA,
  `the rejected additive model decides the same case the other way, which is why it was rejected `
  + `(${additiveB.toFixed(3)} to ${additiveA.toFixed(3)})`);

/* A finished relic is still respected: break-even against that mediocre +15 sits
   between +3 and +6, so an almost undeveloped perfect relic does not win. */
const perfectLow = relic(3, 'ATK', 1, 'ATK', 3);
check(relicMonsterScore(perfectLow, relicSuitability(perfectLow, atkMonster)) < scoreB,
  'a perfectly suited +3 relic still loses to a mediocre +15, so strength is not ignored');

console.log('\nthe engraving limit gates rather than queues (§11.5)');

/* A roster far larger than the limit, with one relic that suits every monster —
   the shape §11.3's measurement says to expect. Nothing is reserved, so every
   monster is told that same best relic until the account's own count says the
   game would refuse it. */
const relics = [
  relic(10, 'HP', 14, 'SPD', 15),
  relic(11, 'HP', 14, 'SPD', 9),
  relic(12, 'ATK', 1, 'ATK', 6),
];
/* Larger than everything the account could engrave, so the pass has to leave
   some monsters unanswered and say so rather than quietly overfilling a relic. */
const rosterSize = relicEngravingLimit * relics.length + 17;
const panel = usage({ HP: 0.60, ATK: 0.30, DEF: 0.10 }, { 14: 0.45, 1: 0.15 });
const subjects = Array.from({ length: rosterSize }, (_, index) => ({
  monsterId: `unit-${index}`,
  monsterOrder: index,
  masterId: 'stated',
  wornRelicIds: [],
}));
const plan = allocateRelicEngravings(subjects, relics, new Map(), () => panel);
assertRelicAllocation(plan, subjects);

check(plan.recommendations.size === rosterSize,
  `every one of ${rosterSize} monsters gets an answer (${plan.recommendations.size} did)`);
const answers = [...plan.recommendations.values()];
check(answers.every((entry) => entry.chosen?.relic.id === '10'),
  'with nothing engraved yet, every monster is told the account\'s best relic and none is displaced');
check(answers.every((entry) => entry.limit === 'none'),
  'so no row claims a capacity reason it does not have');

/* The other half of §11.5. A relic already at its limit stays available to the
   monsters wearing it and to nobody else — the reason the gate cannot simply be
   "is this relic full" — and everyone else is routed to their next best. */
const incumbents = subjects.slice(0, 4).map((subject) => ({ ...subject, wornRelicIds: ['10'] }));
const scope = [...incumbents, ...subjects.slice(4, 10)];
const tight = allocateRelicEngravings(scope, relics, new Map([['10', relicEngravingLimit]]), () => panel);
assertRelicAllocation(tight, scope);
check(incumbents.every((subject) => tight.recommendations.get(subject.monsterId)?.chosen?.relic.id === '10'),
  'a relic at its limit is still recommended to every monster already wearing it');
const routed = subjects.slice(4, 10).map((subject) => tight.recommendations.get(subject.monsterId));
check(routed.every((entry) => entry?.chosen?.relic.id === '11' && entry?.limit === 'capacity'),
  'and every other monster is routed to its next best, with the capacity reason on the row');
check(routed.every((entry) => entry?.ideal?.relic.id === '10'),
  'while the row still remembers which relic it would rather have had');

/* Nothing goes unanswered merely because the account is crowded: only a
   genuinely full set of relics can produce "No capacity". */
const everythingFull = allocateRelicEngravings(
  subjects.slice(0, 3), relics,
  new Map(relics.map((entry) => [entry.id, relicEngravingLimit])),
  () => panel,
);
check([...everythingFull.recommendations.values()].every((entry) => entry.chosen === null),
  'a monster wearing nothing, with every relic full, reads "No capacity" rather than impossible advice');

console.log('\ndisplay filters never enter the calculation (§11.6)');

/* Two panels, so the roster is not uniform, and a limit small enough that the
   reserving pass this replaced would have produced different answers here. A row
   must read identically computed alone and computed beside the whole roster. */
const tightLimit = 5;
const mixed = Array.from({ length: 40 }, (_, index) => ({
  monsterId: `mixed-${index}`,
  monsterOrder: index,
  masterId: index % 2 ? 'atk' : 'hp',
  wornRelicIds: [],
}));
const panels = {
  hp: usage({ HP: 0.70, ATK: 0.20, DEF: 0.10 }, { 14: 0.40 }),
  atk: usage({ HP: 0.15, ATK: 0.65, DEF: 0.20 }, { 1: 0.30 }),
};
const whole = allocateRelicEngravings(mixed, relics, new Map(), (id) => panels[id], tightLimit);
const visible = mixed.filter((subject) => subject.monsterOrder % 3 === 0);
const filtered = allocateRelicEngravings(visible, relics, new Map(), (id) => panels[id], tightLimit);
const reading = (entry) => entry && JSON.stringify({
  relic: entry.chosen?.relic.id ?? null,
  fit: entry.chosen?.suitability.fit ?? null,
  score: entry.chosen?.score ?? null,
  limit: entry.limit,
});
const diverged = visible.filter((subject) =>
  reading(whole.recommendations.get(subject.monsterId))
    !== reading(filtered.recommendations.get(subject.monsterId)));
check(diverged.length === 0,
  `all ${visible.length} rows read identically computed alone and computed beside the whole roster `
  + `(${diverged.length} differed)`);
/* And one monster in isolation, the narrowest scope a filter can leave. */
const alone = allocateRelicEngravings([mixed[7]], relics, new Map(), (id) => panels[id], tightLimit);
check(reading(alone.recommendations.get(mixed[7].monsterId))
  === reading(whole.recommendations.get(mixed[7].monsterId)),
  'including a roster filtered down to a single monster');

console.log('\nthe statistics fall back honestly (§11.3)');

check(relicUsageStatistics('no-such-monster') === undefined,
  'a monster the dataset has never captured reports no statistics rather than empty ones');

/* A monster with no panel still gets exactly one relic, judged on synergy alone.
   A model that scored it zero would leave the row blank, which §11.1 forbids. */
const unknown = [{ monsterId: 'unknown', monsterOrder: 0, masterId: 'no-such-monster', wornRelicIds: [] }];
const fallback = allocateRelicEngravings(unknown, relics, new Map(), relicUsageStatistics);
const chosen = fallback.recommendations.get('unknown');
check(chosen?.chosen !== null && chosen?.chosen !== undefined,
  'a monster with no statistics still gets exactly one relic named');
check(chosen?.chosen?.suitability.status === 'missing'
  && chosen?.chosen?.suitability.mainShare === null,
  'and its fit says the statistics are missing rather than printing a share of nothing');

/* §11.3.2: a captured panel is read whatever its size, and the size travels
   with the reading instead of gating it. Camules is the monster that settled
   it — 88 engravings, two of its three main tiers decided well clear of a
   boundary, and a gate at 100 threw all three away. */
const camules = relicUsageStatistics('10815');
check(camules !== undefined && relicUsageObservations(camules) < 100,
  `Camules' panel is captured and smaller than the gate that used to reject it `
  + `(${camules ? relicUsageObservations(camules) : 0} engravings)`);
check(camules !== undefined && relicSuitability(relics[0], camules).status === 'measured',
  'and it is read as measured rather than falling back to the population prior');
check(camules !== undefined && relicSuitability(relics[0], camules).mainShare !== null,
  'so its observed shares reach the page instead of being withheld');
const small = usage({ HP: 1, ATK: 0, DEF: 0 }, { 14: 1 }, 3);
check(relicSuitability(relics[0], small).status === 'measured',
  'a panel is never refused for its size alone; the size is shown, not gated on');

console.log('\nthe fallback prior (§11.3.1)');

const priors = relicUsagePriors();
const priorValues = [...Object.values(priors.main), ...priors.unique.values()];
/* A mean of a thousand copies of 0.1 does not land on 0.1, so the bound is
   checked to floating-point tolerance rather than exactly. */
check(priorValues.every((value) => value >= relicUsageTierCredits.unwanted - 1e-12 && value <= 1),
  'every prior lies between the bottom tier credit and one, so it is a credit and not a share');
check(priors.unique.size === 16, `a prior exists for all sixteen unique properties (${priors.unique.size} do)`);
check(priors.main.HP > priors.main.ATK && priors.main.ATK > priors.main.DEF,
  `the mains order HP > ATK > DEF as the dataset has them `
  + `(${priors.main.HP.toFixed(3)} > ${priors.main.ATK.toFixed(3)} > ${priors.main.DEF.toFixed(3)})`);

/* The defect the prior replaced: with `F = Y` the same relic scored higher on a
   monster nobody has measured than on one whose players overwhelmingly favour
   it. Evidence must never lower the score of a relic the evidence supports. */
const favoured = relicUsageStatistics('17911');
const sharpConquest = relic(20, 'ATK', 1, 'ATK', 15);
const onFavoured = relicSuitability(sharpConquest, favoured);
const onUnknown = relicSuitability(sharpConquest, undefined);
check(onFavoured.status === 'measured' && onFavoured.mainTier === 'preferred',
  'the reference monster does favour that main, so the comparison means something');
check(onFavoured.fit > onUnknown.fit,
  `a measured monster that favours the relic beats an unmeasured one `
  + `(${onFavoured.fit.toFixed(3)} against ${onUnknown.fit.toFixed(3)})`);
check(Math.abs(onUnknown.fit - onUnknown.synergy) > 1e-9,
  'the fallback is not the synergy band on its own, which is the form that inverted the two');
check(onUnknown.mainShare === null && onUnknown.uniqueShare === null,
  'and it reports no observed share, because nothing was observed');

console.log(`\n${failures ? `${failures} check(s) failed` : 'every check passed'}`);
process.exit(failures ? 1 : 0);
