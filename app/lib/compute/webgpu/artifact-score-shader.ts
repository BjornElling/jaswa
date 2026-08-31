import { scoredArtifactProperties } from '../artifact-score-schema';

const artifactStride = 12;
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
@group(0) @binding(3) var<storage, read> ownedProperties: array<i32>;
@group(0) @binding(4) var<uniform> parameters: Parameters;
@group(0) @binding(5) var<storage, read_write> output: array<f32>;

fn preferenceWeight(preference: i32) -> f32 {
  if (preference == 2) { return 1.0; }
  if (preference == 1) { return parameters.acceptableWorth; }
  return 0.0;
}

fn ownsProperty(index: u32) -> bool {
  return ownedProperties[index] != 0;
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

  if ((category == 1 && element != restriction) || (category == 2 && archetype != restriction)) {
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

  let benchmark = 1.0 + 3.0 * parameters.acceptableWorth;
  var best = mainWeight * weighted / benchmark;
  if (parameters.conversionMode == 0u) {
    output[pairIndex] = best;
    return;
  }

  for (var source: u32 = 0u; source < 4u; source = source + 1u) {
    if (convertedIndex >= 0 && i32(source) != convertedIndex) { continue; }
    for (var candidate: u32 = 0u; candidate < PROPERTY_COUNT; candidate = candidate + 1u) {
      let availability = propertyAvailability[candidate];
      if (availability != 0 && availability != category) { continue; }
      if (parameters.conversionMode == 2u && !ownsProperty(candidate)) { continue; }
      var exists = false;
      for (var line: u32 = 0u; line < 4u; line = line + 1u) {
        if (i32(candidate) == i32(artifacts[artifactOffset + 4u + line])) { exists = true; }
      }
      if (exists) { continue; }
      let candidateWeight = preferenceWeight(i32(monsters[monsterOffset + 5u + candidate]));
      let converted = mainWeight * (weighted - sourceContribution[source]
        + candidateWeight * parameters.conversionValue) / benchmark;
      best = max(best, converted);
    }
  }
  output[pairIndex] = best;
}`;

export const artifactScoreGpuLayout = { artifactStride, monsterStride } as const;
