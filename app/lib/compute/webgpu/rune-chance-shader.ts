import { gpuIndexPreamble } from '../gpu/gpu-context';
import { chanceLanes, runeChanceConstants } from './rune-chance-layout';

/**
 * **The counting step, on the graphics card.**
 *
 * It does exactly what `countJobs` does on the processor: play one rune forward to
 * `+12` a few thousand times, apply the craft rules to each end state, and count how
 * many cleared the bar. One job is one workgroup; each of its 64 lanes runs its own
 * share of the runs and writes its own count, and the caller adds the 64 together.
 * Nothing is reduced on the card, because adding 64 numbers is not what a card is for
 * and a shared-memory reduction is one more thing to get wrong.
 *
 * Every offset it reads comes from `rune-chance-layout.ts`, interpolated below, so
 * the packing and the reading cannot disagree about where a field is — which is the
 * one bug of this kind that WebGPU will not report, because a misread buffer is still
 * a buffer full of numbers.
 *
 * ## Why the two engines can be held to each other
 *
 * The draws are **integer arithmetic on both sides** — the same hash of the same
 * counter, and the same multiply-high for turning it into a number below a bound. So
 * the card and the processor play the rune forward through exactly the same runs,
 * down to the last roll, and the only thing that can differ is the arithmetic that
 * prices them: a card works in single precision and the processor in double. That
 * moves a score by about one part in ten million, which can change the verdict of a
 * run sitting within that of the bar — a handful of runs in four thousand at the very
 * worst, and invisible in a printed percentage.
 *
 * `runeChanceAgreement` in the backend is what enforces that, on this machine's own
 * card, before a single real answer is taken from it.
 */
const declarations = Object.entries(runeChanceConstants)
  .map(([name, value]) => `const ${name}: u32 = ${value}u;`).join('\n');

export const runeChanceShader = /* wgsl */`
${declarations}

${gpuIndexPreamble}

@group(0) @binding(0) var<storage, read> runes: array<i32>;
@group(0) @binding(1) var<storage, read> scorings: array<f32>;
@group(0) @binding(2) var<storage, read> jobs: array<i32>;
@group(0) @binding(3) var<storage, read> targets: array<f32>;
@group(0) @binding(4) var<storage, read_write> counts: array<u32>;

// The finalizer of Chris Wellons's lowbias32, which the processor runs verbatim.
fn mix32(value: u32) -> u32 {
  var h = value;
  h = h ^ (h >> 16u);
  h = h * 0x7feb352du;
  h = h ^ (h >> 15u);
  h = h * 0x846ca68bu;
  return h ^ (h >> 16u);
}

// floor(h * bound / 2^32), without a 64-bit multiply and without a float anywhere.
// A float would round the hash above 2^24 and the two engines would then draw
// different rolls; every bound here is under 512, so both halves stay inside u32.
fn drawBelow(seed: u32, counter: u32, bound: u32) -> u32 {
  let h = mix32(seed ^ counter);
  let hi = h >> 16u;
  let lo = h & 0xffffu;
  return (bound * hi + ((bound * lo) >> 16u)) >> 16u;
}

struct Line { statId: i32, value: i32, grind: i32 }

@compute @workgroup_size(${chanceLanes})
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let thread = flatIndex(invocation);
  let jobIndex = thread / WORKGROUP_SIZE;
  let lane = thread % WORKGROUP_SIZE;
  if (jobIndex >= arrayLength(&targets)) { return; }

  let job = jobIndex * JOB_STRIDE;
  let runeAt = u32(jobs[job + JOB_RUNE_AT]) * RUNE_STRIDE;
  let scoringAt = u32(jobs[job + JOB_SCORING_AT]) * SCORING_STRIDE;
  let runCount = u32(jobs[job + JOB_RUNS_AT]);
  let wanted = targets[jobIndex];

  // The rune's own main property and innate are packed but not read here: they only
  // decide which effect ids a Gem may legally take, and that filter was applied when
  // the options were packed, because nothing a run does can change it.
  let gemmedAt = runes[runeAt + RUNE_GEMMED_AT];
  let heldCount = u32(runes[runeAt + RUNE_HELD_COUNT_AT]);
  let upgrades = u32(runes[runeAt + RUNE_UPGRADES_AT]);
  let additions = u32(runes[runeAt + RUNE_ADDITIONS_AT]);
  let poolCount = u32(runes[runeAt + RUNE_POOL_COUNT_AT]);
  let seed = u32(runes[runeAt + RUNE_SEED_AT]);
  let lineCount = heldCount + additions;

  let prefixScore = scorings[scoringAt + SCORING_PREFIX_AT];
  let gemCount = u32(scorings[scoringAt + SCORING_GEM_COUNT_AT]);

  var lines: array<Line, MAX_LINES>;
  var bag: array<i32, MAX_POOL>;
  var order: array<u32, MAX_POOL>;
  var lineValue: array<f32, MAX_LINES>;

  var hits: u32 = 0u;
  var run = lane;
  loop {
    if (run >= runCount) { break; }
    let counter = run * DRAWS_PER_RUN;

    // The lines it holds now, which are the only ones an improvement can touch.
    for (var at: u32 = 0u; at < heldCount; at = at + 1u) {
      let base = runeAt + RUNE_LINES_AT + at * LINE_STRIDE;
      lines[at] = Line(runes[base], runes[base + 1u], runes[base + 2u]);
    }
    for (var step: u32 = 0u; step < upgrades; step = step + 1u) {
      if (heldCount == 0u) { break; }
      let target = drawBelow(seed, counter + step * 2u, heldCount);
      let base = runeAt + RUNE_LINES_AT + target * LINE_STRIDE;
      let low = runes[base + 3u];
      let high = runes[base + 4u];
      let roll = low + i32(drawBelow(seed, counter + step * 2u + 1u, u32(high - low + 1)));
      lines[target].value = lines[target].value + roll;
    }

    // The lines it gains, drawn without replacement, each with one initial roll.
    for (var index: u32 = 0u; index < poolCount; index = index + 1u) {
      bag[index] = runes[runeAt + RUNE_POOL_AT + index * POOL_STRIDE];
      order[index] = index;
    }
    var left = poolCount;
    for (var step: u32 = 0u; step < additions; step = step + 1u) {
      let pick = drawBelow(seed, counter + ADDITION_DRAWS_AT + step * 2u, left);
      let index = order[pick];
      let statId = bag[pick];
      left = left - 1u;
      bag[pick] = bag[left];
      order[pick] = order[left];
      let base = runeAt + RUNE_POOL_AT + index * POOL_STRIDE;
      let low = runes[base + 1u];
      let high = runes[base + 2u];
      let roll = low + i32(drawBelow(seed, counter + ADDITION_DRAWS_AT + 1u + step * 2u, u32(high - low + 1)));
      lines[heldCount + step] = Line(statId, roll, 0);
    }

    // The end state: every line with its stone, and then the one Gem where it helps.
    var total = prefixScore;
    for (var at: u32 = 0u; at < lineCount; at = at + 1u) {
      let statId = u32(lines[at].statId);
      let stone = scorings[scoringAt + SCORING_GRIND_AT + statId];
      let ground = f32(lines[at].value) + max(f32(lines[at].grind), stone);
      lineValue[at] = ground * scorings[scoringAt + statId];
      total = total + lineValue[at];
    }
    if (gemCount > 0u) {
      var bestGain = 0.0;
      for (var at: u32 = 0u; at < lineCount; at = at + 1u) {
        // One converted line at a time, and a later Gem may only replace that one.
        if (gemmedAt >= 0 && i32(at) != gemmedAt) { continue; }
        var best = -1.0e30;
        var foundOther = false;
        for (var index: u32 = 0u; index < gemCount; index = index + 1u) {
          let entry = scoringAt + SCORING_GEMS_AT + index * GEM_STRIDE;
          let statId = i32(scorings[entry]);
          if (statId == lines[at].statId) {
            // Re-rolling the line's own id keeps whatever stone is already there,
            // which a credited one can only improve.
            let stone = scorings[scoringAt + SCORING_GRIND_AT + u32(statId)];
            let ground = scorings[entry + 2u] + max(f32(lines[at].grind), stone);
            let same = ground * scorings[scoringAt + u32(statId)];
            if (same > best) { best = same; }
            if (foundOther) { break; }
            continue;
          }
          if (foundOther) { continue; }
          var blocked = false;
          for (var other: u32 = 0u; other < lineCount; other = other + 1u) {
            if (other != at && lines[other].statId == statId) { blocked = true; }
          }
          if (blocked) { continue; }
          if (scorings[entry + 1u] > best) { best = scorings[entry + 1u]; }
          foundOther = true;
        }
        if (best <= -1.0e29) { continue; }
        let gain = best - lineValue[at];
        if (gain > bestGain) { bestGain = gain; }
      }
      total = total + bestGain;
    }
    if (total >= wanted) { hits = hits + 1u; }
    run = run + WORKGROUP_SIZE;
  }
  counts[jobIndex * WORKGROUP_SIZE + lane] = hits;
}
`;
