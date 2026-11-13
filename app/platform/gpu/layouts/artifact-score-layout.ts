/**
 * The flat-buffer layout shared by the artifact scorer's packer and shader.
 *
 * WebGPU validates that a buffer is large enough, not that a field is read at the
 * offset its writer intended. Keeping the relative positions here makes a layout
 * change fail in one place instead of becoming two plausible but different scores.
 */
import { scoredArtifactProperties } from '../../../domain/artifacts/score/artifact-score-schema';

export const artifactSubPropertyCount = 4;
export const monsterMainPropertyCount = 3;

export const artifactCategoryAt = 0;
export const artifactRestrictionAt = 1;
export const artifactMainPropertyAt = 2;
export const artifactConvertedPropertyAt = 3;
export const artifactSubPropertyIndexesAt = 4;
export const artifactSubPropertyRollPointsAt =
  artifactSubPropertyIndexesAt + artifactSubPropertyCount;
export const artifactSubPropertyFamiliesAt =
  artifactSubPropertyRollPointsAt + artifactSubPropertyCount;
export const artifactStride =
  artifactSubPropertyFamiliesAt + artifactSubPropertyCount;

export const monsterElementAt = 0;
export const monsterArchetypeAt = 1;
export const monsterMainPreferencesAt = 2;
export const monsterSubPropertyPreferencesAt =
  monsterMainPreferencesAt + 3;
export const monsterStride =
  monsterSubPropertyPreferencesAt + scoredArtifactProperties.length;

/** One invocation evaluates one artifact/monster pair. */
export const artifactScoreLanes = 64;

/** Class codes run 0 (Intangible) through 5 (Dark). */
export const engraveClassRows = 6;
