/**
 * **A rune's slot must not decide how likely it is to be kept.**
 *
 * The six slots do not offer the same sub properties. Slot 1 may never carry DEF,
 * slot 3 may never carry ATK, slot 5 may never carry flat HP, and a chosen main
 * property bars its own effect id wherever it sits (`RUNE-CANONICAL.md` §5). So a
 * role built around DEF asks slot 3 for a stat it can draw and slot 1 for one it
 * cannot, and the two slots' boxes of ordinary runes end up in completely different
 * places on their own scales — a different middle, a different width and a different
 * shape, each of which had to be answered separately before this script would pass.
 *
 * Dividing each rune by the perfect rune of its own slot hides none of that: it
 * lines the six scales up at the top and leaves the body of each one wherever the
 * legal ids put it. Run against the engine before `ordinaryBox` existed, this script
 * measured Def DD keeping **29.6 % of its slot-3 runes and 8.8 % of its slot-4
 * ones**, and a role built around ATK keeping **87.4 % of slot 3 and 11.1 % of slot
 * 5** — a player who followed either kept a pile of one slot and nothing for
 * another, while needing exactly one of each.
 *
 * This script is therefore a fairness check rather than an arithmetic one, and it is
 * built to answer one question: **of an ordinary box of runes, does every slot get
 * the same share of the recommendations?** It is asked of every shipped preset and of
 * seven adversarial ones built to make the skew as large as it can be — a role built
 * almost entirely around DEF, one around ATK, one around SPD and so on, each putting
 * the main property that carries its own stat in all three choosing slots so the
 * stat is barred as a sub property in four of the six.
 *
 * **The population is every rune a slot produces**, its main drawn evenly over every
 * main the slot allows (`RUNE-CLEANUP-MATH.md` §9.3). It used to hold the main fixed to
 * one the preset named, and that hid the larger half of the skew: slots 1, 3 and 5
 * have one main each and slots 2, 4 and 6 have seven or eight, so a preset naming one
 * or two of them could use a seventh of those slots' runes and kept a seventh as many.
 * Measured on the shipped presets that was 1–7 % of slots 2, 4 and 6 against 15–20 %
 * of slots 1, 3 and 5. Now every slot must keep the same share of *everything* it
 * produces — except where the preset can use less of the slot than that share, and
 * then it must keep every rune it can use and no more (`usableShare` below). Every
 * set is preferred, so the only things left that can move a verdict are the slot and
 * the main — except in the two rows that put **every shipped preset on the box at
 * once**, which is what the Recommendations table actually does and where the sets
 * are part of the question (`RUNE-CLEANUP-MATH.md` §9.4). Each preset balanced on its
 * own still kept 50 % of slot 2 and 25 % of slot 1 together, and only those rows see it.
 *
 * The last section is the mirror image and matters just as much: the scale must still
 * *discriminate*. A check that only demanded equal shares would pass on an engine that
 * had stopped reading the rune at all.
 */
import { defaultRunePotentialPresets, runeMainStatIds, withRefreshedMetrics } from '../app/lib/rune-potential-presets.ts';
import { qualityThresholds, runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  initialSubPropertyRange, runeInnateFrequency, slotMainProperties, startingSubPropertyCount, subPropertyLevels,
  upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import { runeDefaultGrades, runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';
import { presetRuneSetNameList } from '../app/lib/rune-sets.ts';
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from '../app/lib/rune-potential-metrics.ts';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--') && arg.includes('='))
  .map((arg) => arg.slice(2).split('=', 2)));
const perSlot = Number(args.get('runes') ?? 600);
if (!Number.isInteger(perSlot) || perSlot <= 0) throw new Error('--runes must be a positive integer.');
const seed = Number(args.get('seed') ?? 0x510757a7);
const level = Number(args.get('level') ?? 15);
if (![0, 3, 6, 9, 12, 15].includes(level)) throw new Error('--level must be one of 0, 3, 6, 9, 12 or 15.');

const referenceStats = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function makeRandom(initial) {
  let state = initial >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
const choose = (random, values) => values[Math.floor(random() * values.length)];
const draw = (random, low, high) => low + Math.floor(random() * (high - low + 1));

/* ------------------------------------------------------- the ordinary box */

/**
 * One ordinary six-star rune at the selected checkpoint, built by the game's own
 * loop: a Legend body with four lines drawn without replacement from the ids the
 * slot allows, an innate on 50 % of them (`RUNE-CANONICAL.md` §4), and four upgrades
 * falling uniformly. The default checkpoint is `+15`; lower levels are an explicit
 * diagnostic for the path a real inventory took to get there.
 *
 * This is deliberately the same population `ordinaryBox` states analytically. The
 * point of the script is not to re-derive that mean — `verify:rune-substat-weights`
 * gates the arithmetic — but to check what the *policy* does with it once the gates,
 * the discounts have all had their say.
 */
function ordinaryRune(random, id, slot, mainStatId, setName) {
  const legal = runeStatIds.filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat));
  const prefixStatId = random() < runeInnateFrequency ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < startingSubPropertyCount(5); at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    held.add(statId);
    const range = initialSubPropertyRange(6, statId, false);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(6, prefixStatId, false);
  const rune = {
    id, setId: 1, setName, slot, stars: 6, ancient: false,
    defaultGrade: runeDefaultGrades[4], level: 0, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefix ? draw(random, prefix.minimum, prefix.maximum) : 0,
    subProperties, occupiedId: null, obtainedOrder: 0,
  };
  for (let at = 0; at < subPropertyLevels.length; at += 1) {
    const line = choose(random, rune.subProperties);
    const range = upgradeSubPropertyRange(6, line.statId, false);
    const value = draw(random, range.minimum, range.maximum);
    if (subPropertyLevels[at] <= level) line.value += value;
  }
  rune.level = level;
  return rune;
}

/**
 * The share of a slot's runes a preset can use at all: those whose main one of its
 * builds accepts. A slot left blank accepts every main, at the broken worth. The floor
 * can never keep more of a slot than this, so it is the expected share wherever it is
 * smaller than the one the floor names.
 */
function usableShare(presetOrList, slot, settings) {
  const presets = Array.isArray(presetOrList) ? presetOrList : [presetOrList];
  const mains = slotMainProperties[slot];
  return mains.filter((main) => presets.some((preset) => usableMain(preset, slot, main, settings))).length / mains.length;
}

function usableMain(preset, slot, main, settings) {
  if (slot === 1 || slot === 3 || slot === 5) return true;
  const choice = preset.slots[`slot${slot}`];
  const named = [...choice.preferred, ...choice.acceptable].map((stat) => runeMainStatIds[stat]);
  if (named.length === 0) return settings.brokenRunes !== 5;
  return named.includes(main);
}

/** The main properties a preset named for one slot; slots 1, 3 and 5 have one. */
function mainsFor(preset, slot) {
  if (slot === 1 || slot === 3 || slot === 5) return slotMainProperties[slot];
  const choice = preset.slots[`slot${slot}`];
  const named = [...choice.preferred, ...choice.acceptable];
  return named.map((stat) => runeMainStatIds[stat]);
}

/* ------------------------------------------------------ adversarial roles */

/** A preset written here rather than shipped, with its composites derived as usual. */
function role({ id, name, type, targets, slot2, slot4, slot6 }) {
  const { hp = 0, atk = 0, def = 0, criRate = 0, criDmg = 0 } = targets;
  const metrics = calculateRunePotentialMetrics({ atk, hp, def, criticalRate: criRate, criticalDamage: criDmg });
  const only = (stat) => ({ preferred: [stat], acceptable: [] });
  return {
    id, name, type,
    sets: { preferred: presetRuneSetNameList, acceptable: [] },
    slots: { slot2: only(slot2), slot4: only(slot4), slot6: only(slot6) },
    artifacts: { atk: false, def: false, hp: false },
    targets: {
      ...targets,
      dmg: displayRunePotentialMetric(metrics.dmg),
      ehp: displayRunePotentialMetric(metrics.ehp),
      ehpD: displayRunePotentialMetric(metrics.ehpD),
    },
  };
}

/**
 * A modest target for every stat, a little above the largest reference base any of
 * the five families has. It is what keeps the roles below from being *degenerate*
 * rather than merely lopsided: a role that wants one stat and nothing else gives
 * some slot no legal way to contribute anything at all, which is a hard zero rather
 * than a skew and is checked on its own further down.
 */
const someOfEverything = {
  hp: 15000, atk: 1000, def: 900, spd: 125, criRate: 35, criDmg: 70, res: 30, acc: 20,
};

/**
 * Roles chosen to make the skew as large as a preset can make it while still leaving
 * every slot something to do.
 *
 * Each of the first six is dominated by one stat — its target is several times what
 * the modest baseline asks of the others, so its weight comes out at `1` and the rest
 * near zero — and each puts the main property that carries that stat in all three
 * choosing slots. The wanted stat is then barred as a sub property in **four of the
 * six slots**, and the weight vector is about as peaked as a preset can make it.
 * Those are exactly the conditions under which an absolute Max-value floor was at its
 * worst: the ceiling of a slot that cannot draw the wanted stat collapses onto
 * whatever is second best, and the box underneath it does not follow.
 *
 * `Everything` is the opposite extreme and is the control: a role that wants all
 * eight stats at once prices them almost evenly, so the six boxes are nearly alike —
 * a broken engine has little room to show its bias there, and a passing result on it
 * alone would mean nothing.
 */
const adversarialPresets = [
  role({ id: 'mostly-def', name: 'Mostly DEF', type: 'Defence type', slot2: 'Def%', slot4: 'Def%', slot6: 'Def%', targets: { ...someOfEverything, def: 3000 } }),
  role({ id: 'mostly-atk', name: 'Mostly ATK', type: 'Attack type', slot2: 'Atk%', slot4: 'Atk%', slot6: 'Atk%', targets: { ...someOfEverything, atk: 3000 } }),
  role({ id: 'mostly-hp', name: 'Mostly HP', type: 'HP type', slot2: 'HP%', slot4: 'HP%', slot6: 'HP%', targets: { ...someOfEverything, hp: 45000 } }),
  role({ id: 'mostly-spd', name: 'Mostly SPD', type: 'Support type', slot2: 'Spd', slot4: 'CtD%', slot6: 'Acc%', targets: { ...someOfEverything, spd: 250 } }),
  role({ id: 'mostly-acc', name: 'Mostly ACC', type: 'Support type', slot2: 'Spd', slot4: 'CtR%', slot6: 'Acc%', targets: { ...someOfEverything, acc: 100 } }),
  role({ id: 'mostly-crit', name: 'Mostly crit', type: 'Attack type', slot2: 'Atk%', slot4: 'CtD%', slot6: 'Atk%', targets: { ...someOfEverything, criRate: 100, criDmg: 250 } }),
  role({
    id: 'everything', name: 'Everything', type: 'No type', slot2: 'Spd', slot4: 'CtD%', slot6: 'HP%',
    targets: { hp: 40000, atk: 2500, def: 2500, spd: 250, criRate: 100, criDmg: 250, res: 100, acc: 100 },
  }),
];

/* ------------------------------------------------- 1. the share each slot takes */

const baseSettings = {
  powerUpPolicy: 1, runeQuality: 3, gemRollStep: 4, grindstoneRollStep: 4, gemGrade: 'Hero',
  grindstoneGrade: 'Hero', acceptedRunes: 1, brokenRunes: 1, intangibleRunes: 1,
  keepMoreForLargerSets: false,
};

/**
 * Every rune of every slot judged against one role, and the share of each slot that
 * survives.
 */
async function sharesBySlot(presetOrList, settings, random) {
  const presets = Array.isArray(presetOrList) ? presetOrList : [presetOrList];
  const runes = [];
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const mains = slotMainProperties[slot];
    for (let at = 0; at < perSlot; at += 1) {
      /* Sets cycle rather than being drawn, so every cell holds the same multiset of
         set labels and `verify:rune-set-neutrality`'s subject cannot leak into this
         one. Mains cycle over every main the slot allows, which is the population the
         floor is a share of. */
      runes.push(ordinaryRune(random, `${slot}-${at}`, slot, mains[at % mains.length],
        presetRuneSetNameList[at % presetRuneSetNameList.length]));
    }
  }
  const advice = await runeAdvice(runes, presets, settings, referenceStats);
  const seen = [0, 0, 0, 0, 0, 0];
  const kept = [0, 0, 0, 0, 0, 0];
  const usable = [0, 0, 0, 0, 0, 0];
  for (const rune of runes) {
    const answer = advice.get(rune.id);
    seen[rune.slot - 1] += 1;
    if (presets.some((preset) => usableMain(preset, rune.slot, rune.mainStatId, settings))) usable[rune.slot - 1] += 1;
    if (answer.verdict !== 'sell') {
      kept[rune.slot - 1] += 1;
    }
  }
  return { seen, kept, usable };
}

/**
 * Pearson's χ² for "every slot keeps the same share", on 5 degrees of freedom.
 *
 * A ratio of the largest share to the smallest is the figure a player would quote,
 * and it is printed, but it is a poor test: it reads two cells and throws four away,
 * and its sampling noise grows without bound as the shares fall. χ² reads all six and
 * knows how many runes each was measured on.
 */
function chiSquare(seen, kept) {
  const totalSeen = seen.reduce((sum, value) => sum + value, 0);
  const totalKept = kept.reduce((sum, value) => sum + value, 0);
  if (totalSeen === 0 || totalKept === 0 || totalKept === totalSeen) return 0;
  const rate = totalKept / totalSeen;
  let statistic = 0;
  for (let at = 0; at < seen.length; at += 1) {
    if (seen[at] === 0) continue;
    const expected = seen[at] * rate;
    statistic += (kept[at] - expected) ** 2 / expected
      + ((seen[at] - kept[at]) - (seen[at] - expected)) ** 2 / (seen[at] - expected);
  }
  return statistic;
}

/**
 * The critical value.
 *
 * χ²(5) passes **20.5** once in a thousand under a perfect null, and eighteen
 * scenarios are measured per run, so a limit there would cry wolf a few times in a
 * hundred runs. Nor is the null quite perfect: the box records a line-up's own
 * within-case spread as a Gaussian and the grid is finite, so a residue of a few
 * χ² remains. Measured over four seeds at 2,000 runes a slot, the worst scenario of
 * a run scored 23, 31, 31 and 31.
 *
 * The limit is set at **45**, and the margin it gives up is worth almost nothing.
 * Run against the engine before `ordinaryBox`, seventeen of these eighteen scenarios
 * scored between **139 and 3,898** — Def DD 352, Bruiser 674, a role built around
 * ATK 3,548 — and the eighteenth scored 32. One failure fails the run, so the gate
 * catches that engine several times over; there is simply no sensitivity worth
 * buying between 45 and 139, and a gate that cries wolf gets switched off.
 */
const chiSquareLimit = 45;

/**
 * The plain figure a player would quote, checked as well because it is the promise
 * the page makes: the biggest slot's share over the smallest's. Measured worst case
 * over those same four seeds was 1.46x, against 1.41x to 7.87x before.
 *
 * A ratio reads two cells and throws four away, and its sampling noise grows without
 * bound as the shares fall — at the tightest stop of the ladder a cell holds about
 * twenty-five runes, where a 2x ratio is an ordinary afternoon. So the limit below is
 * the *systematic* one and `spreadAllowance` widens it by what the smallest cell's
 * own binomial noise can produce. It is here for legibility; χ² is the test with the
 * power.
 */
const spreadLimit = 1.30;

/** Three standard deviations of the smallest cell's rate, both ends of the ratio. */
function spreadAllowance(rate, smallestCell) {
  if (!(rate > 0) || smallestCell <= 0) return Infinity;
  const noise = 3 * Math.sqrt((1 - rate) / (smallestCell * rate));
  return (1 + noise) / Math.max(0.25, 1 - noise);
}

/* The shipped discounts for accepted and broken runes. The single-preset rows switch
   them off so a discount cannot move a slot; with every preset at once they are part
   of what the overlap is made of, and switched off they hid most of it. */
const defaultDiscounts = { ...baseSettings, acceptedRunes: 3, brokenRunes: 3 };
const shippedSettings = {
  ...defaultDiscounts, powerUpPolicy: 3, gemRollStep: 4, grindstoneRollStep: 4, intangibleRunes: 2,
};
const shippedG1Settings = { ...shippedSettings, runeQuality: 4 };
const floorOnlyG1Settings = { ...shippedG1Settings, powerUpPolicy: 1 };

const scenarios = [
  ...defaultRunePotentialPresets().map((preset) => ({
    preset: { ...preset, sets: { preferred: presetRuneSetNameList, acceptable: [] } },
    settings: baseSettings, label: preset.name,
  })),
  ...adversarialPresets.map((preset) => ({ preset, settings: baseSettings, label: preset.name })),
  /* **Every preset at once**, which is what a player's Recommendations table is. Each
     preset above is balanced on its own, and that was not enough: a rune is kept when
     any preset keeps it, the presets' picks of slot 1 overlap while their picks of slots
     2, 4 and 6 — each preset its own mains — barely do, and the engine that passed every
     row above kept 34–49 % of slots 2, 4 and 6 and 23–25 % of 1, 3 and 5 here. Once with
     the shipped set preferences, which is the real overlap, and once with every set
     preferred, which is the most overlap there can be. */
  { preset: defaultRunePotentialPresets(), settings: defaultDiscounts, label: 'All shipped presets' },
  { preset: defaultRunePotentialPresets(), settings: shippedSettings, label: 'Shipped defaults' },
  { preset: defaultRunePotentialPresets(), settings: shippedG1Settings, label: 'Shipped G1 floor' },
  { preset: defaultRunePotentialPresets(), settings: floorOnlyG1Settings, label: 'G1 floor, YOLO chance' },
  {
    preset: defaultRunePotentialPresets().map((preset) => ({ ...preset, sets: { preferred: presetRuneSetNameList, acceptable: [] } })),
    settings: defaultDiscounts, label: 'All, every set',
  },
  /* Craft settings get their own run: the candidate projection changes, while the
     common neutral ruler stays fixed across slots (§6). */
  {
    preset: adversarialPresets[0], label: 'Mostly DEF, crafted',
    settings: { ...baseSettings, gemRollStep: 5, grindstoneRollStep: 5 },
  },
  /* Both ends of the quality ladder, where the box is read furthest from its middle
     and a mismatch in the *shape* of two slots' boxes would show up first. */
  { preset: adversarialPresets[3], label: 'Mostly SPD, floor 1', settings: { ...baseSettings, runeQuality: 1 } },
  { preset: adversarialPresets[3], label: 'Mostly SPD, floor 5', settings: { ...baseSettings, runeQuality: 5 } },
  /* The strictest floor asks for 4 % of a slot, which every one-main slot of the roles
     above can supply — so here the share is found rather than capped, and a slot-2
     rune must clear seven times as much of its own box as a slot-1 rune does. */
  { preset: adversarialPresets[0], label: 'Mostly DEF, floor 5', settings: { ...baseSettings, runeQuality: 5 } },
  { preset: adversarialPresets[1], label: 'Mostly ATK, floor 5', settings: { ...baseSettings, runeQuality: 5 } },
  /* The case a flat "double it" gets wrong: one role, one preferred slot-6 main
     against five. Five of eight is past any floor's share and needs almost no help;
     one of eight needs eight times the share. Both must land where slot 1 does. */
  {
    preset: { ...adversarialPresets[6], id: 'one-six', slots: { ...adversarialPresets[6].slots, slot6: { preferred: ['HP%'], acceptable: [] } } },
    label: 'One slot-6 main, fl 4', settings: { ...baseSettings, runeQuality: 4 },
  },
  {
    preset: {
      ...adversarialPresets[6], id: 'five-six',
      slots: { ...adversarialPresets[6].slots, slot6: { preferred: ['HP%', 'Atk%', 'Def%', 'Res%', 'Acc%'], acceptable: [] } },
    },
    label: 'Five slot-6 mains, 4', settings: { ...baseSettings, runeQuality: 4 },
  },
];

console.log(`Slot neutrality — ${perSlot.toLocaleString('en')} ordinary 6★ runes at +${level} per slot,`
  + ` ${scenarios.length} scenarios, seed ${seed}.\n`);
console.log('                        1      2      3      4      5      6    overall    spread     chi2');

for (const scenario of scenarios) {
  const random = makeRandom(seed);
  const { seen: allSeen, kept: allKept, usable: allUsable } = await sharesBySlot(scenario.preset, scenario.settings, random);
  /* A slot whose usable runes are fewer than the floor's share keeps every one of
     them, which is a count rather than a sample: it is checked exactly, and the
     comparison of shares is made between the slots that had enough to choose from. */
  const named = qualityThresholds[scenario.settings.runeQuality - 1];
  const capped = [1, 2, 3, 4, 5, 6].map((slot) => usableShare(scenario.preset, slot, scenario.settings) <= named);
  const seen = allSeen.map((count, at) => (capped[at] ? 0 : count));
  const kept = allKept.map((count, at) => (capped[at] ? 0 : count));
  const rates = allSeen.map((count, at) => (count > 0 ? allKept[at] / count : null));
  const measured = rates.filter((rate, at) => rate !== null && !capped[at]);
  const overall = kept.reduce((sum, value) => sum + value, 0) / Math.max(1, seen.reduce((sum, value) => sum + value, 0));
  const spread = Math.min(...measured) > 0 ? Math.max(...measured) / Math.min(...measured) : Infinity;
  const statistic = chiSquare(seen, kept);
  /* A slot with fewer usable runes than the floor's share is held to the level the
     other slots reach, or to every usable rune where it cannot get there — never more
     than it can use, and within the binomial noise of the smaller of the two. The level
     is what the other slots actually keep, not the stop's own number: the balance aims
     at slots 1, 3 and 5, so a slot that can use 14.3 % of its runes keeps 13.5 % where
     they keep 13.5 %, and all of them only where they keep more. */
  for (let at = 0; at < 6; at += 1) {
    if (!capped[at]) continue;
    const usable = allUsable[at];
    const expected = Math.min(usable, allSeen[at] * overall);
    const noise = 3 * Math.sqrt(Math.max(1, allSeen[at] * overall * (1 - overall))) + 1;
    check(allKept[at] <= usable, `${scenario.label}: slot ${at + 1} kept ${allKept[at]} runes and can use only ${usable}.`);
    check(Math.abs(allKept[at] - expected) <= noise, `${scenario.label}: slot ${at + 1} can use ${usable} of its runes`
      + ` and should keep about ${expected.toFixed(0)}, the other slots' level or all of them, but kept ${allKept[at]}.`);
  }
  const cells = rates.map((rate, at) => (rate === null ? '    - '
    : `${(rate * 100).toFixed(1)}${capped[at] ? '*' : ' '}%`.padStart(7)));
  console.log(`${scenario.label.padEnd(20)} ${cells.join('')}  ${(overall * 100).toFixed(1).padStart(5)} %`
    + `  ${spread.toFixed(2).padStart(7)}x  ${statistic.toFixed(1).padStart(7)}`);

  check(overall > 0, `${scenario.label} recommended nothing at all, so the comparison proves nothing.`);
  check(statistic <= chiSquareLimit,
    `${scenario.label} kept ${cells.map((cell) => cell.trim()).join(' / ')} of the six slots`
    + ` — chi-square ${statistic.toFixed(1)} on 5 degrees of freedom, past the limit of ${chiSquareLimit}.`);
  const allowed = spreadLimit * spreadAllowance(overall, Math.min(...seen.filter((count) => count > 0)));
  check(spread <= allowed,
    `${scenario.label} kept ${(Math.max(...measured) * 100).toFixed(1)} % of one slot`
    + ` and ${(Math.min(...measured) * 100).toFixed(1)} % of another, a spread of ${spread.toFixed(2)}x`
    + ` against ${allowed.toFixed(2)}x of sampling noise at this size.`);
}

/* ------------------------------- 2. the floor admits the share it names */

/**
 * The stops are no longer calibrated numbers that happen to admit a share — they
 * **state** the share, and the model works out the Max value it comes to in each
 * slot. So the promise is checkable directly, and it is the same promise §9 has
 * always made about this ladder.
 *
 * The tolerance is still wide. The box is the model's own stated rune and this is a
 * population the game's loop produced, so the two agree to a few per cent rather than
 * exactly, and a preset's own targets move the agreement a little either way. What
 * this check is for is the gross error: a ladder left behind by a change of scale,
 * which is how the stops came to be restated twice already.
 *
 * The role is stated here rather than taken from the shipped list. It used to be
 * "the second shipped preset", and when the shipped presets were replaced that
 * became a different role and the ladder read 23.6 % where it had read 26.2 % —
 * a failure about the fixture, not the ladder. Shipped presets are the user's to
 * edit and reorder; a calibration cannot stand on them.
 */
console.log('\nWhat each stop of the quality floor lets through, against what it says:');
const ladderPreset = withRefreshedMetrics({
  id: 'ladder-first-turn-debuff',
  name: 'First-turn debuff',
  type: 'Support type',
  sets: { preferred: presetRuneSetNameList, acceptable: [] },
  slots: {
    slot2: { preferred: ['Spd'], acceptable: ['Atk%'] },
    slot4: { preferred: ['CtD%'], acceptable: [] },
    slot6: { preferred: ['Atk%'], acceptable: [] },
  },
  artifacts: { atk: true, def: false, hp: false },
  targets: { hp: 15042, atk: 2200, def: 814, spd: 240, acc: 65, criRate: 85, criDmg: 200 },
});
for (let stop = 1; stop <= qualityThresholds.length; stop += 1) {
  const random = makeRandom(seed);
  const { seen, kept } = await sharesBySlot(ladderPreset, { ...baseSettings, runeQuality: stop }, random);
  const overall = kept.reduce((sum, value) => sum + value, 0) / seen.reduce((sum, value) => sum + value, 0);
  const named = qualityThresholds[stop - 1];
  console.log(`  stop ${stop}: says ${(named * 100).toFixed(0).padStart(2)} %, admits ${(overall * 100).toFixed(1).padStart(5)} %`);
  check(overall >= named * 0.75 && overall <= named * 1.3 + 0.01,
    `quality stop ${stop} names ${(named * 100).toFixed(0)} % of an ordinary box and admitted`
    + ` ${(overall * 100).toFixed(1)} %.`);
}

/* --------------------- 3. a slot that can carry nothing is a zero, not a skew */

/**
 * The one case where a slot genuinely must differ, stated so that nobody later
 * "fixes" it.
 *
 * A role that wants **DEF and nothing else** cannot be served by a slot-1 rune at
 * all: slot 1 may carry neither DEF % nor flat DEF, so every legal sub property is
 * worth nothing to that role and there is no box to be a position in. That is a fact
 * about `RUNE-CANONICAL.md` §5, not a bias, and the engine must say "No preset can
 * use it" rather than inventing a scale for a rune that has nothing to put on it.
 * The check above deliberately avoids such roles — it would read an honest zero as a
 * failure — so the case is asserted here instead.
 */
console.log('\nA slot that can carry nothing the role wants:');
const degenerate = role({
  id: 'def-alone', name: 'DEF alone', type: 'Defence type',
  slot2: 'Def%', slot4: 'Def%', slot6: 'Def%', targets: { def: 3000 },
});
const degenerateRandom = makeRandom(seed);
const barred = Array.from({ length: 50 }, (_, at) =>
  ordinaryRune(degenerateRandom, `barred-${at}`, 1, slotMainProperties[1][0], 'Violent'));
const ableSlot = Array.from({ length: 50 }, (_, at) =>
  ordinaryRune(degenerateRandom, `able-${at}`, 3, slotMainProperties[3][0], 'Violent'));
const degenerateAdvice = await runeAdvice([...barred, ...ableSlot], [degenerate], baseSettings, referenceStats);
const barredRated = barred.filter((rune) => degenerateAdvice.get(rune.id).preset !== null).length;
const ableRated = ableSlot.filter((rune) => degenerateAdvice.get(rune.id).preset !== null).length;
console.log(`  Wanting only DEF: ${barredRated} of ${barred.length} slot-1 runes rated,`
  + ` ${ableRated} of ${ableSlot.length} slot-3 runes rated.`);
check(barredRated === 0, `${barredRated} slot-1 runes were rated for a role that wants only DEF,`
  + ' which slot 1 may not carry at all.');
check(ableRated === ableSlot.length, `only ${ableRated} slot-3 runes were rated for a role wanting DEF,`
  + ' which slot 3 can carry.');

/* ------------------------------- 4. even is not the same as blind */

/**
 * The mirror image. An engine that had stopped reading the rune would pass every
 * check above — it would keep the same share of every slot by keeping an arbitrary
 * share of each — so the scale has to be shown to still rank runes within a slot,
 * and to still prefer the stat the role actually asked for.
 */
console.log('\nThe scale still discriminates:');
const discriminating = adversarialPresets[0];
const random = makeRandom(seed ^ 0x9e3779b9);
const probe = [];
for (const slot of [1, 2, 3, 4, 5, 6]) {
  const mains = mainsFor(discriminating, slot);
  for (let at = 0; at < 400; at += 1) {
    probe.push(ordinaryRune(random, `probe-${slot}-${at}`, slot, mains[at % mains.length], 'Violent'));
  }
}
const probeAdvice = await runeAdvice(probe, [discriminating], baseSettings, referenceStats);

/* Within one slot, a rune that reads a higher Max value must never stand lower: the
   box is a property of the slot, so the map from one to the other is monotone, and a
   violation would mean the anchor had started reading the candidate. */
let inversions = 0;
for (const slot of [1, 2, 3, 4, 5, 6]) {
  const rows = probe.filter((rune) => rune.slot === slot).map((rune) => probeAdvice.get(rune.id))
    .filter((answer) => answer.preset !== null)
    .sort((left, right) => left.maxValue - right.maxValue);
  for (let at = 1; at < rows.length; at += 1) {
    if (rows[at].standing + 1e-12 < rows[at - 1].standing) inversions += 1;
  }
}
console.log(`  Within a slot, standing follows Max value: ${inversions} inversions.`);
check(inversions === 0, `${inversions} runes stood lower than a rune of the same slot they out-scored.`);

/* A slot that *can* draw the wanted stat must reward it. Two slot-3 runes, identical
   but for one line, one of which is the DEF % the role is starved of. */
const withDef = ordinaryRune(makeRandom(1), 'shape-def', 3, 5, 'Violent');
withDef.prefixStatId = null;
withDef.prefixValue = 0;
withDef.subProperties = [
  { statId: 6, value: 40, gemmed: false, grind: 0 },
  { statId: 11, value: 8, gemmed: false, grind: 0 },
  { statId: 12, value: 8, gemmed: false, grind: 0 },
  { statId: 1, value: 375, gemmed: false, grind: 0 },
];
const withoutDef = { ...withDef, id: 'shape-plain', subProperties: withDef.subProperties.map((line, at) =>
  (at === 0 ? { statId: 2, value: 8, gemmed: false, grind: 0 } : { ...line })) };
const shapeAdvice = await runeAdvice([withDef, withoutDef], [discriminating], baseSettings, referenceStats);
const better = shapeAdvice.get('shape-def');
const worse = shapeAdvice.get('shape-plain');
console.log(`  A maxed DEF % line is worth something: ${(better.standing * 100).toFixed(1)} %`
  + ` against ${(worse.standing * 100).toFixed(1)} % without it.`);
check(better.standing > worse.standing + 0.05,
  `a role built around DEF stood a maxed DEF % slot-3 rune at ${(better.standing * 100).toFixed(1)} %`
  + ` and the same rune without it at ${(worse.standing * 100).toFixed(1)} %.`);

if (failures) {
  console.error(`\n${failures} slot-neutrality check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nPASS: every slot takes the same share of an ordinary box, and the scale still ranks runes.');
