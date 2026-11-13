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

/**
 * The scored property each property id occupies for the rule that an artifact
 * holds no property twice: a current id is itself, and a legacy id v8 merged
 * is its successor (`mergedInto`). Any other legacy id occupies none. Kept
 * apart from `artifactPropertyIndex` because a merged legacy line still weighs
 * nothing in a score — it only closes its successor as a conversion target.
 */
export const artifactPropertyFamilyIndex = new Map<number, number>(
  artifactProperties.flatMap((property) => {
    const index = artifactPropertyIndex.get(property.mergedInto ?? property.id);
    return index === undefined ? [] : [[property.id, index] as const];
  }),
);

export const artifactPropertyAvailability = scoredArtifactProperties.map((property) => {
  if (property.availability === 'both') return 0;
  return property.availability === 'attribute' ? 1 : 2;
});

export function categoryCode(category: ArtifactCategory): 1 | 2 {
  return category === 'attribute' ? 1 : 2;
}
