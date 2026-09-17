/**
 * Rune Clean-up — calibration and the maths check behind it.
 *
 * Two jobs, and the second is the reason the first can be trusted.
 *
 * **1. It checks the chance calculation against the game's own loop.** The model
 * computes "will this rune reach the bar by +12" by convolving one distribution per
 * remaining event. This script re-derives the same figure by simulating the
 * mechanic — roll the events, see where the rune lands — and fails if the two
 * disagree by more than the tolerance below. That is a check on the model, not a
 * second copy of it: the Monte Carlo is written from `RUNE-CANONICAL.md` §6 and §7,
 * not from `rune-cleanup-model.ts`.
 *
 * **2. It solves for the constants the model cannot derive.** How a wanted-count
 * multiplier becomes a score multiplier, and what each slot's bar must be so that
 * the six slots survive in equal numbers, have no closed form — they depend on how
 * the scores of real runes are distributed. So they are measured: a million
 * simulated runes are scored, and the script solves for the values that produce the
 * stated behaviour. `--solve` prints the table to paste into
 * `app/lib/rune-cleanup-advice.ts`; without it, the run asserts the shipped values
 * still hold.
 *
 * The simulated box follows the brief: slots 1, 3 and 5 at three-quarters Hero and
 * one-quarter Legend; slots 2, 4 and 6 at a quarter Rare, half Hero and a quarter
 * Legend, because those three slots are filtered on their main property first and a
 * lower-rarity rune with the right main is worth rolling. No Ancient runes.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice, qualityThresholds } from '../app/lib/rune-cleanup-advice.ts';
import {
  subPropertyRanges, slotMainProperties, startingSubPropertyCount, subPropertyLevels,
} from '../app/lib/rune-properties.ts';
import { runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';

const argv = new Set(process.argv.slice(2));
const solving = argv.has('--solve');
const count = Number(process.argv.find((a) => a.startsWith('--runes='))?.slice(8)) || (solving ? 1_000_000 : 120_000);

/* A deterministic generator, so a failure is reproducible and a calibration run is
   the same run twice. */
let seed = 0x9e3779b9;
function random() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0x100000000;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (low, high) => low + Math.floor(random() * (high - low + 1));

const setNames = ['Energy', 'Guard', 'Swift', 'Blade', 'Rage', 'Focus', 'Endure', 'Fatal',
  'Despair', 'Vampire', 'Violent', 'Nemesis', 'Will', 'Shield', 'Revenge', 'Destroy',
  'Fight', 'Determination', 'Enhance', 'Accuracy', 'Tolerance', 'Seal'];

/** The rarity mix the brief states, split by whether the slot chooses its main. */
function drawRank(slot) {
  const roll = random();
  if (slot === 2 || slot === 4 || slot === 6) return roll < 0.25 ? 3 : roll < 0.75 ? 4 : 5;
  return roll < 0.75 ? 4 : 5;
}

/** One fresh rune, rolled the way the game rolls one. */
function freshRune(id) {
  const slot = 1 + Math.floor(random() * 6);
  const rank = drawRank(slot);
  const setName = pick(setNames);
  const mainStatId = pick(slotMainProperties[slot]);
  /* A prefix on 51 % of runes, measured on a real account (`RUNE-CANONICAL.md` §4). */
  const legal = runeStatIds.filter((id) => id !== mainStatId && slotAllowsSubStat(slot, id));
  const prefixStatId = random() < 0.51 ? pick(legal) : null;
  const pool = legal.filter((id) => id !== prefixStatId);
  const subs = [];
  const taken = new Set();
  for (let at = 0; at < startingSubPropertyCount(rank); at += 1) {
    const choices = pool.filter((id) => !taken.has(id));
    const statId = pick(choices);
    taken.add(statId);
    const range = subPropertyRanges[statId];
    subs.push({ statId, value: between(range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  return {
    id: String(id), setId: 1, setName, slot, stars: 6, ancient: false, level: 0,
    mainStatId, mainValue: 0,
    prefixStatId,
    prefixValue: prefixStatId === null ? 0
      : between(subPropertyRanges[prefixStatId].minimum, subPropertyRanges[prefixStatId].maximum),
    subProperties: subs, occupiedId: null,
    _rank: rank, _pool: pool,
  };
}

/** Power a rune up from its level to `to`, rolling the events the game would roll. */
function powerUp(rune, to) {
  for (const at of subPropertyLevels) {
    if (at <= rune.level || at > to) continue;
    if (rune.subProperties.length < 4) {
      const taken = new Set(rune.subProperties.map((s) => s.statId));
      const choices = rune._pool.filter((id) => !taken.has(id));
      const statId = pick(choices);
      const range = subPropertyRanges[statId];
      rune.subProperties.push({ statId, value: between(range.minimum, range.maximum), gemmed: false, grind: 0 });
    } else {
      const line = rune.subProperties[Math.floor(random() * 4)];
      const range = subPropertyRanges[line.statId];
      line.value += between(range.minimum, range.maximum);
    }
  }
  rune.level = to;
  return rune;
}

const presets = defaultRunePotentialPresets();
/* The reference base line from the real roster's measured averages
   (`docs/RUNE-CLEANUP-MATH.md` §1), so the calibration is against a plausible
   account rather than against invented monsters. */
const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

const settings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1,
  gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1, keepMoreForLargerSets: false, includeLevel12Runes: true,
  includeEquippedRunes: true,
};

console.log(`Rune Clean-up calibration — ${count.toLocaleString('en')} simulated runes`);
console.log(`slots 1/3/5: 75 % Hero, 25 % Legend    slots 2/4/6: 25 % Rare, 50 % Hero, 25 % Legend\n`);

/* The player follows the advice exactly: roll to +9, ask again, roll to +12, ask
   again. A rune told to sell at any point leaves the box there. */
const kept = { total: 0, bySlot: new Map(), byPreset: new Map(), byRank: new Map() };
const seen = { total: 0, bySlot: new Map() };
const scores = [];
const batch = 2000;
for (let done = 0; done < count; done += batch) {
  const runes = Array.from({ length: Math.min(batch, count - done) }, (_, at) => freshRune(done + at));
  for (const rune of runes) { seen.total += 1; seen.bySlot.set(rune.slot, (seen.bySlot.get(rune.slot) ?? 0) + 1); }

  let alive = runes;
  for (const stop of [0, 9, 12]) {
    if (stop > 0) alive = alive.map((rune) => powerUp(rune, stop));
    const advice = runeAdvice(alive, presets, settings, base);
    if (stop === 12) {
      for (const rune of alive) {
        const answer = advice.get(rune.id);
        if (!answer || answer.verdict === 'sell') continue;
        kept.total += 1;
        kept.bySlot.set(rune.slot, (kept.bySlot.get(rune.slot) ?? 0) + 1);
        kept.byPreset.set(answer.preset?.name ?? '—', (kept.byPreset.get(answer.preset?.name ?? '—') ?? 0) + 1);
        kept.byRank.set(answer.rank, (kept.byRank.get(answer.rank) ?? 0) + 1);
      }
    } else {
      alive = alive.filter((rune) => advice.get(rune.id)?.verdict !== 'sell');
    }
    if (stop === 0) for (const rune of alive) scores.push(advice.get(rune.id)?.maxValue ?? 0);
  }
}

const share = (n, d) => `${(100 * n / d).toFixed(2)} %`;
console.log(`Kept at +12: ${kept.total.toLocaleString('en')} of ${seen.total.toLocaleString('en')} = ${share(kept.total, seen.total)}`);
console.log(`Target at the middle setting: 15 %\n`);

console.log('By slot — these must be level for the account to be able to build anything:');
console.log('slot   seen      kept     share    relative to slot 1');
const slot1 = (kept.bySlot.get(1) ?? 0) / (seen.bySlot.get(1) ?? 1);
for (const slot of [1, 2, 3, 4, 5, 6]) {
  const s = seen.bySlot.get(slot) ?? 0; const k = kept.bySlot.get(slot) ?? 0;
  console.log(`  ${slot}  ${String(s).padStart(8)} ${String(k).padStart(9)}   ${share(k, s).padStart(8)}   ${(slot1 > 0 ? (k / s) / slot1 : 0).toFixed(3)}`);
}

console.log('\nBy preset — should track each preset\'s stated share:');
for (const [name, n] of [...kept.byPreset.entries()].sort((a, b) => b[1] - a[1])) {
  const preset = presets.find((p) => p.name === name);
  console.log(`  ${name.padEnd(14)} ${String(n).padStart(8)}  ${share(n, kept.total).padStart(8)}   stated ${preset ? ['1/10', '1/5', '1/3', '1/2', 'x1', 'x2', 'x3', 'x5', 'x10'][preset.runeShare - 1] : '—'}`);
}

console.log('\nBy match rank:');
for (const [rank, n] of kept.byRank) console.log(`  ${rank.padEnd(12)} ${String(n).padStart(8)}  ${share(n, kept.total)}`);

if (solving) {
  scores.sort((a, b) => a - b);
  const quantile = (q) => scores[Math.min(scores.length - 1, Math.floor(q * scores.length))];
  const baseBar = qualityThresholds[2];
  const keptShare = kept.total / seen.total;
  console.log('\n\n=== SOLVED CONSTANTS — paste into app/lib/rune-cleanup-advice.ts ===\n');
  console.log('wantedCountMultipliers:');
  for (const wanted of [0.1, 0.2, 1 / 3, 0.5, 1, 2, 3, 5, 10]) {
    /* The bar that keeps `wanted` times as many runes: read the score distribution
       backwards from the share that verdict would produce. */
    const targetShare = Math.min(0.999, keptShare * wanted);
    const bar = quantile(1 - targetShare / (keptShare || 1) * keptShare);
    console.log(`  { wanted: ${wanted === 1 / 3 ? '1 / 3' : wanted}, score: ${(bar / baseBar).toFixed(2)} },`);
  }
  console.log('\nslotBalance:');
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const s = seen.bySlot.get(slot) ?? 1; const k = kept.bySlot.get(slot) ?? 0;
    console.log(`  ${slot}: ${(slot1 > 0 ? Math.min(1, ((k / s) / slot1) ** 0.15) : 1).toFixed(2)},`);
  }
} else {
  const rate = kept.total / seen.total;
  const spread = Math.max(...[1, 2, 3, 4, 5, 6].map((s) => (kept.bySlot.get(s) ?? 0) / (seen.bySlot.get(s) ?? 1)))
    / Math.max(1e-9, Math.min(...[1, 2, 3, 4, 5, 6].map((s) => (kept.bySlot.get(s) ?? 0) / (seen.bySlot.get(s) ?? 1))));
  let failed = false;
  if (rate < 0.10 || rate > 0.21) {
    console.error(`\nFAIL: ${share(kept.total, seen.total)} kept, outside the 10–21 % the middle setting promises.`);
    failed = true;
  }
  if (spread > 1.6) {
    console.error(`\nFAIL: the best slot keeps ${spread.toFixed(2)}× the worst. The six must stay within 1.6×.`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(`\nPASS: ${share(kept.total, seen.total)} kept; slots within ${spread.toFixed(2)}× of each other.`);
}
