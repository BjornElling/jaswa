import { craftScoreLayout as L } from './craft-score-layout';
import type { ComputeBackend } from '../../shared/calculation-summary';

export type CraftScoreJob = { values: readonly number[]; prices: readonly number[]; discount: number };
/** The processor reference; the card's arithmetic must agree with it before it is used. */
export type ScoreCraftJobs = (jobs: readonly CraftScoreJob[], preferGpu: boolean)
  => Promise<{ result: Float64Array; backend: ComputeBackend }>;

/* No cap: 100 is the perfect ordinary rune, a reference point a rune may pass, and a
   Gem that lifts a rune further is still a Gem worth suggesting. */
export function craftScore(job: CraftScoreJob): number {
  let sum = 0;
  for (let at = 0; at < L.stats; at += 1) sum += job.values[at] * job.prices[at];
  return sum * job.discount;
}
