import { gpuIndexPreamble } from '../gpu/gpu-context';
import {
  optimizationLanes, runeOptimizationConstants, runeOptimizationFloatConstants,
} from './rune-optimization-layout';

/**
 * **The tail of a Rune Optimization search, on the graphics card.**
 *
 * One block is one workgroup. Its 64 lanes stride over the block's pairs — one
 * candidate of each tail group — and for each pair add the two candidates to the
 * block's base, read the stat sheet off the sum, and ask whether every floor is met
 * and the ranking figure reaches the bar. A pair that could is appended to the
 * survivors with one atomic add; nothing else comes back.
 *
 * **It decides nothing.** The stat sheet here is the processor's
 * (`totalsInto` and `figuresInto` in `monster-stats.ts`, the three composites of
 * `rune-potential-metrics.ts`) read *generously*: every rounded stat a whole point
 * high and every comparison with slack to spare, so single precision can put a pair
 * on the shortlist that does not belong there, never leave off one that does. Every
 * survivor is judged again on the processor before it can enter the table. What this
 * saves is the other several hundred million pairs.
 *
 * Every offset it reads comes from `rune-optimization-layout.ts`, interpolated below,
 * so the packing and the reading cannot disagree about where a field is.
 * `runeOptimizationAgreement` in the backend holds the arithmetic itself to the
 * processor's on this machine's own card before a single real pass is sent.
 */
const declarations = [
  ...Object.entries(runeOptimizationConstants).map(([name, value]) => `const ${name}: u32 = ${value}u;`),
  ...Object.entries(runeOptimizationFloatConstants)
    .map(([name, value]) => `const ${name}: f32 = ${Number.isInteger(value) ? value.toFixed(1) : String(value)};`),
].join('\n');

export const runeOptimizationShader = /* wgsl */`
${declarations}

${gpuIndexPreamble}

@group(0) @binding(0) var<storage, read> question: array<f32>;
@group(0) @binding(1) var<storage, read> candidates: array<f32>;
@group(0) @binding(2) var<storage, read> bases: array<f32>;
@group(0) @binding(3) var<storage, read> ranges: array<u32>;
@group(0) @binding(4) var<storage, read_write> survivors: array<atomic<u32>>;

// A stat the game rounds up once: at most one point above its unrounded value.
fn roundedUp(value: f32) -> f32 {
  return value + 1.0;
}

// A figure as high as single precision could have got it wrong by, and then some.
fn generous(value: f32) -> f32 {
  return value + abs(value) * RELATIVE_SLACK + ABSOLUTE_SLACK;
}

@compute @workgroup_size(${optimizationLanes})
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let thread = flatIndex(invocation);
  let block = thread / WORKGROUP_SIZE;
  let lane = thread % WORKGROUP_SIZE;
  if (block >= arrayLength(&ranges) / RANGE_STRIDE) { return; }

  let range = block * RANGE_STRIDE;
  let firstStart = ranges[range + RANGE_FIRST_START_AT];
  let firstCount = ranges[range + RANGE_FIRST_COUNT_AT];
  let lastStart = ranges[range + RANGE_LAST_START_AT];
  let lastCount = ranges[range + RANGE_LAST_COUNT_AT];
  let pairs = firstCount * lastCount;

  var base: array<f32, ACC_STRIDE>;
  for (var slot: u32 = 0u; slot < ACC_STRIDE; slot = slot + 1u) {
    base[slot] = bases[block * ACC_STRIDE + slot];
  }
  // The bar is one more floor, on the ranking figure.
  var floors: array<f32, FIGURE_COUNT>;
  for (var at: u32 = 0u; at < FIGURE_COUNT; at = at + 1u) {
    floors[at] = question[QUESTION_FLOORS_AT + at];
  }
  let rank = u32(question[QUESTION_RANK_AT]);
  floors[rank] = max(floors[rank], question[QUESTION_BAR_AT]);

  let baseHp = question[QUESTION_BASE_AT + FIGURE_HP];
  let baseAtk = question[QUESTION_BASE_AT + FIGURE_ATK];
  let baseDef = question[QUESTION_BASE_AT + FIGURE_DEF];
  let baseSpd = question[QUESTION_BASE_AT + FIGURE_SPD];

  var effects: array<f32, ACC_STRIDE>;
  var figures: array<f32, FIGURE_COUNT>;
  var pair = lane;
  loop {
    if (pair >= pairs) { break; }
    let first = (firstStart + pair / lastCount) * ACC_STRIDE;
    let last = (lastStart + pair % lastCount) * ACC_STRIDE;
    for (var slot: u32 = 0u; slot < ACC_STRIDE; slot = slot + 1u) {
      effects[slot] = base[slot] + candidates[first + slot] + candidates[last + slot];
    }

    figures[FIGURE_HP] = roundedUp(baseHp * (100.0 + effects[ACC_HP_PERCENT]) / 100.0) + effects[ACC_HP_FLAT];
    figures[FIGURE_ATK] = roundedUp(baseAtk * (100.0 + effects[ACC_ATK_PERCENT]) / 100.0) + effects[ACC_ATK_FLAT];
    figures[FIGURE_DEF] = roundedUp(baseDef * (100.0 + effects[ACC_DEF_PERCENT]) / 100.0) + effects[ACC_DEF_FLAT];
    figures[FIGURE_SPD] = roundedUp(baseSpd * (100.0 + effects[ACC_SPD_PERCENT]) / 100.0) + effects[ACC_SPD_FLAT];
    figures[FIGURE_CRI_RATE] = question[QUESTION_BASE_AT + FIGURE_CRI_RATE] + effects[ACC_CRITICAL_RATE];
    figures[FIGURE_CRI_DMG] = question[QUESTION_BASE_AT + FIGURE_CRI_DMG] + effects[ACC_CRITICAL_DAMAGE];
    figures[FIGURE_RES] = question[QUESTION_BASE_AT + FIGURE_RES] + effects[ACC_RESISTANCE];
    figures[FIGURE_ACC] = question[QUESTION_BASE_AT + FIGURE_ACC] + effects[ACC_ACCURACY];

    // The composites read the fight's HP, ATK, DEF, CRI Rate and CRI Dmg (combatAt):
    // each lead summed with the other percentages and rounded once; the Fallen
    // Ancient Guardian's CRI Dmg reaches DMG only, never the shown CRI Dmg.
    let hp = max(0.0, roundedUp(baseHp * (100.0 + effects[ACC_HP_PERCENT] + effects[ACC_TEAM_HP_PERCENT] + question[QUESTION_BASE_AT + COMBAT_HP]) / 100.0) + effects[ACC_HP_FLAT]);
    let atk = max(0.0, roundedUp(baseAtk * (100.0 + effects[ACC_ATK_PERCENT] + effects[ACC_TEAM_ATK_PERCENT] + question[QUESTION_BASE_AT + COMBAT_ATK]) / 100.0) + effects[ACC_ATK_FLAT]);
    let def = max(0.0, roundedUp(baseDef * (100.0 + effects[ACC_DEF_PERCENT] + effects[ACC_TEAM_DEF_PERCENT] + question[QUESTION_BASE_AT + COMBAT_DEF]) / 100.0) + effects[ACC_DEF_FLAT]);
    // RUNE-ROLE-METRICS.md §2–4, as rune-potential-metrics.ts states them.
    let criticalRate = min(CRITICAL_RATE_CAP_PERCENT, max(0.0, figures[FIGURE_CRI_RATE] + question[QUESTION_BASE_AT + COMBAT_CRI_RATE])) / 100.0;
    figures[FIGURE_DMG] = atk * (1.0 + criticalRate * max(0.0, figures[FIGURE_CRI_DMG] + question[QUESTION_BASE_AT + COMBAT_CRI_DMG]) / 100.0);
    figures[FIGURE_EHP] = hp * (DEFENSE_FACTOR_BASE + DEFENSE_FACTOR_PER_DEF * def) / DEFENSE_FACTOR_SCALE;
    figures[FIGURE_EHP_D] = hp * (DEFENSE_FACTOR_BASE + DEFENSE_FACTOR_PER_DEF * def * BROKEN_DEFENSE_SHARE) / DEFENSE_FACTOR_SCALE;

    var clears = true;
    for (var at: u32 = 0u; at < FIGURE_COUNT; at = at + 1u) {
      if (generous(figures[at]) < floors[at]) { clears = false; }
    }
    if (clears) {
      let slot = atomicAdd(&survivors[SURVIVOR_COUNT_AT], 1u);
      if (slot < SURVIVOR_CAPACITY) {
        let at = SURVIVORS_AT + slot * SURVIVOR_STRIDE;
        atomicStore(&survivors[at + SURVIVOR_BLOCK_AT], block);
        atomicStore(&survivors[at + SURVIVOR_PAIR_AT], pair);
      }
    }
    pair = pair + WORKGROUP_SIZE;
  }
}
`;
