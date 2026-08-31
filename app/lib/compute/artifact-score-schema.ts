import { artifactProperties } from '../artifact-properties';
import type { ArtifactCategory } from '../artifact-properties';

/**
 * The compact property vocabulary shared by the CPU reference path and the
 * WebGPU buffer layout. It intentionally excludes legacy properties: their
 * roll range is unknown, so neither scoring nor a calculated conversion may
 * invent an answer for them.
 */
export const scoredArtifactProperties = artifactProperties.filter((property) => property.status === 'current');

export const artifactPropertyIndex = new Map<number, number>(
  scoredArtifactProperties.map((property, index) => [property.id, index]),
);

export const artifactPropertyAvailability = scoredArtifactProperties.map((property) => {
  if (property.availability === 'both') return 0;
  return property.availability === 'attribute' ? 1 : 2;
});

export function categoryCode(category: ArtifactCategory): 1 | 2 {
  return category === 'attribute' ? 1 : 2;
}
