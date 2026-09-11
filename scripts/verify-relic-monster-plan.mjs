#!/usr/bin/env node

/**
 * Proves the "Use for mons" plan keeps the promises `docs/RELIC-CANONICAL.md`
 * §11 makes for it.
 *
 * Every one of these has failed in some earlier draft of this model:
 *
 * 1. **Exactly one answer per monster** (§11.1) — including for a monster the
 *    statistics have never heard of, which is the case a scoring model quietly
 *    drops.
 * 2. **The limit gates and never queues** (§11.5) — every monster is told its
 *    own best relic, and is routed to the next best only once the import's own
 *    counts say the game would refuse the engraving. Checked against a roster
 *    several times larger than the limit, which is where a reserving pass and
 *    this one visibly disagree.
 * 3. **Display filters never enter the calculation** (§11.6) — a row's verdict,
 *    fit and score must read identically computed alone and computed beside the
 *    whole roster, down to one monster in isolation. The capacity annotation is
 *    the single stated exception, and this checks that it is the only one.
 * 4. **Suitability scales strength rather than adding to it** (§11.4.1) —
 *    re-run on the exact case that settled it, so the additive model cannot
 *    creep back in without this failing.
 * 5. **The usage credit is continuous, monotone and bounded** (§11.2) — the
 *    property the hard tiers it replaced did not have.
 * 6. **Sample size enters the model and not only the tooltip** (§11.3.2) — a
 *    thin panel is weighed against the population rather than trusted whole or
 *    thrown away.
 * 7. **A recommendation is never churn** (§11.5.2) — an engraving is asked for
 *    only when it buys something, and never to swap two equal relics.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-monster-plan.mjs
 */
import {
  relicEngravingLimit, relicMainPercent, relicStrengthIndex, relicThreshold,
} from '../app/lib/relic-properties.ts';
import {
  allocateRelicEngravings, assertRelicAllocation, rankRelicsForMonster, relicMonsterScore,
  relicReplacementMargin, relicSuitability, relicSuitabilityWeights, relicSynergySuitability,
  relicUsageCredit, relicUsageCreditExponent, relicUsageCreditFloor,
} from '../app/lib/relic-monster-fit.ts';
import { relicSynergyBandOrder } from '../app/lib/relic-synergy.ts';
import {
  relicPopulationShares, relicShrunkShares, relicUsageObservations, relicUsageShrinkage,
  relicUsageStatistics,
} from '../app/lib/relic-monster-statistics.ts';

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

/* One usage panel, stated rather than read, so the curve is exercised at values
   chosen for it instead of wherever the dataset happens to sit. */
function usage(mainShares, uniqueShares, observations = 5000) {
  return {
    mainShares,
    uniqueShares: new Map(Object.entries(uniqueShares).map(([id, share]) => [Number(id), share])),
    mainObservations: observations,
    uniqueObservations: observations,
  };
}

console.log('\nthe usage credit is a curve, not three steps (§11.2)');

check(relicUsageCredit(1, 1) === 1, "a monster's own leading option always reads exactly 1");
check(Math.abs(relicUsageCredit(0, 1) - relicUsageCreditFloor) < 1e-12,
  `a property nobody chooses reads the floor, ${relicUsageCreditFloor}`);
check(relicUsageCredit(2, 1) === 1, 'a share above the leader cannot exceed 1, whatever rounding produces it');
check(relicUsageCredit(0.5, 0) === relicUsageCreditFloor,
  'a leader of zero yields the floor rather than dividing by it');

/* Monotone and continuous, which is the whole reason the steps were replaced.
   The tiers moved by 0.40 at a single share; nothing here may move by more than
   its own slope across a thousandth of the range. */
let monotone = true;
let biggestJump = 0;
let previous = relicUsageCredit(0, 1);
for (let share = 0; share <= 1.0001; share += 0.0005) {
  const value = relicUsageCredit(Math.min(1, share), 1);
  if (value < previous - 1e-12) monotone = false;
  biggestJump = Math.max(biggestJump, value - previous);
  previous = value;
}
check(monotone, 'credit never falls as the observed share rises');
check(biggestJump < 0.01,
  `and never jumps: the largest step across the whole range is ${biggestJump.toFixed(4)}, `
  + 'against the 0.40 a tier boundary moved');

/* The bottom stays punitive, which is what §11.2 asks of it and what a straight
   line would give away. */
const fifth = relicUsageCredit(0.2, 1);
check(fifth < 0.2,
  `a property chosen a fifth as often as the leader earns ${fifth.toFixed(3)}, `
  + 'not the 0.28 a straight line would hand it');
check(relicUsageCreditExponent > 1, 'which requires an exponent above one');

/* The pair the tiers were defended on, at the shares the real dataset carries
   for it. Both clear 40 %, so the steps score both 1.00 and separate nothing. */
const leaderShare = 0.507;
const runnerUp = 0.402;
const separation = relicUsageCredit(leaderShare, leaderShare) - relicUsageCredit(runnerUp, leaderShare);
check(separation > 0.3,
  `a 50.7 % main and a 40.2 % main on one monster are separated by ${separation.toFixed(2)}, `
  + 'where the tiers scored both 1.00');

console.log('\nthe three suitability signals (§11.4)');

const bands = relicSynergyBandOrder.map((band) => relicSynergySuitability[band]);
check(bands.every((value, index) => index === 0 || value < bands[index - 1]),
  'the five synergy bands are strictly decreasing, exceptional first');
check(bands.every((value) => value > 0 && value <= 1), 'every band is above zero and at most one');

const weightTotal = relicSuitabilityWeights.main + relicSuitabilityWeights.unique
  + relicSuitabilityWeights.synergy;
check(Math.abs(weightTotal - 1) < 1e-12, `the three suitability weights sum to 1 (they sum to ${weightTotal})`);
/* The measurement that moved the weight: 81.7 % of the unique term's variation
   is about which property it is rather than which monster. Its weight must not
   drift back above the main property's, which carries the opposite split. */
check(relicSuitabilityWeights.unique < relicSuitabilityWeights.main,
  'the unique term weighs less than the main term, as the variance decomposition requires '
  + `(${relicSuitabilityWeights.unique} against ${relicSuitabilityWeights.main})`);
check(relicSuitabilityWeights.synergy >= relicSuitabilityWeights.main + relicSuitabilityWeights.unique,
  'and synergy carries at least as much as the two empirical terms together, because it is the '
  + 'only term that judges the pair once the unique statistic is discounted');

/* The floor is a model assumption and the bounds are structural: all three terms
   bottom out at the same floor, so the worst fit is that floor and the best is
   exactly one. */
const flatPanel = usage({ HP: 1, ATK: 0, DEF: 0 }, { 14: 1 }, 1e9);
const worst = relicSuitability(relic(1, 'DEF', 4, 'ATK', 0), flatPanel);
check(Math.abs(worst.fit - relicUsageCreditFloor) < 1e-6,
  `the worst possible fit is the floor, ${relicUsageCreditFloor} (it is ${worst.fit.toFixed(4)})`);
const best = relicSuitability(relic(1, 'HP', 14, 'SPD', 0), flatPanel);
check(Math.abs(best.fit - 1) < 1e-6, `the best possible fit is exactly 1 (it is ${best.fit.toFixed(4)})`);

console.log('\nsuitability scales strength (§11.4.1)');

/* The case that settled the form of the model. A is a +6 ATK relic whose main
   and unique the population favours on this monster; B is a +15 DEF relic whose
   main it does not. The panel is stated to sit in the window where the two forms
   disagree, because that is the only place a contrast between them can be
   shown. */
const atkMonster = usage({ HP: 0.30, ATK: 0.55, DEF: 0.15 }, { 1: 0.35, 2: 0.20 });
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

console.log('\nsample size enters the model, not only the tooltip (§11.3.2)');

const population = relicPopulationShares();
check(population.unique.size >= 16, `the population prior covers all sixteen uniques (${population.unique.size})`);
const mainTotal = population.main.HP + population.main.ATK + population.main.DEF;
check(Math.abs(mainTotal - 1) < 1e-9, `the population's main shares are a distribution (they sum to ${mainTotal.toFixed(6)})`);
check(population.main.HP > population.main.ATK && population.main.ATK > population.main.DEF,
  `and order HP > ATK > DEF as the dataset has them (${population.main.HP.toFixed(3)} > `
  + `${population.main.ATK.toFixed(3)} > ${population.main.DEF.toFixed(3)})`);

/* n = 0 is the fallback, and it is the same arithmetic rather than a second
   model — the defect §11.3.1 records came from having two. */
const absent = relicShrunkShares(undefined);
check(Math.abs(absent.main.HP - population.main.HP) < 1e-12
  && Math.abs(absent.main.DEF - population.main.DEF) < 1e-12,
  'a monster with no panel is the n = 0 case and reads exactly the population');

const thin = usage({ HP: 0.90, ATK: 0.05, DEF: 0.05 }, { 14: 0.9, 1: 0.1 }, 20);
const thick = usage({ HP: 0.90, ATK: 0.05, DEF: 0.05 }, { 14: 0.9, 1: 0.1 }, 100000);
const thinShares = relicShrunkShares(thin);
const thickShares = relicShrunkShares(thick);
check(thinShares.main.HP < thickShares.main.HP && thinShares.main.HP < 0.90,
  `20 observations of a 90 % main are pulled toward the population (${(100 * thinShares.main.HP).toFixed(1)} %), `
  + `where 100,000 are not (${(100 * thickShares.main.HP).toFixed(1)} %)`);
check(Math.abs(thickShares.main.HP - 0.90) < 0.001,
  'a panel far larger than the shrinkage constant is left where it stands');
check(thinShares.main.HP > population.main.HP,
  'and the thin panel still moves the answer away from the population rather than being discarded');

/* The weight is exactly the sample size the abandoned gate named, and a panel of
   that size must land halfway. */
const halfway = usage({ HP: 1, ATK: 0, DEF: 0 }, { 14: 1 }, relicUsageShrinkage);
const halfwayShares = relicShrunkShares(halfway);
check(Math.abs(halfwayShares.main.HP - (1 + population.main.HP) / 2) < 1e-9,
  `a panel of exactly ${relicUsageShrinkage} engravings weighs equally with the population`);

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

console.log('\nthe gate does not defend the account\'s history (§11.5.1)');

/* A full relic worn by monsters that fit it badly, and one blocked monster that
   would fit it well. The plan still routes the blocked monster elsewhere — it
   does not reshuffle the roster — but the row must be able to say that
   unengraving one of the poor wearers is the move, rather than stopping at
   "it is full". */
const hpPanel = usage({ HP: 0.80, ATK: 0.10, DEF: 0.10 }, { 14: 0.50, 1: 0.10 });
const atkPanel = usage({ HP: 0.10, ATK: 0.80, DEF: 0.10 }, { 1: 0.50, 14: 0.10 });
const panelsBy = { hp: hpPanel, atk: atkPanel };
const nimble = relic(20, 'HP', 14, 'SPD', 15);
const sharp = relic(21, 'ATK', 1, 'ATK', 9);
const poorWearers = ['w1', 'w2'].map((id, index) => ({
  monsterId: id, monsterOrder: index, masterId: 'atk', wornRelicIds: ['20'],
}));
const wouldFitBetter = { monsterId: 'blocked', monsterOrder: 2, masterId: 'hp', wornRelicIds: [] };
const displaced = allocateRelicEngravings(
  [...poorWearers, wouldFitBetter], [nimble, sharp], new Map([['20', 2]]), (id) => panelsBy[id], 2,
);
const blockedRow = displaced.recommendations.get('blocked');
check(blockedRow?.limit === 'capacity' && blockedRow?.ideal?.relic.id === '20'
  && blockedRow?.chosen?.relic.id === '21',
  'a monster blocked by a full relic is still routed to its next best');
check(blockedRow?.displaceableWearers === 2,
  `and the row counts the wearers it would beat, so the reason names a move `
  + `(it counted ${blockedRow?.displaceableWearers})`);

/* The reverse: where every current wearer fits the relic better, there is
   nothing to displace and the row must not imply otherwise. */
const goodWearers = ['g1', 'g2'].map((id, index) => ({
  monsterId: id, monsterOrder: index, masterId: 'hp', wornRelicIds: ['20'],
}));
const noMove = allocateRelicEngravings(
  [...goodWearers, { monsterId: 'blocked', monsterOrder: 2, masterId: 'atk', wornRelicIds: [] }],
  [nimble, sharp], new Map([['20', 2]]), (id) => panelsBy[id], 2,
);
check(noMove.recommendations.get('blocked')?.displaceableWearers === 0,
  'and reports none where every wearer fits it better');

console.log('\na recommendation is never churn (§11.5.2)');

/* Equal scores: the relic the monster already wears must win the tie, or the
   row asks for an engraving that buys nothing at all. */
const twins = [relic(30, 'HP', 14, 'SPD', 9), relic(31, 'HP', 14, 'SPD', 9)];
const tieRanked = rankRelicsForMonster(twins, panel, new Set(['31']));
check(tieRanked[0].score === tieRanked[1].score && tieRanked[0].relic.id === '31',
  'between two relics that score exactly the same, the one already engraved ranks first');
check(rankRelicsForMonster(twins, panel).map((entry) => entry.relic.id).join() === '30,31',
  'and acquisition order still decides where nothing is worn');

/* A gain smaller than the margin is not worth an engraving; a real one is. The
   two levels are chosen inside one threshold tier and across one, so the only
   thing that changes is the size of the gain. */
const held = relic(40, 'ATK', 1, 'ATK', 13);
const slightly = relic(41, 'ATK', 1, 'ATK', 14);
const clearly = relic(42, 'ATK', 1, 'ATK', 15);
const wearer = [{ monsterId: 'm', monsterOrder: 0, masterId: 'atk', wornRelicIds: ['40'] }];
const smallGain = allocateRelicEngravings(wearer, [held, slightly], new Map(), () => atkPanel);
const bigGain = allocateRelicEngravings(wearer, [held, clearly], new Map(), () => atkPanel);
const smallRow = smallGain.recommendations.get('m');
const bigRow = bigGain.recommendations.get('m');
check(smallRow?.chosen?.relic.id === '40' && smallRow?.retained === true,
  `a relic that beats the incumbent by under ${(100 * relicReplacementMargin).toFixed(0)} % leaves it alone`);
check(smallRow?.ideal?.relic.id === '41' && smallRow?.limit === 'none',
  'while the row still remembers the better relic, and does not claim a capacity reason for it');
check(bigRow?.chosen?.relic.id === '42' && bigRow?.retained === false,
  'and a relic that clearly beats it is recommended');
check(relicReplacementMargin > 0 && relicReplacementMargin < 0.25,
  `the margin is a churn correction rather than a policy (${relicReplacementMargin})`);

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
  retained: entry.retained,
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

/* The capacity annotation is the stated exception, and this is what keeps it
   from growing quietly into a second one: every other field must survive the
   narrowing, and the annotation is checked separately above. */
const fields = new Set(Object.keys(whole.recommendations.get(mixed[7].monsterId) ?? {}));
const annotated = new Set(['displaceableWearers']);
const covered = new Set(['monsterId', 'chosen', 'ideal', 'alreadyEngraved', 'limit', 'retained',
  ...annotated]);
check([...fields].every((field) => covered.has(field)),
  `a recommendation carries no field this check has not classified as roster-independent or `
  + `annotation (${[...fields].filter((field) => !covered.has(field)).join(', ') || 'none unclassified'})`);

console.log('\nthe statistics fall back honestly (§11.3)');

check(relicUsageStatistics('no-such-monster') === undefined,
  'a monster the dataset has never captured reports no statistics rather than empty ones');

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
   it — 88 engravings, two of its three main readings decided well clear of any
   boundary, and a gate at 100 threw all three away. */
const camules = relicUsageStatistics('10815');
check(camules !== undefined && relicUsageObservations(camules) < 100,
  `Camules' panel is captured and smaller than the gate that used to reject it `
  + `(${camules ? relicUsageObservations(camules) : 0} engravings)`);
check(camules !== undefined && relicSuitability(relics[0], camules).status === 'measured',
  'and it is read as measured rather than falling back to the population');
check(camules !== undefined && relicSuitability(relics[0], camules).mainShare !== null,
  'so its observed shares reach the page instead of being withheld');
const smallPanel = usage({ HP: 1, ATK: 0, DEF: 0 }, { 14: 1 }, 3);
check(relicSuitability(relics[0], smallPanel).status === 'measured',
  'a panel is never refused for its size alone; the size is weighed, not gated on');

console.log('\nevidence never lowers the score of a relic it supports (§11.3.1)');

/* The defect the prior replaced: with `F = Y` the same relic scored higher on a
   monster nobody has measured than on one whose players overwhelmingly favour
   it. */
const favoured = relicUsageStatistics('17911');
const sharpConquest = relic(50, 'ATK', 1, 'ATK', 15);
const onFavoured = relicSuitability(sharpConquest, favoured);
const onUnknown = relicSuitability(sharpConquest, undefined);
check(onFavoured.status === 'measured' && (onFavoured.mainShare ?? 0) > 0.5,
  `the reference monster does favour that main, so the comparison means something `
  + `(${(100 * (onFavoured.mainShare ?? 0)).toFixed(0)} %)`);
check(onFavoured.fit > onUnknown.fit,
  `a measured monster that favours the relic beats an unmeasured one `
  + `(${onFavoured.fit.toFixed(3)} against ${onUnknown.fit.toFixed(3)})`);
check(Math.abs(onUnknown.fit - onUnknown.synergy) > 1e-9,
  'the fallback is not the synergy band on its own, which is the form that inverted the two');
check(onUnknown.mainShare === null && onUnknown.uniqueShare === null,
  'and it reports no observed share, because nothing was observed');

console.log(`\n${failures ? `${failures} check(s) failed` : 'every check passed'}`);
process.exit(failures ? 1 : 0);
