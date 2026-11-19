/**
 * Deterministic guard on the substat weights and on the perfect rune they define.
 *
 * `verify-rune-cleanup-calibration.mjs` answers whether the *chance* is right, by
 * simulation. It cannot answer the question this change raises, because a Monte
 * Carlo of the model's own score agrees with the model whatever the score means:
 * does a maximum Accuracy roll still price identically to a maximum CRI Dmg roll,
 * do a build's main properties actually come off the requirement, does a rune's own
 * set stay out of it, and does the rune the denominator describes really read 100 %.
 *
 * Every figure below is derived from the shipped roles and one fixed reference
 * line, so a failure is a change in the model and never a change in the data.
 */
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import {
  roleBuilds, prepareRuneCandidate, candidateMaxValue, newRuneAdviceScope,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { newSubstatWeightScope, substatWeights } from '../app/domain/runes/rune-substat-weights.ts';
import { mainPropertyMaximum, maximumRoll, slotMainProperties, subPropertyTargetStat } from '../app/domain/runes/rune-properties.ts';
import { runeStatIds, slotAllowsSubStat } from '../app/domain/runes/runes.ts';
import { canonicalCraftCredit, noCraftCredit } from '../app/domain/runes/craft/rune-craft-end-state.ts';

const base = { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 };
const supportBase = { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 };
const noCraft = noCraftCredit;
/* The ruler is the product's one canonical credit and no caller can choose another,
   so the scale is read the way the page reads it: the rune crafted with that credit
   too. A rune read bare is read against the same ruler and simply reads lower. */
const canonical = canonicalCraftCredit;

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
}
const close = (left, right, tolerance = 1e-9) => Math.abs(left - right) <= tolerance;

const roles = defaultRuneRoles();
const role = (id) => {
  const found = roles.find((entry) => entry.id === id);
  if (!found) throw new Error(`the shipped roles no longer contain ${id}`);
  return found;
};
const mainsOf = (build) => ({ 1: 3, 2: build.mains[2], 3: 5, 4: build.mains[4], 5: 1, 6: build.mains[6] });

/* ------------------------------------------------------- 1. the reported bug */

/**
 * The defect the weights exist to fix: Fast DD wants 215 SPD and 25 Accuracy, and
 * the old model priced a maximum roll of each identically because both targets were
 * positive. Nothing about the ladder below is arbitrary — it follows from the
 * requirements once the base and the build's mains are subtracted — but the *order*
 * is the claim the page makes, and it is held here.
 */
function verifyTargetsAreNotSwitches() {
  const fastDd = role('fast-dd');
  const build = roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const weights = substatWeights({ targets: fastDd.targets, mains: mainsOf(build), artifacts: fastDd.artifacts, base, credit: noCraft });
  const of = (stat) => weights.weights.get(stat) ?? 0;

  check(of('spd') > of('criDmg'), 'Fast DD: SPD should outweigh CRI Dmg.');
  check(of('criDmg') > of('acc'), 'Fast DD: CRI Dmg should outweigh Accuracy.');
  check(of('acc') > 0, 'Fast DD: a stated Accuracy target should still be worth something.');
  check(of('spd') / of('acc') > 3, 'Fast DD: SPD should outweigh Accuracy by a wide margin, not a whisker.');
  check(close(Math.max(...weights.rows.map((row) => row.weight)), 1),
    'the tightest target should weigh exactly 1 after normalisation.');
  check(weights.rows.every((row) => row.weight >= 0 && row.weight <= 1),
    'every weight should sit between 0 and 1.');
  console.log('Fast DD weights: ' + weights.rows.map((row) => `${row.stat} ${row.weight.toFixed(3)}`).join(', '));
}

/* ------------------------------------- 2. the build's own contribution comes off */

/** A build that puts HP % in two slots asks its runes for far less HP than one that
    does not, and the same rune is therefore worth different amounts to the two. */
function verifyMainsReduceTheRequirement() {
  const bomber = role('bomber');
  const mains = mainsOf(roleBuilds(bomber)[0]);
  const withHp = substatWeights({ targets: bomber.targets, mains: { ...mains, 4: 2, 6: 2 }, artifacts: bomber.artifacts, base, credit: noCraft });
  const withAtk = substatWeights({ targets: bomber.targets, mains: { ...mains, 4: 4, 6: 4 }, artifacts: bomber.artifacts, base, credit: noCraft });
  const hpRow = (weights) => weights.rows.find((row) => row.stat === 'hp');
  check(hpRow(withHp).needed < hpRow(withAtk).needed,
    'HP % main properties should reduce what the build still needs in HP.');
  check(hpRow(withHp).weight < hpRow(withAtk).weight,
    'a build that covers its HP with main properties should value HP sub properties less.');

  const atkRow = (weights) => weights.rows.find((row) => row.stat === 'atk');
  check(atkRow(withAtk).needed === 0 || atkRow(withAtk).weight < atkRow(withHp).weight,
    'ATK % main properties should reduce what an ATK sub property is worth.');
}

/**
 * A completed set's stat bonus must **not** reach the requirement.
 *
 * It is the tempting thing to do and it was done once: Fatal is +35 % ATK, so a Fatal
 * build genuinely needs less ATK from sub properties. The trouble is that the weights
 * are the yardstick a rune is measured against, so crediting the candidate's own set
 * gave every set a yardstick of its own — and a recommendation compares sets with each
 * other. `verify:rune-set-neutrality` measures what that cost; this holds the one line
 * of arithmetic that caused it.
 */
function verifySetsNeverReachTheRequirement() {
  const fastDd = role('fast-dd');
  const mains = mainsOf(roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4));
  const weights = substatWeights({ targets: fastDd.targets, mains, artifacts: fastDd.artifacts, base, credit: noCraft });
  const atk = weights.rows.find((row) => row.stat === 'atk');
  check(close(atk.fromBase + atk.fromMains + atk.fromArtifacts + atk.needed, atk.target),
    'base, mains, artifacts and the remaining need should account for the whole ATK target,'
    + ' with nothing else in it.');
  check(!('fromSet' in atk), 'a set contribution is still being carried in the requirement breakdown.');
  console.log(`Fast DD needs ${Math.round(atk.needed)} ATK from sub properties whatever set the rune is.`);
}

/**
 * The two artifacts engraved on a monster carry a flat main property each — HP +1,500, ATK
 * +100 or DEF +100 (`ARTIFACT-CANONICAL.md` §2) — and a role states which of the
 * three it wants. Whatever it names, two artifacts' worth comes off the
 * requirement and no more, spread evenly over the stats named.
 */
function verifyArtifactsComeOffTheRequirement() {
  const fastDd = role('fast-dd');
  const mains = mainsOf(roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4));
  const of = (artifacts) => substatWeights({ targets: fastDd.targets, mains, artifacts, base, credit: noCraft }).rows;
  const from = (rows, stat) => rows.find((row) => row.stat === stat)?.fromArtifacts ?? 0;

  const none = of({ atk: false, def: false, hp: false });
  const one = of({ atk: true, def: false, hp: false });
  const two = of({ atk: true, def: true, hp: false });
  const three = of({ atk: true, def: true, hp: true });

  check(from(none, 'atk') === 0, 'a role that names no artifact should have none credited.');
  check(from(one, 'atk') === 200, `one named stat should take both artifacts: ${from(one, 'atk')}, not 200.`);
  check(from(two, 'atk') === 100 && from(two, 'def') === 100,
    'two named stats should take one artifact each.');
  check(close(from(three, 'atk'), 200 / 3) && close(from(three, 'hp'), 3000 / 3),
    'three named stats should split two artifacts evenly, at each stat\'s own magnitude.');
  check(from(three, 'hp') > from(three, 'atk'),
    'an HP artifact is +1,500 against ATK\'s +100 and must not be credited as if it were +100.');

  const atkRow = (rows) => rows.find((row) => row.stat === 'atk');
  check(atkRow(one).needed === atkRow(none).needed - 200,
    'a named ATK artifact should lower what the build still needs in ATK by exactly its 200.');
  check(atkRow(one).weight < atkRow(none).weight,
    'a role whose artifacts already find ATK should value ATK sub properties less.');
  console.log(`Artifacts: Fast DD's ATK need falls from ${Math.round(atkRow(none).needed)}`
    + ` to ${Math.round(atkRow(one).needed)}, and its ATK weight from ${atkRow(none).weight.toFixed(3)}`
    + ` to ${atkRow(one).weight.toFixed(3)}.`);
}

/**
 * The credited Grindstones come off the requirement, on as many lines as the
 * requirement puts in the build: a small need is met by a line or two and brings a
 * stone or two, a large one puts the stat on every line that may hold it and every
 * one of those is ground. Nothing a stone cannot touch moves, and with no stone
 * credited nothing moves at all.
 */
function verifyGrindstonesComeOffTheRequirement() {
  const fastDd = role('fast-dd');
  const mains = mainsOf(roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4));
  const ground = { gem: null, gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero' };
  const of = (credit) => substatWeights({ targets: fastDd.targets, mains, artifacts: fastDd.artifacts, base, credit });
  const bare = of(noCraft);
  const withStones = of(ground);
  const row = (weights, stat) => weights.rows.find((entry) => entry.stat === stat);

  for (const entry of bare.rows) {
    check(entry.fromGrindstones === 0 && entry.groundLines === 0 && entry.rollsToRoll === entry.rollsNeeded,
      `${entry.stat}: with no Grindstone credited, the stones should find nothing.`);
  }
  for (const entry of withStones.rows) {
    check(close(entry.rollsToRoll + entry.fromGrindstones, entry.rollsNeeded),
      `${entry.stat}: the rolls and the stones should account for the whole requirement.`);
    check(entry.rollsToRoll >= 0, `${entry.stat}: the stones found more than the role needed.`);
  }
  for (const stat of ['criRate', 'criDmg', 'acc']) {
    check(row(withStones, stat).fromGrindstones === 0 && close(row(withStones, stat).tightness, row(bare, stat).tightness),
      `${stat} takes no Grindstone and its requirement should not move.`);
  }
  for (const stat of ['spd', 'atk', 'hp', 'def']) {
    check(row(withStones, stat).fromGrindstones > 0, `${stat}: the credited stones should find some of it.`);
    check(row(withStones, stat).tightness < row(bare, stat).tightness,
      `${stat}: a requirement the stones help with should be looser.`);
  }
  /* SPD is eighteen max rolls and has one effect id on all six slots, so the build
     carries it on every rune and every one of them is ground. DEF is under two, so
     a line or two does. */
  const spd = row(withStones, 'spd');
  check(close(spd.groundLines, 6), `a large SPD need should put SPD on all six lines, not ${spd.groundLines.toFixed(2)}.`);
  const def = row(withStones, 'def');
  check(def.groundLines > 0 && def.groundLines < 2, `a small DEF need should use a line or two, not ${def.groundLines.toFixed(2)}.`);
  check(of(ground).weights.get('criRate') > bare.weights.get('criRate'),
    'with the grindable stats relieved, CRI Rate should weigh more against the tightest target.');
  console.log(`Grindstones: SPD ${spd.groundLines.toFixed(2)} lines find ${spd.fromGrindstones.toFixed(2)} of`
    + ` ${spd.rollsNeeded.toFixed(2)} rolls; DEF ${def.groundLines.toFixed(2)} lines find`
    + ` ${def.fromGrindstones.toFixed(2)} of ${def.rollsNeeded.toFixed(2)}.`);
}

/** A target already met without a single sub property asks the runes for nothing. */
function verifyMetTargetsAskForNothing() {
  const noSpdBruiser = role('no-spd-bruiser');
  const build = roleBuilds(noSpdBruiser)[0];
  const weights = substatWeights({ targets: noSpdBruiser.targets, mains: mainsOf(build), artifacts: noSpdBruiser.artifacts, base, credit: noCraft });
  const spd = weights.rows.find((row) => row.stat === 'spd');
  check(spd === undefined, "No-spd bruiser's cleared SPD target should not enter the weight table.");

  /* And the degenerate case that would otherwise leave a role unable to judge
     anything: every target met, so every stat the role names is scored alike. */
  const met = substatWeights({ targets: { spd: 1, acc: 1 }, mains: mainsOf(build), artifacts: noSpdBruiser.artifacts, base, credit: noCraft });
  check(met.degenerate, 'a role whose every target is already met should report the degenerate case.');
  check([...met.weights.values()].every((weight) => weight === 1),
    'in the degenerate case every named stat should be scored alike rather than at nothing.');
}

/* --------------------------------------------- 3. the rune the denominator means */

/**
 * The perfect rune, found by brute force rather than rebuilt: every maximal ordinary
 * rune of the slot — any four legal lines at their maximum, any one of them carrying
 * all four later upgrades, any innate or none — read the way the page reads a rune,
 * with the canonical Gem and Grindstone. The best six-star one must read exactly 100 %:
 * not less, or the denominator describes a rune no player can hold; not more, or it is
 * not the best one. That is what makes the number readable without a hidden per-slot
 * or per-role multiplier. Every class is on that one scale, so the best five-star rune
 * reads below it and the best four-star rune below that.
 */
function verifyThePerfectRuneReadsFull() {
  let searched = 0;
  for (const entry of roles) {
    for (const build of roleBuilds(entry)) {
      for (const slot of [1, 2, 3, 4, 5, 6]) {
        const main = slot === 1 ? 3 : slot === 3 ? 5 : slot === 5 ? 1 : build.mains[slot];
        if (main === 0 || !slotMainProperties[slot].includes(main)) continue;
        const line = entry.type === 'Support type' ? supportBase : base;
        const weights = substatWeights({ targets: entry.targets, mains: mainsOf(build), artifacts: entry.artifacts, base: line, credit: canonical });
        if (weights.weights.size === 0) continue;
        const legal = runeStatIds.filter((statId) => statId !== main && slotAllowsSubStat(slot, statId)
          && (weights.weights.get(subPropertyTargetStat[statId]) ?? 0) > 0);
        if (legal.length < 4) continue;

        const bestOf = new Map();
        for (const stars of [6, 5, 4]) {
          let best = -Infinity;
          const scope = newRuneAdviceScope();
          for (const four of subsets(legal, 4)) for (const sink of four) for (const innate of [null, ...legal.filter((id) => !four.includes(id))]) {
            const rune = {
              id: 'perfect', setId: 13, setName: 'Violent', slot, stars, ancient: false,
              rarity: 'Legend', level: 12, mainStatId: main, mainValue: 0,
              prefixStatId: innate, prefixValue: innate === null ? 0 : maximumRoll(innate, stars),
              subProperties: four.map((statId) => ({
                statId, value: maximumRoll(statId, stars) * (statId === sink ? 5 : 1), gemmed: false, grind: 0,
              })),
              occupiedId: null, obtainedOrder: 1,
            };
            const candidate = prepareRuneCandidate(rune, entry, build, line, canonical, scope);
            if (candidate) best = Math.max(best, candidateMaxValue(candidate));
          }
          searched += 1;
          bestOf.set(stars, best);
        }
        check(close(bestOf.get(6), 1, 1e-9),
          `${entry.name} slot ${slot}: the best maximal six-star rune reads ${(bestOf.get(6) * 100).toFixed(3)} %, not 100 %.`);
        check(bestOf.get(5) < bestOf.get(6) && bestOf.get(4) < bestOf.get(5),
          `${entry.name} slot ${slot}: a lower star class should read below the one above it on the six-star scale.`);
      }
    }
  }
  console.log(`The best six-star rune reads exactly 100 %, and each lower class below it, in all ${searched} cases searched.`);
}

function subsets(items, count) {
  if (count === 0) return [[]];
  const out = [];
  items.forEach((item, at) => {
    for (const rest of subsets(items.slice(at + 1), count - 1)) out.push([item, ...rest]);
  });
  return out;
}

/* ------------------------------------------------ 4. surplus is never penalised */

/**
 * The rule the brief is most explicit about: a rune that rolled past what its share
 * of a target needed is worth *more*, not the same, because the surplus frees a
 * different rune in the finished build to carry something else.
 */
function verifySurplusKeepsPaying() {
  const fastDd = role('fast-dd');
  const build = roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const make = (spdValue) => ({
    id: 'surplus', setId: 13, setName: 'Violent', slot: 2, stars: 6, ancient: false,
    rarity: 'Legend', level: 12, mainStatId: 4, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: [
      { statId: 8, value: spdValue, gemmed: false, grind: 0 },
      { statId: 9, value: 5, gemmed: false, grind: 0 },
      { statId: 10, value: 5, gemmed: false, grind: 0 },
      { statId: 2, value: 6, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  });
  /* Strictly rising, past 100 % too: the perfect rune is a reference point and never a
     ceiling, so no amount of SPD may flatten the score. +60 is more than any rune can
     roll; it is here only to carry the line well past the perfect rune. */
  let previous = -1;
  let passed = false;
  for (const spdValue of [4, 8, 12, 18, 24, 30, 60]) {
    const candidate = prepareRuneCandidate(make(spdValue), fastDd, build, base, canonical);
    const value = candidateMaxValue(candidate);
    check(value > previous, `a rune with SPD +${spdValue} did not score above one with less; surplus was flattened.`);
    passed ||= value > 1;
    previous = value;
  }
  check(passed, 'no SPD value carried the rune past the perfect rune, so the absence of a cap went untested.');
  console.log('Surplus keeps paying: SPD +4 through +60 rises strictly, past 100 % as well.');
}

/* -------------------------------------------- 5. lower stars, unfinished runes */

/**
 * **Every rune is weighed on one six-star scale** (`RUNE-CLEANUP-MATH.md` §2, §5). A
 * point of a stat is worth the same on every star class, and a lower-star main costs
 * exactly what it falls short of the six-star `+15` main, at the role's price for that
 * stat, so the same lines read lower on a five-star rune by that amount and no more.
 */
function verifyOneSixStarScale() {
  const fastDd = role('fast-dd');
  const build = roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const make = (stars, level) => ({
    id: `stars-${stars}`, setId: 13, setName: 'Violent', slot: 2, stars, ancient: false,
    rarity: 'Legend', level, mainStatId: 4, mainValue: 0,
    prefixStatId: 9, prefixValue: maximumRoll(9, stars),
    subProperties: [
      { statId: 8, value: maximumRoll(8, stars) * 5, gemmed: false, grind: 0 },
      { statId: 10, value: maximumRoll(10, stars), gemmed: false, grind: 0 },
      { statId: 2, value: maximumRoll(2, stars), gemmed: false, grind: 0 },
      { statId: 1, value: maximumRoll(1, stars), gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  });
  /* A point is a point: SPD +5 on a five-star rune is five sixths of a six-star max roll. */
  const read = (stars) => prepareRuneCandidate(make(stars, 12), fastDd, build, base, canonical);
  check(close(read(5).valuation.value(8, 1), read(6).valuation.value(8, 1), 1e-12),
    'one point of SPD should be priced alike at five and six stars.');

  /* The same lines on a five-star body differ only by the main's +15 shortfall. */
  const same = (stars) => ({ ...make(6, 12), stars });
  const six = prepareRuneCandidate(same(6), fastDd, build, base, canonical);
  const five = prepareRuneCandidate(same(5), fastDd, build, base, canonical);
  const shortfall = (mainPropertyMaximum(5, 4) - mainPropertyMaximum(6, 4)) * six.scoring.prices[4] / six.ceiling;
  check(shortfall < 0, 'a five-star ATK % main should cost a role that pays for ATK.');
  check(close(candidateMaxValue(five) - candidateMaxValue(six), shortfall, 1e-9),
    'a five-star rune with six-star lines should read lower by exactly its main shortfall.');
  console.log(`A five-star ATK % main costs Fast DD ${(-shortfall * 100).toFixed(1)} points of Max value.`);

  /* An unfinished rune is scored on what it can still become, so the same lines at
     +0 must reach the same ceiling they reach at +12 — every remaining upgrade is
     still available to land where it is worth most. */
  const fresh = make(6, 0);
  fresh.subProperties = fresh.subProperties.slice(0, 4).map((line) => ({ ...line, value: maximumRoll(line.statId) }));
  const potential = candidateMaxValue(prepareRuneCandidate(fresh, fastDd, build, base, canonical));
  check(potential > 0.9, `a +0 rune with four maximum lines should still project near the ceiling, not ${(potential * 100).toFixed(1)} %.`);
  console.log(`A +0 Legend rune with four maximum lines projects to ${(potential * 100).toFixed(1)} %.`);
}

/* ------------------------------------------------------------ 6. craft credit */

/** Read on the product's fixed ruler, credited craft lifts the rune and never the
    perfect rune: each richer credit reads at least as high. The ruler used to move
    with the credit here, which tested a reading the page never prints. */
function verifyCraftCreditMovesOnlyTheRune() {
  const fastDd = role('fast-dd');
  const build = roleBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const rune = {
    id: 'craft', setId: 13, setName: 'Violent', slot: 2, stars: 6, ancient: false,
    rarity: 'Legend', level: 12, mainStatId: 4, mainValue: 0,
    prefixStatId: 9, prefixValue: 6,
    subProperties: [
      { statId: 8, value: 30, gemmed: false, grind: 0 },
      { statId: 10, value: 7, gemmed: false, grind: 0 },
      { statId: 2, value: 8, gemmed: false, grind: 0 },
      { statId: 1, value: 375, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  };
  let previous = 0;
  for (const credit of [
    noCraft,
    { gem: null, gemGrade: 'Hero', grind: 'maximum', grindGrade: 'Legend' },
    { gem: 'maximum', gemGrade: 'Legend', grind: 'maximum', grindGrade: 'Legend' },
  ]) {
    const value = candidateMaxValue(prepareRuneCandidate(rune, fastDd, build, base, credit));
    check(value > 0, `a credited ${credit.gem ? 'Gem and ' : ''}Grindstone put the rune at ${(value * 100).toFixed(2)} %.`);
    check(value + 1e-12 >= previous,
      `a richer credit (gem ${String(credit.gem)}, grind ${String(credit.grind)}) read the rune lower on the fixed ruler.`);
    previous = value;
    console.log(`  gem ${String(credit.gem)}, grind ${String(credit.grind)} -> ${(value * 100).toFixed(2)} %`);
  }
}

console.log('Rune substat weights — deterministic checks.');
verifyTargetsAreNotSwitches();
verifyMainsReduceTheRequirement();
verifySetsNeverReachTheRequirement();
verifyArtifactsComeOffTheRequirement();
verifyGrindstonesComeOffTheRequirement();
verifyMetTargetsAskForNothing();
verifyThePerfectRuneReadsFull();
verifySurplusKeepsPaying();
verifyOneSixStarScale();
verifyCraftCreditMovesOnlyTheRune();
newSubstatWeightScope();

if (failures) {
  console.error(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nPASS: the weights answer the requirement, and the perfect rune reads 100 %.');
