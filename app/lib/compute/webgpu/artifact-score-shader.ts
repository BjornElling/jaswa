import { scoredArtifactProperties } from '../artifact-score-schema';
import { benchmarkAcceptableLines } from '../../artifact-optimal-value';
import { bestArtifactLineContributions } from '../../artifact-properties';
import { intangibleRestrictionCode } from '../artifact-score-protocol';

/* Twelve values described the artifact before the conversion model gained a
   ceiling and a converted-slot guard; both belong to the artifact rather than
   the request, because both follow from its grade and its own lines. */
const artifactStride = 14;
const monsterStride = 5 + scoredArtifactProperties.length;

/**
 * One invocation evaluates one artifact/monster pair. The full matrix is read
 * back for this first workload because 4,000 × 400 scores is only about 6 MB;
 * later searches can reduce candidates on the device before readback.
 */
export const artifactScoreShader = /* wgsl */`
const ARTIFACT_STRIDE: u32 = ${artifactStride}u;
const MONSTER_STRIDE: u32 = ${monsterStride}u;
const PROPERTY_COUNT: u32 = ${scoredArtifactProperties.length}u;
const INTANGIBLE_RESTRICTION: i32 = ${intangibleRestrictionCode};
// Interpolated from the same constants artifactScoreBenchmark() uses, so the
// two backends cannot drift apart on the denominator every score is divided by.
const BEST_LINE_CONTRIBUTIONS: f32 = ${bestArtifactLineContributions}.0;
const BENCHMARK_ACCEPTABLE_LINES: f32 = ${benchmarkAcceptableLines}.0;

struct Parameters {
  artifactCount: u32,
  monsterCount: u32,
  conversionMode: u32,
  _padding: u32,
  conversionValue: f32,
  acceptableWorth: f32,
};

@group(0) @binding(0) var<storage, read> artifacts: array<f32>;
@group(0) @binding(1) var<storage, read> monsters: array<f32>;
@group(0) @binding(2) var<storage, read> propertyAvailability: array<i32>;
// One row of PROPERTY_COUNT flags per equip class, because a stone is engraved
// for one class and converts nothing else. Row 0 is the Intangible union.
@group(0) @binding(3) var<storage, read> ownedProperties: array<i32>;
@group(0) @binding(4) var<uniform> parameters: Parameters;
@group(0) @binding(5) var<storage, read_write> output: array<f32>;

fn preferenceWeight(preference: i32) -> f32 {
  if (preference == 2) { return 1.0; }
  if (preference == 1) { return parameters.acceptableWorth; }
  return 0.0;
}

fn ownsProperty(restriction: i32, index: u32) -> bool {
  return ownedProperties[u32(restriction) * PROPERTY_COUNT + index] != 0;
}

// Whole percentage points, the one scale every score is compared on. It must
// match scorePercent() in artifact-score-core.ts exactly, or the two backends
// disagree about which of two artifacts is better.
fn scorePercent(value: f32) -> f32 {
  return round(value * 100.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let pairIndex = invocation.x;
  let pairCount = parameters.artifactCount * parameters.monsterCount;
  if (pairIndex >= pairCount) { return; }

  let artifactIndex = pairIndex / parameters.monsterCount;
  let monsterIndex = pairIndex % parameters.monsterCount;
  let artifactOffset = artifactIndex * ARTIFACT_STRIDE;
  let monsterOffset = monsterIndex * MONSTER_STRIDE;
  let category = i32(artifacts[artifactOffset]);
  let restriction = i32(artifacts[artifactOffset + 1u]);
  let mainProperty = u32(artifacts[artifactOffset + 2u]);
  let convertedIndex = i32(artifacts[artifactOffset + 3u]);
  let element = i32(monsters[monsterOffset]);
  let archetype = i32(monsters[monsterOffset + 1u]);

  // INTANGIBLE_RESTRICTION fits every monster the category allows, exactly as
  // fits() in artifact-score-core.ts accepts it. The two backends must agree on
  // eligibility, so this test is the same test.
  if (restriction != INTANGIBLE_RESTRICTION
    && ((category == 1 && element != restriction) || (category == 2 && archetype != restriction))) {
    output[pairIndex] = -1.0;
    return;
  }

  let mainWeight = preferenceWeight(i32(monsters[monsterOffset + 2u + mainProperty]));
  if (mainWeight == 0.0) {
    output[pairIndex] = 0.0;
    return;
  }

  var weighted: f32 = 0.0;
  var sourceContribution: array<f32, 4>;
  for (var line: u32 = 0u; line < 4u; line = line + 1u) {
    let propertyIndex = i32(artifacts[artifactOffset + 4u + line]);
    let fraction = artifacts[artifactOffset + 8u + line];
    var contribution: f32 = 0.0;
    if (propertyIndex >= 0) {
      contribution = preferenceWeight(i32(monsters[monsterOffset + 5u + u32(propertyIndex)])) * fraction;
    }
    sourceContribution[line] = contribution;
    weighted = weighted + contribution;
  }

  // The benchmark artifact: a preferred line holding all five contributions and
  // one acceptable line holding its own, which is the best the game can build
  // on the profile the monsters actually offer. Must match
  // artifactScoreBenchmark() exactly.
  let benchmark = (BEST_LINE_CONTRIBUTIONS + BENCHMARK_ACCEPTABLE_LINES * parameters.acceptableWorth)
    / BEST_LINE_CONTRIBUTIONS;
  let currentPercent = scorePercent(mainWeight * weighted / benchmark);
  var best = currentPercent;
  if (parameters.conversionMode == 0u) {
    output[pairIndex] = best;
    return;
  }

  let conversionCeiling = artifacts[artifactOffset + 12u];
  let convertedSlotFraction = artifacts[artifactOffset + 13u];
  // A converted slot already holding at least what a conversion would produce
  // keeps what it has: the permanent lock means a further stone overwrites that
  // same line, so proposing one proposes destroying the better roll.
  let convertedSlotIsBetter = convertedSlotFraction >= 0.0
    && convertedSlotFraction >= parameters.conversionValue;

  for (var source: u32 = 0u; source < 4u; source = source + 1u) {
    if (convertedIndex >= 0 && i32(source) != convertedIndex) { continue; }
    if (convertedIndex >= 0 && i32(source) == convertedIndex && convertedSlotIsBetter) { continue; }
    for (var candidate: u32 = 0u; candidate < PROPERTY_COUNT; candidate = candidate + 1u) {
      let availability = propertyAvailability[candidate];
      if (availability != 0 && availability != category) { continue; }
      if (parameters.conversionMode == 2u && !ownsProperty(restriction, candidate)) { continue; }
      var exists = false;
      for (var line: u32 = 0u; line < 4u; line = line + 1u) {
        if (i32(candidate) == i32(artifacts[artifactOffset + 4u + line])) { exists = true; }
      }
      if (exists) { continue; }
      let band = i32(monsters[monsterOffset + 5u + candidate]);
      // A property the monster neither prefers nor accepts is never suggested.
      if (band == 0) { continue; }
      let candidateWeight = preferenceWeight(band);
      // A conversion collects two contributions whatever the grade allows, so
      // it reaches only this fraction of the line it replaces.
      let converted = scorePercent(mainWeight * (weighted - sourceContribution[source]
        + candidateWeight * parameters.conversionValue * conversionCeiling) / benchmark);
      if (converted > currentPercent) { best = max(best, converted); }
    }
  }
  output[pairIndex] = best;
}`;

export const artifactScoreGpuLayout = { artifactStride, monsterStride } as const;
