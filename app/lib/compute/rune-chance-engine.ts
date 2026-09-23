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
import { countJobsOnGpu, runeChanceAgreement } from './backends/webgpu-rune-chance-backend';
import type { ComputeBackend } from './calculation-summary';

const runeChanceCalculation: AcceleratedCalculation<readonly CountingJob[], Float64Array> = {
  name: 'rune-chance',
  cpu: (jobs) => countJobs(jobs),
  gpu: (jobs, context) => countJobsOnGpu(jobs, context),
  agrees: runeChanceAgreement,
};

export async function countRuneChances(
  jobs: readonly CountingJob[], preferWebGpu: boolean,
): Promise<{ shares: Float64Array; backend: ComputeBackend }> {
  /* Nothing to count is not a card failure and not a card success: it is an account
     whose every rune was settled on its reachable best or worst. Saying the processor
     answered is the true statement. */
  if (jobs.length === 0) return { shares: new Float64Array(0), backend: 'cpu' };
  const answer = await runAccelerated(runeChanceCalculation, jobs, preferWebGpu);
  return { shares: answer.result, backend: answer.backend };
}
