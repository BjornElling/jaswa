import { gpuIndexPreamble } from '../gpu-context';
import { chanceLanes, runeChanceConstants } from '../layouts/rune-chance-layout';

/**
 * **The counting step, on the graphics card.**
 *
 * It does exactly what `countJobs` does on the processor: play one rune forward to
 * `+12` a few thousand times, apply the craft rules to each final substat state, and count how
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
      lines[at] = Line(
        runes[base + LINE_STAT_AT], runes[base + LINE_VALUE_AT], runes[base + LINE_GRIND_AT]);
    }
    for (var step: u32 = 0u; step < upgrades; step = step + 1u) {
      if (heldCount == 0u) { break; }
      // Not "target": WGSL reserves the word, and the shader would not compile at all.
      let improved = drawBelow(seed, counter + step * 2u, heldCount);
      let base = runeAt + RUNE_LINES_AT + improved * LINE_STRIDE;
      let low = runes[base + LINE_UPGRADE_MIN_AT];
      let high = runes[base + LINE_UPGRADE_MAX_AT];
      let roll = low + i32(drawBelow(seed, counter + step * 2u + 1u, u32(high - low + 1)));
      lines[improved].value = lines[improved].value + roll;
    }

    // The lines it gains, drawn without replacement, each with one initial roll.
    for (var index: u32 = 0u; index < poolCount; index = index + 1u) {
      bag[index] = runes[runeAt + RUNE_POOL_AT + index * POOL_STRIDE + POOL_STAT_AT];
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
      let low = runes[base + POOL_INITIAL_MIN_AT];
      let high = runes[base + POOL_INITIAL_MAX_AT];
      let roll = low + i32(drawBelow(seed, counter + ADDITION_DRAWS_AT + 1u + step * 2u, u32(high - low + 1)));
      lines[heldCount + step] = Line(statId, roll, 0);
    }

    // The end state: every line with its stone at the credit.
    var total = prefixScore;
    for (var at: u32 = 0u; at < lineCount; at = at + 1u) {
      let statId = u32(lines[at].statId);
      let stone = scorings[scoringAt + SCORING_GRIND_AT + statId];
      let ground = f32(lines[at].value) + max(f32(lines[at].grind), stone);
      lineValue[at] = ground * scorings[scoringAt + SCORING_PRICES_AT + statId];
      total = total + lineValue[at];
    }
    // Then the one Gem: placed where it gains most on the reference rune, every line
    // ground by the reference stone, and valued at the credit only once it is placed.
    if (gemCount > 0u) {
      var bestGain = 0.0;
      var chosenAt = -1;
      var chosenStat = -1;
      for (var at: u32 = 0u; at < lineCount; at = at + 1u) {
        // One converted line at a time, and a later Gem may only replace that one.
        if (gemmedAt >= 0 && i32(at) != gemmedAt) { continue; }
        let lineStat = u32(lines[at].statId);
        let lineStone = scorings[scoringAt + SCORING_CHOICE_GRIND_AT + lineStat];
        let choiceLine = (f32(lines[at].value) + max(f32(lines[at].grind), lineStone))
          * scorings[scoringAt + SCORING_PRICES_AT + lineStat];
        var best = -1.0e30;
        var bestStat = -1;
        var foundOther = false;
        for (var index: u32 = 0u; index < gemCount; index = index + 1u) {
          let entry = scoringAt + SCORING_GEMS_AT + index * GEM_STRIDE;
          let statId = i32(scorings[entry + GEM_STAT_AT]);
          if (statId == lines[at].statId) {
            // Re-rolling the line's own id keeps whatever stone is already there,
            // which the reference one can only improve.
            let stone = scorings[scoringAt + SCORING_CHOICE_GRIND_AT + u32(statId)];
            let ground = scorings[entry + GEM_ROLL_AT] + max(f32(lines[at].grind), stone);
            let same = ground * scorings[scoringAt + SCORING_PRICES_AT + u32(statId)];
            if (same > best) { best = same; bestStat = statId; }
            if (foundOther) { break; }
            continue;
          }
          if (foundOther) { continue; }
          var blocked = false;
          for (var other: u32 = 0u; other < lineCount; other = other + 1u) {
            if (other != at && lines[other].statId == statId) { blocked = true; }
          }
          if (blocked) { continue; }
          if (scorings[entry + GEM_VALUE_AT] > best) { best = scorings[entry + GEM_VALUE_AT]; bestStat = statId; }
          foundOther = true;
        }
        if (best <= -1.0e29) { continue; }
        let gain = best - choiceLine;
        if (gain > bestGain) { bestGain = gain; chosenAt = i32(at); chosenStat = bestStat; }
      }
      if (chosenAt >= 0) {
        let chosen = lines[u32(chosenAt)];
        let roll = scorings[scoringAt + SCORING_GEM_ROLLS_AT + u32(chosenStat)];
        // The credited Gem must exist, and a same-id Gem must raise the base value.
        if (roll >= 0.0 && (chosenStat != chosen.statId || roll > f32(chosen.value))) {
          var kept = 0.0;
          if (chosenStat == chosen.statId) { kept = f32(chosen.grind); }
          let stone = scorings[scoringAt + SCORING_GRIND_AT + u32(chosenStat)];
          let gemValue = (roll + max(kept, stone)) * scorings[scoringAt + SCORING_PRICES_AT + u32(chosenStat)];
          let gain = gemValue - lineValue[u32(chosenAt)];
          if (gain > 0.0) { total = total + gain; }
        }
      }
    }
    if (total >= wanted) { hits = hits + 1u; }
    run = run + WORKGROUP_SIZE;
  }
  counts[jobIndex * WORKGROUP_SIZE + lane] = hits;
}
`;
