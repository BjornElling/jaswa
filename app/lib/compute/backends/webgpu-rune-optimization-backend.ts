/**
 * **Rune Optimization's tail, packed for the graphics card.**
 *
 * The processor's version is the tail of `rune-optimization-search.ts`, and it stays
 * the reference. What the card is handed is narrower than what the processor does:
 * not "which builds make the table" but "which of these pairs *could*", read
 * generously, with the answer checked pair by pair on the processor. So the card
 * decides nothing — every threshold, gate, tie-break, set rule and item count stays
 * where `HARDWARE-ACCELERATION.md` §2 keeps them — and a card whose arithmetic
 * drifted a little would cost time, not a build.
 *
 * ## The agreement gate
 *
 * A card whose arithmetic drifted a lot would cost builds, because a pair it leaves
 * off the shortlist is never looked at again. So before a single real pass is sent,
 * `runeOptimizationAgreement` puts a battery of hand-built blocks through the card
 * and requires two things of its answer: **every** pair the processor says clears
 * the bar is on the shortlist, and no pair on the shortlist falls short by more
 * than the slack the layout allows. A third case clears more pairs than a pass can
 * report and must say so rather than hand back a truncated list.
 */
import {
  baseLength, combatAt, criRateFloorAt, effectSlot, effectSlotCount, figuresInto, targetFigureCount, totalCount, totalsInto,
} from '../../monster-stats';
import type { PassLimits, TailCard, TailPass, TailQuestion } from '../../rune-optimization-search';
import { metricDmg, metricEhp, metricEhpD } from '../../rune-potential-metrics';
import {
  absoluteSlack, noFloor, questionBarAt, questionBaseAt, questionFloorsAt, questionLength,
  questionRankAt, relativeSlack, survivorBlockAt, survivorBytes, survivorCapacity, survivorCountAt,
  survivorPairAt, survivorStride, survivorsAt,
} from '../webgpu/rune-optimization-layout';
import { runeOptimizationShader } from '../webgpu/rune-optimization-shader';
import type { GpuContext } from '../gpu/gpu-context';

/**
 * **How much one pass holds: 32,768 blocks or 2²⁵ pairs, whichever comes first.**
 *
 * The blocks bound the buffers — 64 bytes each, two megabytes a pass — and keep the
 * workgroup count well inside what the dispatch splits into two dimensions. The
 * pairs bound the time: 33 million pairs is a few milliseconds on a current card,
 * long enough that the round trip does not dominate and short enough that a pass
 * never approaches the driver's watchdog.
 */
export const runeOptimizationPassLimits: PassLimits = { blocks: 32768, pairs: 1 << 25 };

const floorOf = (value: number): number => (Number.isFinite(value) ? value : noFloor);

/** The card half of one search: the question packed once, and a function per pass. */
export function tailCardOnGpu(question: TailQuestion, context: GpuContext): TailCard {
  const packedQuestion = new Float32Array(questionLength);
  for (let at = 0; at < baseLength; at += 1) packedQuestion[questionBaseAt + at] = question.base[at];
  for (let at = 0; at < targetFigureCount; at += 1) packedQuestion[questionFloorsAt + at] = floorOf(question.targets[at]);
  packedQuestion[questionRankAt] = question.rank;
  const candidates = Float32Array.from(question.candidates);

  return async (pass: TailPass, bar: number): Promise<Uint32Array | null> => {
    if (pass.blocks === 0) return new Uint32Array(0);
    packedQuestion[questionBarAt] = floorOf(bar);
    const output = await context.run({
      shader: 'rune-optimization',
      code: runeOptimizationShader,
      inputs: [
        { data: packedQuestion }, { data: candidates },
        { data: Float32Array.from(pass.bases) }, { data: pass.ranges },
      ],
      outputBytes: survivorBytes,
      workgroups: pass.blocks,
    });
    const words = new Uint32Array(output);
    if (words.length !== survivorBytes / Uint32Array.BYTES_PER_ELEMENT) {
      throw new Error('The graphics card returned an invalid rune optimization buffer.');
    }
    const cleared = words[survivorCountAt];
    if (cleared > survivorCapacity) return null;
    /* Handed on in the search's own shape — block, then pair — whatever order the
       layout keeps them in. */
    const survivors = new Uint32Array(cleared * 2);
    for (let at = 0; at < cleared; at += 1) {
      const from = survivorsAt + at * survivorStride;
      survivors[at * 2] = words[from + survivorBlockAt];
      survivors[at * 2 + 1] = words[from + survivorPairAt];
    }
    return survivors;
  };
}

/* ------------------------------------------------------------ the battery */

/** A small deterministic stream, so the battery is the same on every machine. */
function stream(seed: number) {
  let state = seed >>> 0;
  return (low: number, high: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return low + (state % (high - low + 1));
  };
}

type Battery = { question: TailQuestion; pass: TailPass };

/*
 * Two groups of candidates with every accumulator in play, and blocks whose bases
 * differ, so a misread accumulator, a swapped group or a wrong block index each
 * changes the answer. Values are whole numbers and quarters, like a real rune's.
 */
function battery(seed: number, firstCount: number, lastCount: number, blocks: number): Battery {
  const draw = stream(seed);
  const ranges: Array<[number, number]> = [[0, 60], [0, 900], [0, 60], [0, 90], [0, 60], [0, 90], [0, 0], [0, 45], [0, 40], [0, 70], [0, 40], [0, 40], [0, 24], [0, 24], [0, 24], [0, 30], [0, 30]];
  const candidates = new Float64Array((firstCount + lastCount) * effectSlotCount);
  for (let at = 0; at < firstCount + lastCount; at += 1) {
    for (let slot = 0; slot < effectSlotCount; slot += 1) {
      const [low, high] = ranges[slot];
      candidates[at * effectSlotCount + slot] = draw(low * 4, high * 4) / 4;
    }
  }
  const bases = new Float64Array(blocks * effectSlotCount);
  const blockRanges = new Uint32Array(blocks * 4);
  for (let block = 0; block < blocks; block += 1) {
    for (let slot = 0; slot < effectSlotCount; slot += 1) {
      const [low, high] = ranges[slot];
      bases[block * effectSlotCount + slot] = draw(low * 8, high * 16) / 4;
    }
    /* Each block takes a different stretch of each group, so a pair numbered in the
       wrong block reads different candidates. */
    const firstFrom = draw(0, Math.floor(firstCount / 3));
    const lastFrom = draw(0, Math.floor(lastCount / 3));
    blockRanges[block * 4] = firstFrom;
    blockRanges[block * 4 + 1] = firstCount - firstFrom;
    blockRanges[block * 4 + 2] = firstCount + lastFrom;
    blockRanges[block * 4 + 3] = lastCount - lastFrom;
  }
  let pairs = 0;
  for (let block = 0; block < blocks; block += 1) pairs += blockRanges[block * 4 + 1] * blockRanges[block * 4 + 3];
  const question: TailQuestion = {
    /* Every lead, the totem and a crit floor in play, so a misread combat slot
       changes a figure. The floor sits inside the CRI Rates the battery draws,
       so some pairs are lifted to it and some are not. */
    base: Float64Array.of(10125, 714, 648, 101, 15, 50, 15, 0, 20, 33, 15, 14.5, 30, 25, 41, 25, 40),
    targets: new Float64Array(targetFigureCount).fill(Number.NaN),
    rank: 8,
    candidates,
  };
  return { question, pass: { blocks, pairs, bases, ranges: blockRanges } };
}

/*
 * The most the card is *meant* to overstate a pair by, in double precision: each
 * rounded stat a point high, the composites unfloored, and the slack on top. A
 * shortlisted pair whose figures fall short even of this was put there by
 * arithmetic that has gone wrong, not by generosity.
 */
function generousFigures(base: Float64Array, effects: Float64Array, out: Float64Array) {
  const raised = (stat: number, percent: number, flat: number, lead: number) => base[stat] * (100 + effects[percent] + lead) / 100 + 1 + effects[flat];
  out[0] = raised(0, effectSlot.hpPercent, effectSlot.hpFlat, base[combatAt.hp] + effects[effectSlot.teamHpPercent]);
  out[1] = raised(1, effectSlot.atkPercent, effectSlot.atkFlat, base[combatAt.atk] + effects[effectSlot.teamAtkPercent]);
  out[2] = raised(2, effectSlot.defPercent, effectSlot.defFlat, base[combatAt.def] + effects[effectSlot.teamDefPercent]);
  out[3] = raised(3, effectSlot.spdPercent, effectSlot.spdFlat, base[combatAt.spd]);
  out[4] = Math.max(base[4] + effects[effectSlot.criticalRate] + base[combatAt.criRate], base[criRateFloorAt]);
  out[5] = base[5] + effects[effectSlot.criticalDamage] + base[combatAt.criDmg];
  out[6] = base[6] + effects[effectSlot.resistance] + effects[effectSlot.teamResistance] + base[combatAt.res];
  out[7] = base[7] + effects[effectSlot.accuracy] + effects[effectSlot.teamAccuracy] + base[combatAt.acc];
  out[8] = metricDmg(out[1], out[4], out[5]);
  out[9] = metricEhp(out[0], out[2]);
  out[10] = metricEhpD(out[0], out[2]);
  for (let at = 0; at < targetFigureCount; at += 1) out[at] += Math.abs(out[at]) * relativeSlack + absoluteSlack;
}

type Reading = { exact: Float64Array; generous: Float64Array };

/** Every pair's figures, the processor's way and the card's intended way. */
function readings({ question, pass }: Battery): Reading[][] {
  const effects = new Float64Array(effectSlotCount);
  const totals = new Float64Array(totalCount);
  const byBlock: Reading[][] = [];
  for (let block = 0; block < pass.blocks; block += 1) {
    const [firstStart, firstCount, lastStart, lastCount] = pass.ranges.subarray(block * 4, block * 4 + 4);
    const list: Reading[] = [];
    for (let pair = 0; pair < firstCount * lastCount; pair += 1) {
      const first = firstStart + Math.floor(pair / lastCount);
      const last = lastStart + (pair % lastCount);
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        effects[slot] = pass.bases[block * effectSlotCount + slot]
          + question.candidates[first * effectSlotCount + slot] + question.candidates[last * effectSlotCount + slot];
      }
      totalsInto(question.base, effects, totals);
      const exact = new Float64Array(targetFigureCount);
      figuresInto(totals, exact);
      const generous = new Float64Array(targetFigureCount);
      generousFigures(question.base, effects, generous);
      list.push({ exact, generous });
    }
    byBlock.push(list);
  }
  return byBlock;
}

/* Single precision against double over this arithmetic: about one part in ten
   million. A hundred times that, and half a point. */
const clearsWithin = (value: number, threshold: number) => value + Math.abs(value) * 1e-5 + 0.5 >= threshold;

function quantile(values: number[], share: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/**
 * Does this card shortlist the same pairs the processor would keep?
 *
 * Built here rather than taken from an account, so it exists whether or not anything
 * has been imported. The bar and floors sit in the middle of the pairs' own figures,
 * so a large share of them lies close to a threshold on one side or the other — which
 * is exactly where a card that rounds wrongly would show it.
 */
export async function runeOptimizationAgreement(context: GpuContext): Promise<boolean> {
  for (const [seed, rank, floorOn] of [[1, 8, 3], [2, 9, 4], [3, 10, 8], [4, 3, 9]] as const) {
    const built = battery(seed, 23, 31, 9);
    built.question.rank = rank;
    const byBlock = readings(built);
    const every = byBlock.flat();
    const bar = quantile(every.map((row) => row.exact[rank]), 0.6);
    const floor = quantile(every.map((row) => row.exact[floorOn]), 0.3);
    built.question.targets[floorOn] = floor;

    const survivors = await tailCardOnGpu(built.question, context)(built.pass, bar);
    if (survivors === null) return false;
    const listed = new Set<number>();
    for (let at = 0; at < survivors.length; at += 2) {
      const block = survivors[at];
      const pair = survivors[at + 1];
      if (block >= built.pass.blocks || pair >= byBlock[block].length) return false;
      const key = block * 1_000_000 + pair;
      if (listed.has(key)) return false;
      listed.add(key);
      /* Nothing on the shortlist may be there by more than generosity. */
      const { generous } = byBlock[block][pair];
      if (!clearsWithin(generous[rank], bar) || !clearsWithin(generous[floorOn], floor)) return false;
    }
    /* And nothing the processor keeps may be missing from it. */
    for (let block = 0; block < byBlock.length; block += 1) {
      for (let pair = 0; pair < byBlock[block].length; pair += 1) {
        const { exact } = byBlock[block][pair];
        if (exact[rank] >= bar && exact[floorOn] >= floor && !listed.has(block * 1_000_000 + pair)) return false;
      }
    }
  }

  /* A pass that clears more pairs than the card can report must say so rather than
     hand back a truncated list: one block of 300 × 300, with no bar at all. */
  const wide = battery(5, 300, 300, 1);
  wide.pass.ranges.set([0, 300, 300, 300]);
  wide.pass.pairs = 300 * 300;
  if (wide.pass.pairs <= survivorCapacity) return false;
  const overflow = await tailCardOnGpu(wide.question, context)(wide.pass, -Infinity);
  return overflow === null;
}
