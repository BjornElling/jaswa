/**
 * Rune Clean-up's odds, on whichever engine the user's setting allows.
 *
 * It is a thin file on purpose. The decision of *which* engine belongs to
 * `accelerated-calculation.ts`, the processor's arithmetic belongs to
 * `rune-power-up-outcomes.ts`, and the card's packing belongs to its own backend.
 * What is left here is the one statement tying the three together, so that adding a
 * second accelerated calculation is a file like this one rather than a decision to
 * make again.
 */
import { countJobs } from '../rune-power-up-outcomes';
import type { CountingJob } from '../rune-power-up-outcomes';
import { runAccelerated } from './accelerated-calculation';
import type { AcceleratedCalculation } from './accelerated-calculation';
import {
  countJobsOnGpu, runeChanceAgreement, runeChanceAgreementTolerance,
} from './backends/webgpu-rune-chance-backend';
import { combineCalculationBackends } from './calculation-summary';
import type { CalculationBackend } from './calculation-summary';

const runeChanceCalculation: AcceleratedCalculation<readonly CountingJob[], Float64Array> = {
  name: 'rune-chance',
  cpu: (jobs) => countJobs(jobs),
  gpu: (jobs, context) => countJobsOnGpu(jobs, context),
  agrees: runeChanceAgreement,
};

export async function countRuneChances(
  jobs: readonly CountingJob[], preferWebGpu: boolean, chanceBar?: number,
): Promise<{ shares: Float64Array; backend: CalculationBackend }> {
  /* Nothing to count is not a card failure and not a card success: it is an account
     whose every rune was settled on its reachable best or worst. Saying the processor
     answered is the true statement. */
  if (jobs.length === 0) return { shares: new Float64Array(0), backend: 'cpu' };
  const answer = await runAccelerated(runeChanceCalculation, jobs, preferWebGpu);
  if (answer.backend !== 'webgpu' || chanceBar === undefined) {
    return { shares: answer.result, backend: answer.backend };
  }

  /* The GPU agreement gate protects the estimate's arithmetic, but the policy
     compares that estimate to a hard bar. Recheck only jobs close enough to the
     active bar that single-precision drift could change the verdict. This keeps
     the GPU useful for the ordinary case and makes the policy decision independent
     of which engine answered. */
  const sensitiveIndexes: number[] = [];
  const sensitiveJobs: CountingJob[] = [];
  for (let at = 0; at < jobs.length; at += 1) {
    if (Math.abs(answer.result[at] - chanceBar) <= runeChanceAgreementTolerance) {
      sensitiveIndexes.push(at);
      sensitiveJobs.push(jobs[at]);
    }
  }
  if (sensitiveIndexes.length === 0) return { shares: answer.result, backend: answer.backend };

  const shares = new Float64Array(answer.result);
  const cpuShares = countJobs(sensitiveJobs);
  for (let at = 0; at < sensitiveIndexes.length; at += 1) {
    shares[sensitiveIndexes[at]] = cpuShares[at];
  }
  return { shares, backend: combineCalculationBackends([answer.backend, 'cpu']) };
}
