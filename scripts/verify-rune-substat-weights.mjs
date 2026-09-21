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
 * Every figure below is derived from the shipped presets and one fixed reference
 * line, so a failure is a change in the model and never a change in the data.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { presetBuilds, prepareRuneCandidate, candidateMaxValue } from '../app/lib/rune-cleanup-model.ts';
import { newSubstatWeightScope, substatWeights } from '../app/lib/rune-substat-weights.ts';
import { maximumRoll, slotMainProperties, subPropertyTargetStat } from '../app/lib/rune-properties.ts';
import { runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';

const base = { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 };
const supportBase = { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 };
const noCraft = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
}
const close = (left, right, tolerance = 1e-9) => Math.abs(left - right) <= tolerance;

const presets = defaultRunePotentialPresets();
const preset = (id) => {
  const found = presets.find((entry) => entry.id === id);
  if (!found) throw new Error(`the shipped presets no longer contain ${id}`);
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
  const fastDd = preset('fast-dd');
  const build = presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const weights = substatWeights({ targets: fastDd.targets, mains: mainsOf(build), artifacts: fastDd.artifacts, base });
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
  const bomber = preset('bomber');
  const mains = mainsOf(presetBuilds(bomber)[0]);
  const withHp = substatWeights({ targets: bomber.targets, mains: { ...mains, 4: 2, 6: 2 }, artifacts: bomber.artifacts, base });
  const withAtk = substatWeights({ targets: bomber.targets, mains: { ...mains, 4: 4, 6: 4 }, artifacts: bomber.artifacts, base });
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
  const fastDd = preset('fast-dd');
  const mains = mainsOf(presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4));
  const weights = substatWeights({ targets: fastDd.targets, mains, artifacts: fastDd.artifacts, base });
  const atk = weights.rows.find((row) => row.stat === 'atk');
  check(close(atk.fromBase + atk.fromMains + atk.fromArtifacts + atk.needed, atk.target),
    'base, mains, artifacts and the remaining need should account for the whole ATK target,'
    + ' with nothing else in it.');
  check(!('fromSet' in atk), 'a set contribution is still being carried in the requirement breakdown.');
  console.log(`Fast DD needs ${Math.round(atk.needed)} ATK from sub properties whatever set the rune is.`);
}

/**
 * The two artifacts a monster wears carry a flat main property each — HP +1,500, ATK
 * +100 or DEF +100 (`ARTIFACT-CANONICAL.md` §2) — and a preset states which of the
 * three its role wants. Whatever it names, two artifacts' worth comes off the
 * requirement and no more, spread evenly over the stats named.
 */
function verifyArtifactsComeOffTheRequirement() {
  const fastDd = preset('fast-dd');
  const mains = mainsOf(presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4));
  const of = (artifacts) => substatWeights({ targets: fastDd.targets, mains, artifacts, base }).rows;
  const from = (rows, stat) => rows.find((row) => row.stat === stat)?.fromArtifacts ?? 0;

  const none = of({ atk: false, def: false, hp: false });
  const one = of({ atk: true, def: false, hp: false });
  const two = of({ atk: true, def: true, hp: false });
  const three = of({ atk: true, def: true, hp: true });

  check(from(none, 'atk') === 0, 'a preset that names no artifact should have none credited.');
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

/** A target already met without a single sub property asks the runes for nothing. */
function verifyMetTargetsAskForNothing() {
  const leo = preset('leo');
  const build = presetBuilds(leo)[0];
  const weights = substatWeights({ targets: leo.targets, mains: mainsOf(build), artifacts: leo.artifacts, base });
  const spd = weights.rows.find((row) => row.stat === 'spd');
  check(spd.needed === 0, "Leo's 100 SPD target is below the reference monster's own base speed.");
  check(spd.weight === 0, 'a target the build already meets should not pull value out of other stats.');

  /* And the degenerate case that would otherwise leave a preset unable to judge
     anything: every target met, so every stat the role names is scored alike. */
  const met = substatWeights({ targets: { spd: 1, acc: 1 }, mains: mainsOf(build), artifacts: leo.artifacts, base });
  check(met.degenerate, 'a preset whose every target is already met should report the degenerate case.');
  check([...met.weights.values()].every((weight) => weight === 1),
    'in the degenerate case every named stat should be scored alike rather than at nothing.');
}

/* --------------------------------------------- 3. the rune the denominator means */

/**
 * The perfect rune, built to the definition: four sub properties at their maximum,
 * the most valuable of them carrying all four later upgrades as well, and an innate
 * property at the maximum of the next most valuable effect id. It must read exactly
 * 100 %, whatever the preset is asking for — that is what makes the number readable
 * without a hidden per-slot or per-preset multiplier.
 */
function verifyThePerfectRuneReadsFull() {
  for (const entry of presets) {
    for (const build of presetBuilds(entry)) {
      for (const slot of [1, 2, 3, 4, 5, 6]) {
        const main = slot === 1 ? 3 : slot === 3 ? 5 : slot === 5 ? 1 : build.mains[slot];
        if (main === 0 || !slotMainProperties[slot].includes(main)) continue;
        const line = entry.type === 'Support type' ? supportBase : base;
        const weights = substatWeights({ targets: entry.targets, mains: mainsOf(build), artifacts: entry.artifacts, base: line });
        if (weights.weights.size === 0) continue;

        const ranked = runeStatIds
          .filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
          .map((statId) => ({ statId, worth: (weights.weights.get(subPropertyTargetStat[statId]) ?? 0) * rollWorth(statId, line) }))
          .filter((option) => option.worth > 0)
          .sort((left, right) => right.worth - left.worth);
        if (ranked.length < 5) continue;

        const rune = {
          id: 'perfect', setId: 13, setName: 'Violent', slot, stars: 6, ancient: false,
          defaultGrade: 'Legend', level: 12, mainStatId: main, mainValue: 0,
          prefixStatId: ranked[4].statId, prefixValue: maximumRoll(ranked[4].statId),
          subProperties: [
            { statId: ranked[0].statId, value: maximumRoll(ranked[0].statId) * 5, gemmed: false, grind: 0 },
            ...ranked.slice(1, 4).map((option) => ({
              statId: option.statId, value: maximumRoll(option.statId), gemmed: false, grind: 0,
            })),
          ],
          occupiedId: null, obtainedOrder: 1,
        };
        const candidate = prepareRuneCandidate(rune, entry, build, line, noCraft);
        check(candidate !== null, `${entry.name} slot ${slot}: the perfect rune was not judged at all.`);
        if (!candidate) continue;
        check(close(candidateMaxValue(candidate), 1, 1e-9),
          `${entry.name} slot ${slot}: the perfect rune reads ${(candidateMaxValue(candidate) * 100).toFixed(3)} %, not 100 %.`);
      }
    }
  }
  console.log('The perfect rune reads 100 % in every slot of every shipped preset build.');
}

/** One max roll of an effect id, in max-roll equivalents against this base line. */
function rollWorth(statId, line) {
  const stat = subPropertyTargetStat[statId];
  const percentId = { hp: 2, atk: 4, def: 6 }[stat];
  if (percentId === undefined) return 1;
  return statId === percentId ? 1 : maximumRoll(statId) * 100 / line[stat] / maximumRoll(percentId);
}

/* ------------------------------------------------ 4. surplus is never penalised */

/**
 * The rule the brief is most explicit about: a rune that rolled past what its share
 * of a target needed is worth *more*, not the same, because the surplus frees a
 * different rune in the finished build to carry something else.
 */
function verifySurplusKeepsPaying() {
  const fastDd = preset('fast-dd');
  const build = presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const make = (spdValue) => ({
    id: 'surplus', setId: 13, setName: 'Violent', slot: 2, stars: 6, ancient: false,
    defaultGrade: 'Legend', level: 12, mainStatId: 4, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: [
      { statId: 8, value: spdValue, gemmed: false, grind: 0 },
      { statId: 9, value: 5, gemmed: false, grind: 0 },
      { statId: 10, value: 5, gemmed: false, grind: 0 },
      { statId: 2, value: 6, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  });
  let previous = -1;
  for (const spdValue of [4, 8, 12, 18, 24, 30]) {
    const candidate = prepareRuneCandidate(make(spdValue), fastDd, build, base, noCraft);
    const value = candidateMaxValue(candidate);
    check(value >= previous, `a rune with SPD +${spdValue} scored below one with less; surplus was penalised.`);
    check(value <= 1 + 1e-9, `a rune with SPD +${spdValue} scored above the perfect rune.`);
    previous = value;
  }
  console.log('Surplus keeps paying: SPD +4 through +30 is monotone and never passes 100 %.');
}

/* -------------------------------------------- 5. lower stars, unfinished runes */

/**
 * A lower-star rune is rated on the same scale, not excluded from it and not given
 * an artificial six-star roll. A perfect five-star rune therefore sits below a
 * perfect six-star one and well above nothing.
 */
function verifyLowerStarsStayOnOneScale() {
  const fastDd = preset('fast-dd');
  const build = presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const make = (stars, level) => ({
    id: `stars-${stars}`, setId: 13, setName: 'Violent', slot: 2, stars, ancient: false,
    defaultGrade: 'Legend', level, mainStatId: 4, mainValue: 0,
    prefixStatId: 9, prefixValue: maximumRoll(9, stars),
    subProperties: [
      { statId: 8, value: maximumRoll(8, stars) * 5, gemmed: false, grind: 0 },
      { statId: 10, value: maximumRoll(10, stars), gemmed: false, grind: 0 },
      { statId: 2, value: maximumRoll(2, stars), gemmed: false, grind: 0 },
      { statId: 1, value: maximumRoll(1, stars), gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  });
  const values = [4, 5, 6].map((stars) =>
    candidateMaxValue(prepareRuneCandidate(make(stars, 12), fastDd, build, base, noCraft)));
  check(values[0] < values[1] && values[1] < values[2],
    `a perfect rune should read higher with each star class, not ${values.map((v) => v.toFixed(3)).join(' / ')}.`);
  check(values[0] > 0.1, 'a perfect four-star rune should still be rated, not written off.');
  console.log(`Perfect 4★ / 5★ / 6★ read ${values.map((value) => (value * 100).toFixed(1) + ' %').join(' / ')}.`);

  /* An unfinished rune is scored on what it can still become, so the same lines at
     +0 must reach the same ceiling they reach at +12 — every remaining upgrade is
     still available to land where it is worth most. */
  const fresh = make(6, 0);
  fresh.subProperties = fresh.subProperties.slice(0, 4).map((line) => ({ ...line, value: maximumRoll(line.statId) }));
  const potential = candidateMaxValue(prepareRuneCandidate(fresh, fastDd, build, base, noCraft));
  check(potential > 0.9, `a +0 rune with four maximum lines should still project near the ceiling, not ${(potential * 100).toFixed(1)} %.`);
  console.log(`A +0 Legend rune with four maximum lines projects to ${(potential * 100).toFixed(1)} %.`);
}

/* ------------------------------------------------------------ 6. craft credit */

/** Credited Grindstones lift a rune and the perfect rune together, so no rune can
    read past 100 % merely because the settings promised it a stone. */
function verifyCraftCreditMovesBothEnds() {
  const fastDd = preset('fast-dd');
  const build = presetBuilds(fastDd).find((candidate) => candidate.mains[2] === 4);
  const rune = {
    id: 'craft', setId: 13, setName: 'Violent', slot: 2, stars: 6, ancient: false,
    defaultGrade: 'Legend', level: 12, mainStatId: 4, mainValue: 0,
    prefixStatId: 9, prefixValue: 6,
    subProperties: [
      { statId: 8, value: 30, gemmed: false, grind: 0 },
      { statId: 10, value: 7, gemmed: false, grind: 0 },
      { statId: 2, value: 8, gemmed: false, grind: 0 },
      { statId: 1, value: 375, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  };
  for (const credit of [
    noCraft,
    { gem: null, gemGrade: 'Hero', grind: 'maximum', grindGrade: 'Legend' },
    { gem: 'maximum', gemGrade: 'Legend', grind: 'maximum', grindGrade: 'Legend' },
  ]) {
    const value = candidateMaxValue(prepareRuneCandidate(rune, fastDd, build, base, credit));
    check(value > 0 && value <= 1 + 1e-9,
      `a credited ${credit.gem ? 'Gem and ' : ''}Grindstone put the rune at ${(value * 100).toFixed(2)} %.`);
    console.log(`  gem ${String(credit.gem)}, grind ${String(credit.grind)} -> ${(value * 100).toFixed(2)} %`);
  }
}

console.log('Rune substat weights — deterministic checks.');
verifyTargetsAreNotSwitches();
verifyMainsReduceTheRequirement();
verifySetsNeverReachTheRequirement();
verifyArtifactsComeOffTheRequirement();
verifyMetTargetsAskForNothing();
verifyThePerfectRuneReadsFull();
verifySurplusKeepsPaying();
verifyLowerStarsStayOnOneScale();
verifyCraftCreditMovesBothEnds();
newSubstatWeightScope();

if (failures) {
  console.error(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nPASS: the weights answer the requirement, and the perfect rune reads 100 %.');
