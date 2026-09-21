/**
 * A rune's set must not move its score.
 *
 * Rune sets carry stat bonuses — Fatal is +35 % ATK, Swift +25 % SPD — and it is very
 * tempting to let them reduce what the role still needs from sub properties. That is
 * true about the build and wrong about the *recommendation*: the weights it produces
 * are the yardstick a rune is measured against, so crediting the candidate's own set
 * gives each set a yardstick of its own, and a recommendation compares sets with each
 * other. When it was credited, 1,500 identical rune bodies relabelled set by set were
 * retained **431 to 520 times** on the strength of the label alone — Swift +11 %,
 * Rage −8 % — and no player could have predicted or wanted that ordering.
 *
 * So this script is a fairness check, not an arithmetic one. It is paired by
 * construction: one population of rune *bodies* is generated once and every set is
 * judged on exactly those bodies, against presets rewritten to prefer every set. Any
 * difference in any field is then caused by the set label and by nothing else.
 *
 * The last check is the mirror image and matters just as much: where a preset *does*
 * distinguish sets, the distinction must still bite. Neutral is not the same as blind.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  initialSubPropertyRange, slotMainProperties, startingSubPropertyCount, subPropertyLevels,
  upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import { runeDefaultGrades, runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';
import { presetRuneSetNameList } from '../app/lib/rune-sets.ts';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--') && arg.includes('='))
  .map((arg) => arg.slice(2).split('=', 2)));
const runeCount = Number(args.get('runes') ?? 600);
if (!Number.isInteger(runeCount) || runeCount <= 0) throw new Error('--runes must be a positive integer.');
const seed = Number(args.get('seed') ?? 0x5e7b1a5);

const referenceStats = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

/* Every set whose completed effect `RUNE-CANONICAL.md` §10 records as a constant
   stat, plus Violent and Despair, which contribute none and are the control. */
const sets = ['Violent', 'Despair', 'Energy', 'Guard', 'Swift', 'Blade', 'Rage', 'Focus',
  'Endure', 'Fatal', 'Fight', 'Determination', 'Enhance', 'Accuracy', 'Tolerance'];

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

function freshBody(random, id) {
  const slot = draw(random, 1, 6);
  const rarity = slot === 2 || slot === 4 || slot === 6
    ? (random() < .25 ? 3 : random() < .67 ? 4 : 5)
    : (random() < .75 ? 4 : 5);
  const mainStatId = choose(random, slotMainProperties[slot]);
  const legal = runeStatIds.filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat));
  const prefixStatId = random() < .51 ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < startingSubPropertyCount(rarity); at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    held.add(statId);
    const range = initialSubPropertyRange(6, statId, false);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(6, prefixStatId, false);
  return {
    id: String(id), setId: 1, setName: 'Violent', slot, stars: 6, ancient: false,
    defaultGrade: runeDefaultGrades[rarity - 1], level: 0, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefix ? draw(random, prefix.minimum, prefix.maximum) : 0,
    subProperties, occupiedId: null, obtainedOrder: id,
  };
}

/** The game's own loop, so the bodies are ones the game could actually produce. */
function powerUp(random, rune, targetLevel) {
  for (const level of subPropertyLevels) {
    if (level <= rune.level || level > targetLevel) continue;
    if (rune.subProperties.length < 4) {
      const heldIds = new Set(rune.subProperties.map((property) => property.statId));
      const options = runeStatIds.filter((stat) => stat !== rune.mainStatId && stat !== rune.prefixStatId
        && !heldIds.has(stat) && slotAllowsSubStat(rune.slot, stat));
      const statId = choose(random, options);
      const range = upgradeSubPropertyRange(rune.stars, statId, rune.ancient);
      rune.subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
    } else {
      const line = choose(random, rune.subProperties);
      const range = upgradeSubPropertyRange(rune.stars, line.statId, rune.ancient);
      line.value += draw(random, range.minimum, range.maximum);
    }
  }
  rune.level = targetLevel;
  return rune;
}

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
}

const random = makeRandom(seed);
/* A spread of power-up levels, so the Chance half of a verdict is exercised too and
   not only the deterministic Max value of finished runes. */
const bodies = Array.from({ length: runeCount }, (_, id) =>
  powerUp(random, freshBody(random, id), [0, 6, 9, 12, 15][id % 5]));

const everySet = { preferred: presetRuneSetNameList, acceptable: [] };
const openPresets = defaultRunePotentialPresets().map((preset) => ({ ...preset, sets: everySet }));
const settings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1, gemGrade: 'Hero',
  grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3, intangibleRunes: 1,
  keepMoreForLargerSets: false,
};

/* ------------------------------------------------ 1. the same rune, every set */

const answers = new Map();
for (const setName of sets) {
  const advice = runeAdvice(bodies.map((body) => ({ ...body, setName })), openPresets, settings, referenceStats);
  answers.set(setName, advice);
}
const control = answers.get('Violent');
const fields = ['verdict', 'maxValue', 'chance', 'reason'];
for (const setName of sets) {
  if (setName === 'Violent') continue;
  const advice = answers.get(setName);
  let differing = 0;
  let firstDifference = '';
  for (const body of bodies) {
    const left = control.get(body.id);
    const right = advice.get(body.id);
    const moved = fields.some((field) => !Object.is(left[field], right[field]))
      || (left.preset?.id ?? null) !== (right.preset?.id ?? null);
    if (!moved) continue;
    differing += 1;
    if (!firstDifference) {
      firstDifference = `rune ${body.id}: ${left.verdict}/${left.maxValue}/${left.chance}/${left.preset?.id}`
        + ` -> ${right.verdict}/${right.maxValue}/${right.chance}/${right.preset?.id}`;
    }
  }
  check(differing === 0, `${setName} answered differently from Violent on ${differing} of ${bodies.length}`
    + ` identical runes — ${firstDifference}`);
}
const retained = sets.map((setName) =>
  [...answers.get(setName).values()].filter((answer) => answer.verdict !== 'sell').length);
console.log(`Paired: ${bodies.length} identical bodies x ${sets.length} sets`
  + ` — retained ${Math.min(...retained)} to ${Math.max(...retained)}.`);
check(Math.min(...retained) === Math.max(...retained),
  'the same runes were retained at different rates under different set labels.');

/* ------------------------- 2. the share of the recommendations each set ends up with */

/**
 * The question that actually matters: **of everything the page ends up recommending,
 * what share goes to each set?** Every set is put into one account, where the finite
 * preset quotas make them compete for the same places, and the share each one walks
 * away with is printed.
 *
 * It is a controlled experiment rather than an observational one — every set holds the
 * same bodies — and that is a deliberate choice, not a convenience. A realistic
 * account, with the sets drawn at random over different runes, was tried first and
 * **cannot see the defect this script exists to prevent**: over 2,400 runes it scored
 * chi-square 8.0, 14.8 and 5.9 on 14 degrees of freedom with the biased engine, against
 * 7.8, 12.7 and 3.7 with the neutral one. Roughly 160 runes per set is ±20 % of
 * sampling noise around a systematic effect of about 10 %, and closing that gap needs
 * tens of thousands of runes per set. Holding the bodies fixed removes the noise
 * instead of drowning it, so a ten-per-cent tilt shows up immediately and exactly.
 *
 * Ids are body-major, so the quota's rune-id tie-break interleaves the sets rather than
 * ordering them by name: a quota boundary then falls inside one body's copies, which
 * costs one rune, and there is one boundary per active preset.
 */
const sample = bodies.slice(0, Math.min(bodies.length, 400));
const mixed = [];
for (const body of sample) {
  for (let at = 0; at < sets.length; at += 1) {
    mixed.push({ ...body, id: `${body.id.padStart(6, '0')}-${at}`, setName: sets[at] });
  }
}
const mixedAdvice = runeAdvice(mixed, openPresets, settings, referenceStats);
const countWhere = (setName, accept) =>
  mixed.filter((rune) => rune.setName === setName && accept(mixedAdvice.get(rune.id))).length;

/* What the gates admitted, before the quotas spent the places. This is the figure that
   has to be exactly equal: it is the whole of the engine's opinion of a rune, and it
   owes nothing to who else happened to be in the account. */
const eligible = sets.map((setName) => countWhere(setName,
  (answer) => answer.verdict !== 'sell' || answer.reason === 'Outside requested preset capacity'));
check(Math.min(...eligible) === Math.max(...eligible),
  `the gates admitted between ${Math.min(...eligible)} and ${Math.max(...eligible)} of the same`
  + ` ${sample.length} runes depending on nothing but their set.`);

const kept = sets.map((setName) => countWhere(setName, (answer) => answer.verdict !== 'sell'));
const keptTotal = kept.reduce((sum, value) => sum + value, 0);
const evenShare = 100 / sets.length;
const shares = kept.map((value) => value / keptTotal * 100);
console.log(`Share: ${sample.length} bodies in every one of ${sets.length} sets, one account`
  + ` — ${eligible[0]} eligible each, ${keptTotal} recommended in total,`
  + ` an even share being ${evenShare.toFixed(2)} %.`);
for (let at = 0; at < sets.length; at += 1) {
  const off = shares[at] - evenShare;
  console.log(`  ${sets[at].padEnd(14)} ${String(kept[at]).padStart(4)}  ${shares[at].toFixed(2)} %`
    + `  ${off >= 0 ? '+' : ''}${off.toFixed(2)}`);
}
check(Math.max(...kept) - Math.min(...kept) <= openPresets.length,
  `sets took between ${Math.min(...kept)} and ${Math.max(...kept)} of the same ${sample.length} runes,`
  + ` which is more than the ${openPresets.length} quota boundaries can account for.`);

/* ------------------------------------- 3. neutral is not the same as blind */

/* The preset's own ranking is where a set is *supposed* to decide a verdict, and a
   check that only demanded neutrality would pass just as happily on an engine that
   had stopped reading the set at all. */
const pickyPresets = defaultRunePotentialPresets().map((preset) => ({
  ...preset, sets: { preferred: ['Fatal'], acceptable: [] },
}));
const rejecting = { ...settings, brokenRunes: 5 };
const fatal = runeAdvice(bodies.map((body) => ({ ...body, setName: 'Fatal' })), pickyPresets, rejecting, referenceStats);
const violent = runeAdvice(bodies.map((body) => ({ ...body, setName: 'Violent' })), pickyPresets, rejecting, referenceStats);
const fatalKept = [...fatal.values()].filter((answer) => answer.verdict !== 'sell').length;
const violentKept = [...violent.values()].filter((answer) => answer.verdict !== 'sell').length;
console.log(`Ranking still bites: with only Fatal preferred and Broken runes at "No",`
  + ` Fatal kept ${fatalKept}, Violent kept ${violentKept}.`);
check(fatalKept > 0, 'the preferred set kept nothing, so this check proves nothing.');
check(violentKept === 0, `${violentKept} runes of an unwanted set survived a "No" on broken runes.`);

if (failures) {
  console.error(`\n${failures} neutrality check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nPASS: a set moves a verdict only through the preset, never through the arithmetic.');
