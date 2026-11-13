import { runAccelerated } from './accelerated-calculation';
import type { AcceleratedCalculation } from './accelerated-calculation';
import type { GpuContext } from '../gpu/gpu-context';
import { craftScoreLayout as L, craftScoreTolerance } from '../../domain/runes/craft-advice/craft-score-layout';
import { craftScore } from '../../domain/runes/craft-advice/craft-score';
import type { CraftScoreJob, ScoreCraftJobs } from '../../domain/runes/craft-advice/craft-score';

const shader = `
@group(0) @binding(0) var<storage, read> jobs: array<f32>;
@group(0) @binding(1) var<storage, read_write> scores: array<f32>;
@compute @workgroup_size(${L.workgroup})
fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let at = id.x + id.y * groups.x * ${L.workgroup}u;
  if (at >= arrayLength(&scores)) { return; }
  let base = at * ${L.stride}u;
  var sum = 0.0;
  for (var stat = 0u; stat < ${L.stats}u; stat++) {
    sum += jobs[base + ${L.values}u + stat] * jobs[base + ${L.prices}u + stat];
  }
  scores[at] = sum * jobs[base + ${L.discount}u];
}`;

async function onGpu(jobs: readonly CraftScoreJob[], context: GpuContext): Promise<Float64Array> {
  const packed = new Float32Array(jobs.length * L.stride);
  jobs.forEach((job, at) => {
    const base = at * L.stride;
    packed.set(job.values, base + L.values);
    packed.set(job.prices, base + L.prices);
    packed[base + L.discount] = job.discount;
  });
  const output = await context.run({ shader: 'craft-score', code: shader,
    inputs: [{ data: packed }], outputBytes: jobs.length * Float32Array.BYTES_PER_ELEMENT,
    workgroups: Math.ceil(jobs.length / L.workgroup) });
  const scores = Float64Array.from(new Float32Array(output));
  if (scores.some((score) => !Number.isFinite(score))) throw new Error('The card returned an unreadable craft score.');
  return scores;
}

export async function craftScoreAgreement(context: GpuContext): Promise<boolean> {
  const jobs = Array.from({ length: L.workgroup + 7 }, (_, index) => ({
    values: Array.from({ length: L.stats }, (_, stat) => (index + stat) * 3.25),
    prices: Array.from({ length: L.stats }, (_, stat) => stat / 317),
    discount: index % 3 ? 0.85 : 1,
  }));
  const results = await onGpu(jobs, context);
  return jobs.every((job, at) => Math.abs(craftScore(job) - results[at]) <= craftScoreTolerance);
}
const calculation: AcceleratedCalculation<readonly CraftScoreJob[], Float64Array> = {
  name: 'craft-score', cpu: (jobs) => Float64Array.from(jobs, craftScore), gpu: onGpu, agrees: craftScoreAgreement,
};
export const scoreCraftJobs: ScoreCraftJobs = (jobs, preferGpu) => runAccelerated(calculation, jobs, preferGpu);
