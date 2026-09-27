/**
 * **The odds are counted, so this is the check that counting is enough.**
 *
 * `rune-power-up-outcomes.ts` answers a rune's chance by playing it forward a few
 * thousand times and counting the runs that clear the bar. One rune's answer is a
 * deterministic estimate with binomial sampling error, and the question that matters
 * is not only what that does to one row — it is what it
 * does to a **box**. A verdict is a threshold, and a threshold turns a spread into
 * flipped rows: if the last half point decided a material number of runes, a player
 * would see a different account every time they pressed Calculate.
 *
 * It does not, and this is what says so. One population is generated once and judged
 * several times at **different resolutions** — a quarter of the shipped run count, the
 * shipped one, and several times it. Nothing about the runes changes and nothing about
 * the policy changes; only how finely each rune's odds were counted. Anything that
 * moves between those runs is the counting's own spread and nothing else, and it would
 * grow if the resolution were cut.
 *
 * Three things are held, and the third is the one that is easy to lose:
 *
 * 1. **The totals.** Keep, Power up and Sell, at `+0`, at `+9`, at `+12` and at `+15`.
 * 2. **The breakdown.** By slot, by preset, and by the rank the rune answered its
 *    preset at — preferred, acceptable, broken — because a stable total made of
 *    unstable parts is not stable, it is two errors cancelling.
 * 3. **The certainties.** A rune at `+12` or `+15` has nothing left to gamble on, so its
 *    chance is `1` or `0` and never a count. A sampled answer there would mean the
 *    short circuit had stopped firing, and nothing else in the suite would notice.
 *
 * And one thing that is not about resolution at all: **two identical runes must be
 * given identical odds.** The draws are a hash of the rune itself rather than of its
 * id, so a box holding two copies of one rune reports one number twice rather than
 * two numbers a point apart.
 *
 * Gems and Grindstones are credited throughout, because they are the half that had no
 * simulation behind it at all until now (`verify:rune-cleanup-calibration` is the
 * other half of that repair) and because the Gem decision is the one part of a rune's
 * end state that depends on how its lines actually rolled.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import { chanceRuns } from '../app/lib/rune-cleanup-model.ts';
import { countJobs } from '../app/lib/rune-power-up-outcomes.ts';
import {
  initialSubPropertyRange, runeInnateFrequency, slotMainProperties, startingSubPropertyCount,
  subPropertyLevels, upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import { runeDefaultGradeOrder, runeDefaultGrades, runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--') && arg.includes('='))
  .map((arg) => arg.slice(2).split('=', 2)));
const quick = process.argv.includes('--quick');
const integerArg = (name, fallback) => {
  const value = Number(args.get(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer.`);
  return value;
};
const runeCount = integerArg('runes', quick ? 300 : 1500);
const heaviest = integerArg('heaviest', quick ? 4 : 16);
const seed = integerArg('seed', 0x0d15ea5e);

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
const setNames = [
  'Energy', 'Guard', 'Swift', 'Blade', 'Rage', 'Focus', 'Endure', 'Fatal',
  'Despair', 'Vampire', 'Violent', 'Nemesis', 'Will', 'Shield', 'Revenge', 'Destroy',
  'Fight', 'Determination', 'Enhance', 'Accuracy', 'Tolerance', 'Seal', 'Intangible',
];
const referenceStats = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
/* Both craft sliders up, at a grade a real account holds plenty of. */
const settings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 3, grindstones: 3,
  gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1, keepMoreForLargerSets: false,
};

function initialRank(random, slot) {
  const value = random();
  return slot === 2 || slot === 4 || slot === 6
    ? value < .25 ? 3 : value < .75 ? 4 : 5
    : value < .75 ? 4 : 5;
}

/** A rune as it leaves the box: level 0, no craft on it yet. */
function freshBody(random, index) {
  const stars = random() < .85 ? 6 : 5;
  const ancient = stars === 6 && random() < .08;
  const slot = draw(random, 1, 6);
  const rank = initialRank(random, slot);
  const mainStatId = choose(random, slotMainProperties[slot]);
  const legal = runeStatIds.filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat));
  const prefixStatId = random() < runeInnateFrequency ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < startingSubPropertyCount(rank); at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    held.add(statId);
    const range = initialSubPropertyRange(stars, statId, ancient);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(stars, prefixStatId, ancient);
  return {
    index, setId: 1, setName: choose(random, setNames), slot, stars, ancient,
    defaultGrade: runeDefaultGrades[rank - 1], level: 0, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefix ? draw(random, prefix.minimum, prefix.maximum) : 0,
    subProperties, occupiedId: null,
  };
}

/** The game's own loop, written from the schedule rather than from the engine. */
function powerUp(random, rune, targetLevel) {
  const born = runeDefaultGradeOrder(rune.defaultGrade);
  for (const [index, level] of subPropertyLevels.entries()) {
    if (level <= rune.level || level > targetLevel) continue;
    if (index >= born) {
      const held = new Set(rune.subProperties.map((line) => line.statId));
      const options = runeStatIds.filter((stat) => stat !== rune.mainStatId && stat !== rune.prefixStatId
        && !held.has(stat) && slotAllowsSubStat(rune.slot, stat));
      if (options.length === 0) continue;
      const statId = choose(random, options);
      const range = initialSubPropertyRange(rune.stars, statId, rune.ancient);
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

const clone = (rune) => ({ ...rune, subProperties: rune.subProperties.map((line) => ({ ...line })) });

const named = (bodies) => bodies.map((body) =>
  ({ ...clone(body), id: String(1_000_003 + body.index), obtainedOrder: body.index + 1 }));

/**
 * The same questions, counted more or less finely.
 *
 * A job is a plain record carrying its own run count, so a caller can answer the
 * engine's own questions at a resolution of its choosing without the engine knowing
 * or caring. That is the whole trick here, and it needs no hook inside the model.
 */
const countingAt = (runs) => async (jobs) =>
  countJobs(runs === chanceRuns ? jobs : jobs.map((job) => ({ ...job, runs })));

/* A quarter of the shipped resolution, the shipped one, and several times it. */
const resolutions = [chanceRuns / 4, chanceRuns, chanceRuns * heaviest];

let failures = 0;
const check = (condition, message) => { if (!condition) { failures += 1; console.error(`FAIL: ${message}`); } };

const presets = defaultRunePotentialPresets();
const bodyRandom = makeRandom(seed);
const bodies = Array.from({ length: runeCount }, (_, index) => freshBody(bodyRandom, index));
/* One power-up history, shared by every labeling, so the bodies really are the same
   runes at every stage and only the engine's own draws differ. */
const powerRandom = makeRandom(seed ^ 0x5eed);
const atNine = bodies.map((body) => powerUp(powerRandom, clone(body), 9));
const atTwelve = atNine.map((rune) => powerUp(powerRandom, clone(rune), 12));
const atFifteen = atTwelve.map((rune) => powerUp(powerRandom, clone(rune), 15));

const tallies = [];
for (const resolution of resolutions) {
  const stages = {};
  for (const [name, source] of [['+0', bodies], ['+9', atNine], ['+12', atTwelve], ['+15', atFifteen]]) {
    const runes = named(source);
    const advice = await runeAdvice(runes, presets, settings, referenceStats, countingAt(resolution));
    const tally = {
      keep: 0, 'power-up': 0, sell: 0, retained: 0,
      preferred: 0, acceptable: 0, broken: 0,
      slots: [0, 0, 0, 0, 0, 0], presets: new Map(),
    };
    for (const rune of runes) {
      const answer = advice.get(rune.id);
      check(answer !== undefined, `${name}: rune ${rune.id} received no advice at all`);
      if (!answer) continue;
      tally[answer.verdict] += 1;
      if (answer.verdict === 'sell') continue;
      tally.retained += 1;
      tally[answer.rank] += 1;
      tally.slots[rune.slot - 1] += 1;
      const key = answer.preset?.id ?? 'none';
      tally.presets.set(key, (tally.presets.get(key) ?? 0) + 1);
      /* At +12 and +15 there is nothing left to gamble on, so the engine must have settled
         the answer rather than counted it. */
      if (name === '+12' || name === '+15') {
        check(answer.chance === 1 || answer.chance === 0,
          `${name}: rune ${rune.id} was retained on a counted chance of ${answer.chance}`);
        check(answer.standing >= 1 - answer.floorShare - 1e-9,
          `${name}: rune ${rune.id} was retained at a standing of ${answer.standing.toFixed(4)},`
          + ` below the floor it was judged against`);
      }
    }
    stages[name] = tally;
  }
  tallies.push(stages);
}

/**
 * **How far one box may disagree with itself across resolutions: four runes in a
 * thousand.**
 *
 * The runes are identical, so everything that moves is a rune whose own odds sit
 * within the counting's spread of the Power-up policy's bar. Nothing moves at all at
 * `+12` and `+15`, where every answer is a certainty rather than a count.
 *
 * The allowance is deliberately *not* scaled by the resolution. One that widened as
 * the runs were cut would pass whatever resolution it was given, which is the one
 * thing this check exists to refuse.
 */
const spreadAllowance = Math.max(6, Math.ceil(runeCount / 250));

function spread(name, read) {
  const values = tallies.map(read);
  const low = Math.min(...values);
  const high = Math.max(...values);
  check(high - low <= spreadAllowance,
    `${name} moved from ${low} to ${high} across ${resolutions.length} resolutions of one box`
    + ` (allowed ${spreadAllowance})`);
  return { low, high, values };
}

console.log(`Rune chance stability — ${runeCount.toLocaleString('en')} runes judged at`
  + ` ${resolutions.map((runs) => runs.toLocaleString('en')).join(', ')} runs per answer,`
  + ' gems and stones credited.');
console.log(`Allowed movement between resolutions: ${spreadAllowance} runes.\n`);

for (const stage of ['+0', '+9', '+12', '+15']) {
  const verdicts = ['keep', 'power-up', 'sell'].map((verdict) => {
    const { low, high } = spread(`${stage} ${verdict}`, (tally) => tally[stage][verdict]);
    return `${verdict} ${low}${low === high ? '' : `–${high}`}`;
  });
  const ranks = ['preferred', 'acceptable', 'broken'].map((rank) => {
    const { low, high } = spread(`${stage} retained ${rank}`, (tally) => tally[stage][rank]);
    return `${rank} ${low}${low === high ? '' : `–${high}`}`;
  });
  const slots = [0, 1, 2, 3, 4, 5].map((slot) => {
    const { low, high } = spread(`${stage} retained in slot ${slot + 1}`, (tally) => tally[stage].slots[slot]);
    return `${slot + 1}=${low}${low === high ? '' : `–${high}`}`;
  });
  const presetIds = [...new Set(tallies.flatMap((tally) => [...tally[stage].presets.keys()]))].sort();
  const perPreset = presetIds.map((id) => {
    const { low, high } = spread(`${stage} retained by ${id}`, (tally) => tally[stage].presets.get(id) ?? 0);
    return `${id} ${low}${low === high ? '' : `–${high}`}`;
  });
  console.log(`${stage.padEnd(4)} ${verdicts.join(', ')}`);
  console.log(`     ranks: ${ranks.join(', ')}`);
  console.log(`     slots: ${slots.join(', ')}`);
  console.log(`     presets: ${perPreset.join('; ')}\n`);
}

/* A box that kept everything or nothing would pass every spread test above while
   telling a player nothing, so the population itself has to be a real one. */
/* Two identical runes are one rune as far as the odds are concerned. */
const twin = { ...clone(atNine[0]), id: 'twin-a', obtainedOrder: 1 };
const twins = [twin, { ...clone(twin), id: 'twin-b', obtainedOrder: 2 }];
const twinAdvice = await runeAdvice(twins, presets, settings, referenceStats);
check(twinAdvice.get('twin-a').chance === twinAdvice.get('twin-b').chance,
  'two identical runes were given different odds: '
  + `${twinAdvice.get('twin-a').chance} against ${twinAdvice.get('twin-b').chance}`);
check(twinAdvice.get('twin-a').verdict === twinAdvice.get('twin-b').verdict,
  'two identical runes were given different verdicts');

const retainedAtFifteen = tallies.map((tally) => tally['+15'].retained);
const share = Math.min(...retainedAtFifteen) / runeCount;
check(share > 0.02 && share < 0.6,
  `the box retained ${(share * 100).toFixed(1)} % at +15, which is not a population anyone`
  + ' would have to make decisions about');

if (failures) {
  console.error(`\n${failures} stability check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('PASS: the same box answers the same way however finely it is counted, two identical'
  + '\n      runes answer alike, and a finished rune is never given odds it no longer has.');
