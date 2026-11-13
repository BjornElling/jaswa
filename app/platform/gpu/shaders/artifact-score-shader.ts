import { scoredArtifactProperties } from '../../../domain/artifacts/score/artifact-score-schema';
import {
  artifactMainPropertyPoints, benchmarkAcceptableLines, benchmarkPreferredMaxRolls,
} from '../../../domain/artifacts/artifact-optimal-value';
import { artifactNormalConversionContributions, bestArtifactLineContributions } from '../../../domain/artifacts/artifact-properties';
import { intangibleRestrictionCode } from '../../../domain/artifacts/score/artifact-score-protocol';
import { gpuIndexPreamble } from '../gpu-context';
import {
  artifactCategoryAt, artifactConvertedPropertyAt, artifactMainPropertyAt,
  artifactRestrictionAt, artifactScoreLanes, artifactStride,
  artifactSubPropertyCount, artifactSubPropertyFamiliesAt, artifactSubPropertyIndexesAt,
  artifactSubPropertyRollPointsAt,
  monsterArchetypeAt, monsterElementAt, monsterMainPreferencesAt, monsterStride,
  monsterSubPropertyPreferencesAt,
} from '../layouts/artifact-score-layout';



/**
 * One invocation evaluates one artifact/monster pair. The full matrix is read
 * back for this workload because 4,000 × 400 scores is only about 6 MB; later
 * searches can reduce candidates on the device before readback.
 */
export const artifactScoreShader = /* wgsl */`
const WORKGROUP_SIZE: u32 = ${artifactScoreLanes}u;
const ARTIFACT_STRIDE: u32 = ${artifactStride}u;
const MONSTER_STRIDE: u32 = ${monsterStride}u;
const PROPERTY_COUNT: u32 = ${scoredArtifactProperties.length}u;
const ARTIFACT_CATEGORY_AT: u32 = ${artifactCategoryAt}u;
const ARTIFACT_RESTRICTION_AT: u32 = ${artifactRestrictionAt}u;
const ARTIFACT_MAIN_AT: u32 = ${artifactMainPropertyAt}u;
const ARTIFACT_CONVERTED_AT: u32 = ${artifactConvertedPropertyAt}u;
const ARTIFACT_INDEXES_AT: u32 = ${artifactSubPropertyIndexesAt}u;
const ARTIFACT_ROLL_POINTS_AT: u32 = ${artifactSubPropertyRollPointsAt}u;
// The property each line occupies for the no-duplicates rule: its own, or a
// merged legacy line's successor. Read by the conversion search only.
const ARTIFACT_FAMILIES_AT: u32 = ${artifactSubPropertyFamiliesAt}u;
const ARTIFACT_SUB_PROPERTY_COUNT: u32 = ${artifactSubPropertyCount}u;
const MONSTER_ELEMENT_AT: u32 = ${monsterElementAt}u;
const MONSTER_ARCHETYPE_AT: u32 = ${monsterArchetypeAt}u;
const MONSTER_MAIN_PREFERENCES_AT: u32 = ${monsterMainPreferencesAt}u;
const MONSTER_SUB_PREFERENCES_AT: u32 = ${monsterSubPropertyPreferencesAt}u;
const INTANGIBLE_RESTRICTION: i32 = ${intangibleRestrictionCode};
// Interpolated from the same constants artifactScorePointBenchmark() uses, so the
// two backends cannot drift apart on the denominator every score is divided by.
// ARTIFACT_MAIN_POINTS is also what a preferred main adds to the numerator, from
// this one constant, exactly as the TypeScript does it.
const ARTIFACT_MAIN_POINTS: f32 = ${artifactMainPropertyPoints}.0;
const BENCHMARK_PREFERRED_MAX_ROLLS: f32 = ${benchmarkPreferredMaxRolls}.0;
const BENCHMARK_ACCEPTABLE_LINES: f32 = ${benchmarkAcceptableLines}.0;
// The most max-roll points one line can hold: the five contributions of the
// game's best line. A line outside 0 to this is a pair the CPU refuses to judge.
const LINE_MAX_ROLL_POINTS: f32 = ${bestArtifactLineContributions}.0;

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

${gpuIndexPreamble}

@group(0) @binding(0) var<storage, read> artifacts: array<f32>;
@group(0) @binding(1) var<storage, read> monsters: array<f32>;
@group(0) @binding(2) var<storage, read> propertyAvailability: array<i32>;
// One row of PROPERTY_COUNT flags per engrave class, because a stone is engraved
// for one class and converts nothing else. Row 0, the Intangible code, is never
// read: an Intangible cannot be converted, so no stone applies to one.
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

@compute @workgroup_size(${artifactScoreLanes})
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  // flatIndex rather than invocation.x: one dispatch dimension holds 65,535
  // workgroups and a large roster passes that, so the dispatch is split across two
  // and recombined here exactly as every other shader does it.
  let pairIndex = flatIndex(invocation);
  let pairCount = parameters.artifactCount * parameters.monsterCount;
  if (pairIndex >= pairCount) { return; }

  let artifactIndex = pairIndex / parameters.monsterCount;
  let monsterIndex = pairIndex % parameters.monsterCount;
  let artifactOffset = artifactIndex * ARTIFACT_STRIDE;
  let monsterOffset = monsterIndex * MONSTER_STRIDE;
  let category = i32(artifacts[artifactOffset + ARTIFACT_CATEGORY_AT]);
  let restriction = i32(artifacts[artifactOffset + ARTIFACT_RESTRICTION_AT]);
  let mainProperty = u32(artifacts[artifactOffset + ARTIFACT_MAIN_AT]);
  let convertedIndex = i32(artifacts[artifactOffset + ARTIFACT_CONVERTED_AT]);
  let element = i32(monsters[monsterOffset + MONSTER_ELEMENT_AT]);
  let archetype = i32(monsters[monsterOffset + MONSTER_ARCHETYPE_AT]);

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
  let mainPoints = preferenceWeight(i32(monsters[monsterOffset + MONSTER_MAIN_PREFERENCES_AT + mainProperty])) * ARTIFACT_MAIN_POINTS;

  var weighted: f32 = 0.0;
  var sourceContribution: array<f32, ${artifactSubPropertyCount}>;
  for (var line: u32 = 0u; line < ARTIFACT_SUB_PROPERTY_COUNT; line = line + 1u) {
    let propertyIndex = i32(artifacts[artifactOffset + ARTIFACT_INDEXES_AT + line]);
    let fraction = artifacts[artifactOffset + ARTIFACT_ROLL_POINTS_AT + line];
    // The CPU reference refuses a pair whose line holds a number of max-roll
    // points no line can hold, and the card must answer that input the same
    // way. Written so a NaN fails it too, since every comparison with NaN is false.
    if (!(fraction >= 0.0 && fraction <= LINE_MAX_ROLL_POINTS)) {
      output[pairIndex] = -1.0;
      return;
    }
    var contribution: f32 = 0.0;
    if (propertyIndex >= 0) {
      contribution = preferenceWeight(i32(monsters[monsterOffset + MONSTER_SUB_PREFERENCES_AT + u32(propertyIndex)])) * fraction;
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
    for (var line: u32 = 1u; line < ARTIFACT_SUB_PROPERTY_COUNT; line = line + 1u) {
      let candidateContribution = sourceContribution[line];
      let sourceValue = sourceContribution[source];
      if (candidateContribution < sourceValue
        || (candidateContribution == sourceValue
          && artifacts[artifactOffset + ARTIFACT_ROLL_POINTS_AT + line]
            < artifacts[artifactOffset + ARTIFACT_ROLL_POINTS_AT + source])) {
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
    for (var line: u32 = 0u; line < ARTIFACT_SUB_PROPERTY_COUNT; line = line + 1u) {
      if (i32(candidate) == i32(artifacts[artifactOffset + ARTIFACT_FAMILIES_AT + line])) { exists = true; }
    }
    let isSourceProperty = i32(candidate) == i32(artifacts[artifactOffset + ARTIFACT_FAMILIES_AT + source]);
    if (exists && !isSourceProperty) { continue; }
    let band = i32(monsters[monsterOffset + MONSTER_SUB_PREFERENCES_AT + candidate]);
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
    for (var line: u32 = 0u; line < ARTIFACT_SUB_PROPERTY_COUNT; line = line + 1u) {
      if (i32(candidate) == i32(artifacts[artifactOffset + ARTIFACT_FAMILIES_AT + line])) { exists = true; }
    }
    let isSourceProperty = i32(candidate) == i32(artifacts[artifactOffset + ARTIFACT_FAMILIES_AT + source]);
    if (exists && !isSourceProperty) { continue; }
    let band = i32(monsters[monsterOffset + MONSTER_SUB_PREFERENCES_AT + candidate]);
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
