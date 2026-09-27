/**
 * **Rune Clean-up's counting step, packed for the graphics card.**
 *
 * The processor's version is `countJobs` in `rune-power-up-outcomes.ts`, and it stays
 * the reference: this backend decides nothing the processor would decide differently,
 * it runs the same runs in parallel. Everything upstream of a job — which runes are
 * certain noes, which are certain yeses, and what bar each preset sets — has already
 * happened on the processor by the time anything here is packed.
 *
 * ## The agreement gate
 *
 * A shader is a second implementation of arithmetic the processor also does, which is
 * exactly the kind of thing that drifts silently. So before a single real answer is
 * taken from a card, `runeChanceAgreement` puts a small battery of hand-built runes
 * through both and compares. A card that disagrees is not used at all, and the status
 * line says Processor — a visible, honest failure rather than a table of quietly
 * wrong percentages.
 *
 * The tolerance is not zero and cannot be. The *runs* are bit-identical, because every
 * draw is integer arithmetic on both sides. What differs is the pricing: a card works
 * in single precision and the processor in double. The gate allows one percentage
 * point of share difference for accumulated rounding; the caller separately sends
 * jobs near the active policy bar back through the processor before settling the
 * verdict.
 */
import {
  countJobs, endStateScoring, playForward, runeFuture, runScore,
} from '../../rune-power-up-outcomes';
import type { CountingJob, EndStateScoring, RuneFuture } from '../../rune-power-up-outcomes';
import { craftPlan } from '../../rune-craft-end-state';
import { allStatIds } from '../../rune-properties';
import type { Rune, RuneSubProperty } from '../../runes';
import type { Valuation } from '../../rune-substat-weights';
import { runeChanceShader } from '../webgpu/rune-chance-shader';
import {
  chanceLanes, gemEntryStride, gemRollAt, gemStatAt, gemValueAt, jobRunsAt, jobRuneAt,
  jobScoringAt, jobStride, lineGrindAt, lineStatAt, lineStride, lineUpgradeMaximumAt,
  lineUpgradeMinimumAt, lineValueAt, maxLines, maxPool, poolInitialMaximumAt,
  poolInitialMinimumAt, poolStatAt, poolEntryStride, runeAdditionsAt, runeGemmedAt,
  runeHeldCountAt, runeLinesAt, runeMainAt, runePoolAt, runePoolCountAt, runePrefixAt,
  runeSeedAt, runeSlotAt, runeStride, runeUpgradesAt, scoringGemCountAt, scoringGemsAt,
  scoringGrindAt, scoringPrefixAt, scoringPricesAt, scoringStride,
} from '../webgpu/rune-chance-layout';
import type { GpuContext } from '../gpu/gpu-context';

/** What the two engines may differ by on one job's share before the card is refused. */
export const runeChanceAgreementTolerance = 0.01;

function packRune(into: Int32Array, at: number, future: RuneFuture): void {
  const { rune, held } = future;
  /* **A rune the card cannot hold is refused, never trimmed.**
     A rune's substats end at `+12` with four sub properties: `remainingEvents` writes one event
     per missing line, so `held + additions` is exactly four for every rune the game
     can produce. An export whose grade and sub-property count disagree could make it
     five, and the shader's line array is a fixed four — WGSL would clamp the write
     and hand back a number that is simply wrong, with nothing to report it. The
     processor sizes its buffer per rune and answers correctly, so throwing here is a
     fall back rather than a failure. */
  if (!Number.isInteger(future.additions) || future.additions < 0
    || held.length > maxLines || held.length + future.additions > maxLines
    || future.pool.length > maxPool || future.pool.length !== future.poolInitial.length) {
    throw new Error(`Rune ${rune.id} does not fit the graphics card's fixed line-up.`);
  }
  const lines = held.length;
  const pool = future.pool.length;
  into[at + runeSlotAt] = rune.slot;
  into[at + runeMainAt] = rune.mainStatId;
  into[at + runePrefixAt] = rune.prefixStatId ?? -1;
  into[at + runeGemmedAt] = future.gemmedAt;
  into[at + runeHeldCountAt] = lines;
  into[at + runeUpgradesAt] = future.upgrades;
  into[at + runeAdditionsAt] = future.additions;
  into[at + runePoolCountAt] = pool;
  /* A u32 seed written into an i32 slot. The shader reads it straight back as u32,
     so the sign it takes on the way through changes none of its bits. */
  into[at + runeSeedAt] = future.seed | 0;
  for (let line = 0; line < lines; line += 1) {
    const base = at + runeLinesAt + line * lineStride;
    into[base + lineStatAt] = held[line].statId;
    into[base + lineValueAt] = held[line].value;
    into[base + lineGrindAt] = held[line].grind;
    into[base + lineUpgradeMinimumAt] = future.heldUpgrade[line].minimum;
    into[base + lineUpgradeMaximumAt] = future.heldUpgrade[line].maximum;
  }
  for (let index = 0; index < pool; index += 1) {
    const base = at + runePoolAt + index * poolEntryStride;
    into[base + poolStatAt] = future.pool[index];
    into[base + poolInitialMinimumAt] = future.poolInitial[index].minimum;
    into[base + poolInitialMaximumAt] = future.poolInitial[index].maximum;
  }
}

function packScoring(into: Float32Array, at: number, scoring: EndStateScoring): void {
  for (const statId of allStatIds) {
    into[at + scoringPricesAt + statId] = scoring.prices[statId];
    into[at + scoringGrindAt + statId] = scoring.plan.grind[statId];
  }
  into[at + scoringPrefixAt] = scoring.prefixScore;
  into[at + scoringGemCountAt] = scoring.options.statIds.length;
  for (let index = 0; index < scoring.options.statIds.length; index += 1) {
    const base = at + scoringGemsAt + index * gemEntryStride;
    into[base + gemStatAt] = scoring.options.statIds[index];
    into[base + gemValueAt] = scoring.options.values[index];
    into[base + gemRollAt] = scoring.options.rolls[index];
  }
}

/**
 * One buffer set from a list of jobs.
 *
 * Runes and price lists are de-duplicated on object identity, which is exactly the
 * sharing the model already arranges: one `RuneFuture` per rune however many presets
 * ask about it, and one `EndStateScoring` per role and craft credit. On a real box
 * that turns tens of thousands of jobs into a few thousand rune records and a few
 * dozen price lists.
 */
function pack(jobs: readonly CountingJob[]) {
  const runeIndexes = new Map<RuneFuture, number>();
  const scoringIndexes = new Map<EndStateScoring, number>();
  const jobData = new Int32Array(jobs.length * jobStride);
  const targets = new Float32Array(jobs.length);
  for (let at = 0; at < jobs.length; at += 1) {
    const job = jobs[at];
    let runeIndex = runeIndexes.get(job.future);
    if (runeIndex === undefined) { runeIndex = runeIndexes.size; runeIndexes.set(job.future, runeIndex); }
    let scoringIndex = scoringIndexes.get(job.scoring);
    if (scoringIndex === undefined) { scoringIndex = scoringIndexes.size; scoringIndexes.set(job.scoring, scoringIndex); }
    jobData[at * jobStride + jobRuneAt] = runeIndex;
    jobData[at * jobStride + jobScoringAt] = scoringIndex;
    jobData[at * jobStride + jobRunsAt] = job.runs;
    targets[at] = job.wanted;
  }
  const runes = new Int32Array(Math.max(1, runeIndexes.size) * runeStride);
  for (const [future, index] of runeIndexes) packRune(runes, index * runeStride, future);
  const scorings = new Float32Array(Math.max(1, scoringIndexes.size) * scoringStride);
  for (const [scoring, index] of scoringIndexes) packScoring(scorings, index * scoringStride, scoring);
  return { runes, scorings, jobs: jobData, targets };
}

/**
 * **How many jobs one pass carries: 65,536.**
 *
 * A job writes one count per lane, so the answer buffer is 256 bytes of it — and
 * every WebGPU implementation guarantees only 128 MiB for one storage binding, which
 * 524,288 jobs would pass. That is not a hypothetical size: `rune-advice-client.ts`
 * names an account of several thousand runes against thirty user presets as the
 * reason the worker exists, and such an account raises jobs by the hundred thousand.
 *
 * Going over would not be wrong, it would be *refused* — the pass is rejected, the
 * validation scope throws and the processor answers instead. So the card would be
 * dropped precisely on the accounts it was bought for. Jobs are independent, so
 * splitting costs nothing but a second dispatch, and 16 MiB a pass leaves room on any
 * card. The same bound keeps the workgroup count inside one dispatch dimension.
 */
const jobsPerPass = 65536;

export async function countJobsOnGpu(
  jobs: readonly CountingJob[], context: GpuContext,
): Promise<Float64Array> {
  if (jobs.length === 0) return new Float64Array(0);
  const shares = new Float64Array(jobs.length);
  for (let from = 0; from < jobs.length; from += jobsPerPass) {
    const slice = jobs.slice(from, from + jobsPerPass);
    const packed = pack(slice);
    const output = await context.run({
      shader: 'rune-chance',
      code: runeChanceShader,
      inputs: [
        { data: packed.runes }, { data: packed.scorings },
        { data: packed.jobs }, { data: packed.targets },
      ],
      outputBytes: slice.length * chanceLanes * Uint32Array.BYTES_PER_ELEMENT,
      workgroups: slice.length,
    });
    const counts = new Uint32Array(output);
    if (counts.length !== slice.length * chanceLanes) {
      throw new Error('The graphics card returned an invalid rune chance buffer.');
    }
    for (let at = 0; at < slice.length; at += 1) {
      let hits = 0;
      const runs = slice[at].runs;
      if (!Number.isInteger(runs) || runs <= 0) {
        throw new Error('Rune chance jobs must have a positive integer run count.');
      }
      for (let lane = 0; lane < chanceLanes; lane += 1) {
        const laneHits = counts[at * chanceLanes + lane];
        if (laneHits > runs) throw new Error('The graphics card returned too many rune chance hits.');
        hits += laneHits;
      }
      const share = hits / runs;
      if (!Number.isFinite(share) || share < 0 || share > 1) {
        throw new Error('The graphics card returned an invalid rune chance.');
      }
      shares[from + at] = share;
    }
  }
  return shares;
}

/**
 * Does this card play the same runes forward the same way?
 *
 * The battery is built here rather than taken from an account, so it exists whether
 * or not anything has been imported, and it covers the four things the shader could
 * get wrong on its own: a rune with improvements only, one with additions only, one
 * with both, and one already carrying a converted line — each scored by a role that
 * wants every stat by a different amount, with a Gem and a stone credited so the
 * craft branch runs.
 */
export async function runeChanceAgreement(context: GpuContext): Promise<boolean> {
  const jobs = agreementJobs();
  if (jobs.length === 0) return false;
  const theirs = await countJobsOnGpu(jobs, context);
  const ours = countJobs(jobs);
  for (let at = 0; at < jobs.length; at += 1) {
    if (!(Math.abs(theirs[at] - ours[at]) <= runeChanceAgreementTolerance)) return false;
  }
  return true;
}

/** Every stat wanted, none of them alike, so a wrong effect id cannot go unnoticed. */
const agreementPrices: Readonly<Record<number, number>> = {
  1: 0.0004, 2: 0.13, 3: 0.006, 4: 0.11, 5: 0.005, 6: 0.03,
  8: 0.17, 9: 0.12, 10: 0.07, 11: 0.02, 12: 0.05,
};

const agreementValuation: Valuation = {
  key: 'rune-chance-agreement',
  value: (statId, raw) => raw * (agreementPrices[statId] ?? 0),
};

function agreementRune(
  index: number, grade: Rune['defaultGrade'], level: number, lines: number, gemmed: boolean,
): Rune {
  const subProperties: RuneSubProperty[] = [2, 4, 9, 10].slice(0, lines).map((statId, line) => ({
    statId, value: 5 + line * 2, gemmed: gemmed && line === 0, grind: line === 1 ? 3 : 0,
  }));
  return {
    id: `agreement-${index}`, setId: 1, setName: 'Violent', slot: 2, stars: 6,
    ancient: index === 2, defaultGrade: grade, level, mainStatId: 8, mainValue: 0,
    prefixStatId: index % 2 === 0 ? 11 : null, prefixValue: 6,
    subProperties, occupiedId: null, obtainedOrder: index + 1,
  };
}

function agreementJobs(): CountingJob[] {
  const plan = craftPlan('standard', {
    gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero',
  });
  /* Improvements only, additions only, both, and a rune already carrying a Gem. */
  const shapes: Array<[Rune['defaultGrade'], number, number, boolean]> = [
    ['Legend', 0, 4, false], ['Normal', 0, 0, false], ['Hero', 3, 3, false], ['Rare', 6, 2, true],
  ];
  const jobs: CountingJob[] = [];
  for (const [index, [grade, level, lines, gemmed]] of shapes.entries()) {
    const rune = agreementRune(index, grade, level, lines, gemmed);
    const future = runeFuture(rune);
    if (future.upgrades === 0 && future.additions === 0) continue;
    const scoring = endStateScoring(rune, agreementValuation, plan);
    /* Bars the rune clears in roughly a third, half and four fifths of its runs, so
       every job's answer is a share rather than a certainty and one run landing on
       the wrong side of a bar actually shows up in it. */
    const sample = playForward(future, 256);
    const scores: number[] = [];
    for (let run = 0; run < sample.count; run += 1) scores.push(runScore(sample, scoring, run));
    scores.sort((left, right) => left - right);
    for (const share of [0.8, 0.5, 0.2]) {
      jobs.push({ future, scoring, runs: 2048, wanted: scores[Math.floor((1 - share) * scores.length)] });
    }
  }
  return jobs;
}
