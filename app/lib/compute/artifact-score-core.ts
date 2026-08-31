import { artifactPropertyAvailability, scoredArtifactProperties } from './artifact-score-schema';
import type {
  ArtifactConversion, ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput,
} from './artifact-score-protocol';

function weight(preference: number, acceptableWorth: number): number {
  if (preference === 2) return 1;
  return preference === 1 ? acceptableWorth / 100 : 0;
}

function fits(artifact: PackedArtifactScoreInput, monster: PackedMonsterScoreInput): boolean {
  return artifact.category === 1
    ? monster.element === artifact.restriction
    : monster.archetype === artifact.restriction;
}

function sourceContribution(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  index: number,
  acceptableWorth: number,
): number {
  const propertyIndex = artifact.subPropertyIndexes[index];
  if (propertyIndex < 0) return 0;
  return weight(monster.subPropertyPreferences[propertyIndex] ?? 0, acceptableWorth)
    * artifact.subPropertyFractions[index];
}

function candidateAllowed(
  artifact: PackedArtifactScoreInput,
  propertyIndex: number,
  owned: ReadonlySet<number>,
  mode: number,
): boolean {
  const availability = artifactPropertyAvailability[propertyIndex];
  if (availability !== 0 && availability !== artifact.category) return false;
  if (artifact.subPropertyIndexes.includes(propertyIndex)) return false;
  return mode !== 2 || owned.has(propertyIndex);
}

/**
 * The conversion model is deliberately phrased in score space. It chooses the
 * least useful legal source line (or the permanent converted slot), then the
 * best missing legal property. The current result always wins over a lower
 * calculated roll, which is what the settings promise means by keeping a
 * better roll already present on the artifact.
 */
export function scoreArtifactOnMonster(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  request: Pick<ArtifactScoreRequest, 'acceptableWorth' | 'conversionMode' | 'conversionValue' | 'ownedConversionPropertyIndexes'>,
): { value: number; conversion: ArtifactConversion | undefined } | undefined {
  if (!fits(artifact, monster)) return undefined;
  const main = weight(monster.mainPreferences[artifact.mainProperty] ?? 0, request.acceptableWorth);
  if (main === 0) return { value: 0, conversion: undefined };

  const benchmark = 1 + 3 * (request.acceptableWorth / 100);
  let weightedSubProperties = 0;
  for (let index = 0; index < 4; index += 1) {
    const fraction = artifact.subPropertyFractions[index];
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return undefined;
    weightedSubProperties += sourceContribution(artifact, monster, index, request.acceptableWorth);
  }
  const currentValue = main * (weightedSubProperties / benchmark);
  if (request.conversionMode === 0) return { value: currentValue, conversion: undefined };

  const sources = artifact.convertedPropertyIndex >= 0
    ? [artifact.convertedPropertyIndex]
    : [0, 1, 2, 3];
  const owned = new Set(request.ownedConversionPropertyIndexes);
  let bestValue = currentValue;
  let bestConversion: ArtifactConversion | undefined;
  for (const sourceIndex of sources) {
    if (sourceIndex < 0 || sourceIndex > 3) continue;
    const withoutSource = weightedSubProperties
      - sourceContribution(artifact, monster, sourceIndex, request.acceptableWorth);
    for (let propertyIndex = 0; propertyIndex < scoredArtifactProperties.length; propertyIndex += 1) {
      if (!candidateAllowed(artifact, propertyIndex, owned, request.conversionMode)) continue;
      const convertedWeight = weight(monster.subPropertyPreferences[propertyIndex] ?? 0, request.acceptableWorth);
      const convertedValue = main * ((withoutSource + convertedWeight * request.conversionValue) / benchmark);
      if (convertedValue > bestValue) {
        bestValue = convertedValue;
        bestConversion = { sourceIndex, propertyId: scoredArtifactProperties[propertyIndex].id };
      }
    }
  }
  return { value: bestValue, conversion: bestConversion };
}

export function calculateArtifactScoresCpu(request: ArtifactScoreRequest): Float32Array {
  const scores = new Float32Array(request.artifacts.length * request.monsters.length);
  let output = 0;
  for (const artifact of request.artifacts) {
    for (const monster of request.monsters) {
      const score = scoreArtifactOnMonster(artifact, monster, request);
      scores[output] = score?.value ?? -1;
      output += 1;
    }
  }
  return scores;
}
