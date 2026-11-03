/**
 * **The shape of what the graphics card is handed for a Rune Clean-up chance.**
 *
 * Every offset here is read twice — once by the packing in
 * `backends/webgpu-rune-chance-backend.ts` and once by the shader, which interpolates
 * these same constants into its own source rather than writing its own. That is the
 * whole point of the file. A field added to one side and not the other misreads every
 * record after it, and WebGPU does not complain: it answers with whatever the numbers
 * happen to mean. `npm run verify:rune-chance-layout` fails if anything is left over
 * for one side to decide on its own.
 *
 * Three records, four flat arrays:
 *
 * - a **rune**, which is what the runs are played out of;
 * - a **scoring**, which is what one role pays and what its craft items could do;
 * - a **job**, which pairs one of each with one bar to clear, and its bar beside it.
 *
 * A rune and a scoring are each referenced by many jobs — eight roles asking about
 * one rune share its record, and every rune judged against one build of one role
 * shares that build's price list — so they are uploaded once and indexed.
 */
import { statIdBound } from '../../rune-craft-end-state';
import { additionDrawsAt, drawsPerRun } from '../../rune-power-up-outcomes';

export { statIdBound };

/** A rune ends at `+12` with four sub properties, and never more. */
export const maxLines = 4;
/** Eleven effect ids exist, so a slot can offer at most eleven to an addition. */
export const maxPool = 11;
/** And at most eleven to a Gem, for the same reason. */
export const maxGemOptions = 11;

/** Effect id, roll total, the stone already there, and the improvement interval. */
export const lineStride = 5;
export const lineStatAt = 0;
export const lineValueAt = 1;
export const lineGrindAt = 2;
export const lineUpgradeMinimumAt = 3;
export const lineUpgradeMaximumAt = 4;
/** Effect id and the initial-roll interval. */
export const poolEntryStride = 3;
export const poolStatAt = 0;
export const poolInitialMinimumAt = 1;
export const poolInitialMaximumAt = 2;
/** Effect id, what it is worth with its stone on the reference rune, and the bare roll there. */
export const gemEntryStride = 3;
export const gemStatAt = 0;
export const gemValueAt = 1;
export const gemRollAt = 2;

/* ------------------------------------------------------------- the rune record */

export const runeSlotAt = 0;
export const runeMainAt = 1;
export const runePrefixAt = 2;
export const runeGemmedAt = 3;
export const runeHeldCountAt = 4;
export const runeUpgradesAt = 5;
export const runeAdditionsAt = 6;
export const runePoolCountAt = 7;
export const runeSeedAt = 8;
/** Where the header ends and the held lines begin. */
export const runeLinesAt = 9;
export const runePoolAt = runeLinesAt + maxLines * lineStride;

/**
 * 9 + 4×5 + 11×3 = 62, rounded up to 64.
 *
 * The rounding is not alignment — a storage buffer of `i32` needs none — it is so
 * that a record boundary is a shift rather than a multiply, and so that adding a
 * field costs nothing until the next power of two.
 */
export const runeStride = 64;

/* ---------------------------------------------------------- the scoring record */

/** What one raw point of each effect id is worth, indexed by the id itself. */
export const scoringPricesAt = 0;
/** The Grindstone credited to each effect id, indexed the same way. */
export const scoringGrindAt = statIdBound;
/** What the credited Gem rolls on each effect id, `-1` where none exists. */
export const scoringGemRollsAt = statIdBound * 2;
/** The reference rune's Grindstone on each effect id (`gemChoiceCredit`). */
export const scoringChoiceGrindAt = statIdBound * 3;
export const scoringPrefixAt = statIdBound * 4;
/** How many reference Gems follow; `0` where the credit carries no Gem at all. */
export const scoringGemCountAt = statIdBound * 4 + 1;
/** The legal Gems on the reference, best first: what the placement is chosen from. */
export const scoringGemsAt = statIdBound * 4 + 2;

/** 4×13 + 2 + 11×3 = 87, rounded up to 128 for the same reason. */
export const scoringStride = 128;

/* -------------------------------------------------------------- the job record */

export const jobRuneAt = 0;
export const jobScoringAt = 1;
export const jobRunsAt = 2;
/** Rune index, scoring index, run count, and one spare so the stride is a power of two. */
export const jobStride = 4;

/**
 * How many lanes share one job.
 *
 * It is the workgroup size as well, so one job is exactly one workgroup and no lane
 * ever reads another job's rune. 64 is what the artifact scorer uses and what every
 * WebGPU implementation is comfortable with.
 */
export const chanceLanes = 64;

/**
 * Every constant the shader declares, and the value it must have.
 *
 * The shader interpolates this map rather than writing the numbers out, so the two
 * sides cannot disagree; the check reads it back out of the generated source to
 * confirm that the shader is still using it and has not grown a literal of its own.
 */
export const runeChanceConstants: Readonly<Record<string, number>> = {
  WORKGROUP_SIZE: chanceLanes,
  RUNE_STRIDE: runeStride,
  SCORING_STRIDE: scoringStride,
  JOB_STRIDE: jobStride,
  LINE_STRIDE: lineStride,
  LINE_STAT_AT: lineStatAt,
  LINE_VALUE_AT: lineValueAt,
  LINE_GRIND_AT: lineGrindAt,
  LINE_UPGRADE_MIN_AT: lineUpgradeMinimumAt,
  LINE_UPGRADE_MAX_AT: lineUpgradeMaximumAt,
  POOL_STRIDE: poolEntryStride,
  POOL_STAT_AT: poolStatAt,
  POOL_INITIAL_MIN_AT: poolInitialMinimumAt,
  POOL_INITIAL_MAX_AT: poolInitialMaximumAt,
  GEM_STRIDE: gemEntryStride,
  GEM_STAT_AT: gemStatAt,
  GEM_VALUE_AT: gemValueAt,
  GEM_ROLL_AT: gemRollAt,
  MAX_LINES: maxLines,
  MAX_POOL: maxPool,
  RUNE_GEMMED_AT: runeGemmedAt,
  RUNE_HELD_COUNT_AT: runeHeldCountAt,
  RUNE_UPGRADES_AT: runeUpgradesAt,
  RUNE_ADDITIONS_AT: runeAdditionsAt,
  RUNE_POOL_COUNT_AT: runePoolCountAt,
  RUNE_SEED_AT: runeSeedAt,
  RUNE_LINES_AT: runeLinesAt,
  RUNE_POOL_AT: runePoolAt,
  SCORING_GRIND_AT: scoringGrindAt,
  SCORING_GEM_ROLLS_AT: scoringGemRollsAt,
  SCORING_CHOICE_GRIND_AT: scoringChoiceGrindAt,
  SCORING_PREFIX_AT: scoringPrefixAt,
  SCORING_GEM_COUNT_AT: scoringGemCountAt,
  SCORING_GEMS_AT: scoringGemsAt,
  SCORING_PRICES_AT: scoringPricesAt,
  JOB_RUNE_AT: jobRuneAt,
  JOB_SCORING_AT: jobScoringAt,
  JOB_RUNS_AT: jobRunsAt,
  /* The stream's own numbering, taken from the processor's loop rather than restated
     here: two engines that number their draws differently would play the same rune
     forward through different runs. */
  DRAWS_PER_RUN: drawsPerRun,
  ADDITION_DRAWS_AT: additionDrawsAt,
};

/** The last index each record writes, so a stride can be checked against its use. */
export const runeRecordEnd = runePoolAt + maxPool * poolEntryStride;
export const scoringRecordEnd = scoringGemsAt + maxGemOptions * gemEntryStride;
