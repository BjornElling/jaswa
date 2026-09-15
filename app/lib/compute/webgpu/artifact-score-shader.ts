import { scoredArtifactProperties } from '../artifact-score-schema';
import {
  artifactMainPropertyPoints, benchmarkAcceptableLines, benchmarkPreferredMaxRolls,
} from '../../artifact-optimal-value';
import { artifactNormalConversionContributions } from '../../artifact-properties';
import { intangibleRestrictionCode } from '../artifact-score-protocol';

/* Four artifact facts, four property indexes, four max-roll-point values and
   four absolute line values in hundredths — the last four so a substat floor
   can be tested here as it is on the CPU. */
const artifactStride = 16;
/* Element, archetype, three mains, then one preference *and* one minimum for
   every scored property. Both backends read this layout, and
   `verify:artifact-score-agreement` fails if they stop agreeing. */
const monsterStride = 5 + scoredArtifactProperties.length * 2;

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
// Interpolated from the same constants artifactScorePointBenchmark() uses, so the
// two backends cannot drift apart on the denominator every score is divided by.
// ARTIFACT_MAIN_POINTS is also what a preferred main adds to the numerator, from
// this one constant, exactly as the TypeScript does it.
const ARTIFACT_MAIN_POINTS: f32 = ${artifactMainPropertyPoints}.0;
const BENCHMARK_PREFERRED_MAX_ROLLS: f32 = ${benchmarkPreferredMaxRolls}.0;
const BENCHMARK_ACCEPTABLE_LINES: f32 = ${benchmarkAcceptableLines}.0;

// Five scalars, and no padding member: a uniform struct is already rounded up
// to a multiple of 16 bytes, so this occupies exactly the 32 bytes the backend
// uploads. A vec3<f32> written in to "pad" it instead demanded 48 — vec3 aligns
// to 16, so it lands at offset 32 — and the whole bind group was then rejected
// as too small, which reads back as a matrix of zeros rather than as an error.
struct Parameters {
  artifactCount: u32,
  monsterCount: u32,
  conversionMode: u32,
  acceptableWorth: f32,
  insignificantDifference: f32,
};

@group(0) @binding(0) var<storage, read> artifacts: array<f32>;
@group(0) @binding(1) var<storage, read> monsters: array<f32>;
@group(0) @binding(2) var<storage, read> propertyAvailability: array<i32>;
// One row of PROPERTY_COUNT flags per equip class, because a stone is engraved
// for one class and converts nothing else. Row 0 is the Intangible union.
@group(0) @binding(3) var<storage, read> ownedProperties: array<i32>;
// Each setting choice resolves to a fraction of that property's own conversion
// ceiling. This keeps "three quarters" at exactly 75 %, even when two effects
// have different regular roll ranges.
@group(0) @binding(4) var<storage, read> conversionRollFractions: array<f32>;
@group(0) @binding(5) var<uniform> parameters: Parameters;
@group(0) @binding(6) var<storage, read_write> output: array<f32>;

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

  // The main property adds its own max-roll points rather than gating the four
  // rolled lines, so an unwanted main is not an early exit: the artifact still
  // scores, and is still worth converting, on what its sub properties deliver.
  // Must match scoreArtifactOnMonster() in artifact-score-core.ts exactly.
  let mainPoints = preferenceWeight(i32(monsters[monsterOffset + 2u + mainProperty])) * ARTIFACT_MAIN_POINTS;

  var weighted: f32 = 0.0;
  var sourceContribution: array<f32, 4>;
  for (var line: u32 = 0u; line < 4u; line = line + 1u) {
    let propertyIndex = i32(artifacts[artifactOffset + 4u + line]);
    let fraction = artifacts[artifactOffset + 8u + line];
    var contribution: f32 = 0.0;
    if (propertyIndex >= 0) {
      // A line below the floor its monster asked for contributes nothing, as an
      // unwanted property does. Must match clearsMinimum() in
      // artifact-score-core.ts exactly. A floor of 0 admits every roll; a legacy
      // line carries -1 and clears no real floor.
      let minimum = monsters[monsterOffset + 5u + PROPERTY_COUNT + u32(propertyIndex)];
      let lineValue = artifacts[artifactOffset + 12u + line];
      if (minimum <= 0.0 || lineValue >= minimum) {
        contribution = preferenceWeight(i32(monsters[monsterOffset + 5u + u32(propertyIndex)])) * fraction;
      }
    }
    sourceContribution[line] = contribution;
    weighted = weighted + contribution;
  }

  // The benchmark holds a preferred main, four preferred max-roll points and
  // three acceptable lines. Must match artifactScorePointBenchmark() exactly.
  let benchmark = ARTIFACT_MAIN_POINTS + BENCHMARK_PREFERRED_MAX_ROLLS
    + BENCHMARK_ACCEPTABLE_LINES * parameters.acceptableWorth;
  let currentPercent = scorePercent((mainPoints + weighted) / benchmark);
  var best = currentPercent;
  if (parameters.conversionMode == 0u) {
    output[pairIndex] = best;
    return;
  }
  // An Intangible artifact cannot be converted at all, so it scores on what it
  // holds and nothing more. Must match scoreArtifactOnMonster() exactly, or the
  // two backends would return different candidate sets for one account.
  if (restriction == INTANGIBLE_RESTRICTION) {
    output[pairIndex] = best;
    return;
  }

  // The CPU reference offers targets for one source only: the permanently
  // converted slot, or the weakest-contributing slot. Equal contributions use
  // the lower natural-roll percentage; an exact tie keeps artifact order.
  var source: u32 = 0u;
  if (convertedIndex >= 0) {
    source = u32(convertedIndex);
  } else {
    for (var line: u32 = 1u; line < 4u; line = line + 1u) {
      let candidateContribution = sourceContribution[line];
      let sourceValue = sourceContribution[source];
      if (candidateContribution < sourceValue
        || (candidateContribution == sourceValue
          && artifacts[artifactOffset + 8u + line] < artifacts[artifactOffset + 8u + source])) {
        source = line;
      }
    }
  }
  // Potential is a recommended action, not a hidden theoretical maximum. A
  // qualifying preferred target therefore excludes acceptable targets before
  // the best score is selected.
  var hasWorthwhilePreferred = false;
  for (var candidate: u32 = 0u; candidate < PROPERTY_COUNT; candidate = candidate + 1u) {
    let availability = propertyAvailability[candidate];
    if (availability != 0 && availability != category) { continue; }
    if (parameters.conversionMode == 2u && !ownsProperty(restriction, candidate)) { continue; }
    var exists = false;
    for (var line: u32 = 0u; line < 4u; line = line + 1u) {
      if (i32(candidate) == i32(artifacts[artifactOffset + 4u + line])) { exists = true; }
    }
    let isSourceProperty = i32(candidate) == i32(artifacts[artifactOffset + 4u + source]);
    if (exists && !isSourceProperty) { continue; }
    let band = i32(monsters[monsterOffset + 5u + candidate]);
    if (band != 2) { continue; }
    let converted = scorePercent((mainPoints + weighted - sourceContribution[source]
      + preferenceWeight(band) * conversionRollFractions[candidate] * ${artifactNormalConversionContributions}) / benchmark);
    if (converted > currentPercent + parameters.insignificantDifference) { hasWorthwhilePreferred = true; }
  }
  for (var candidate: u32 = 0u; candidate < PROPERTY_COUNT; candidate = candidate + 1u) {
    let availability = propertyAvailability[candidate];
    if (availability != 0 && availability != category) { continue; }
    if (parameters.conversionMode == 2u && !ownsProperty(restriction, candidate)) { continue; }
    var exists = false;
    for (var line: u32 = 0u; line < 4u; line = line + 1u) {
      if (i32(candidate) == i32(artifacts[artifactOffset + 4u + line])) { exists = true; }
    }
    let isSourceProperty = i32(candidate) == i32(artifacts[artifactOffset + 4u + source]);
    if (exists && !isSourceProperty) { continue; }
    let band = i32(monsters[monsterOffset + 5u + candidate]);
    // A preferred target is always chosen ahead of an acceptable target.
    if (band == 0 || (hasWorthwhilePreferred && band != 2) || (!hasWorthwhilePreferred && band != 1)) { continue; }
    let candidateWeight = preferenceWeight(band);
    let conversionFraction = conversionRollFractions[candidate];
    // A perfect conversion is one and a half max-roll points. That is the
    // game's underlying rate, not a property-specific display rounding.
    let converted = scorePercent((mainPoints + weighted - sourceContribution[source]
      + candidateWeight * conversionFraction * ${artifactNormalConversionContributions}) / benchmark);
    if (converted > currentPercent + parameters.insignificantDifference) { best = max(best, converted); }
  }
  output[pairIndex] = best;
}`;

export const artifactScoreGpuLayout = { artifactStride, monsterStride } as const;
