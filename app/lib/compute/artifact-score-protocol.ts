export type ArtifactComputeBackend = 'cpu' | 'webgpu';

/**
 * The `restriction` value for an Intangible artifact, which fits every monster
 * its category allows. Chosen as `0` because it is outside both class
 * numberings — elements run 1–5 and archetypes 1–4 — so no restricted artifact
 * can collide with it. Both backends must treat it identically; see `fits` in
 * `artifact-score-core.ts` and the same test in the WebGPU shader.
 */
export const intangibleRestrictionCode = 0;

export type PackedArtifactScoreInput = {
  id: string;
  category: 1 | 2;
  /**
   * Element for Attribute artifacts; archetype for Type artifacts;
   * `intangibleRestrictionCode` when the artifact restricts to neither.
   */
  restriction: number;
  mainProperty: 0 | 1 | 2;
  convertedPropertyIndex: number;
  /** Four indexes into `scoredArtifactProperties`, or -1 for legacy lines. */
  subPropertyIndexes: readonly [number, number, number, number];
  /** Each line's actual fraction of its own ceiling. */
  subPropertyFractions: readonly [number, number, number, number];
};

export type PackedMonsterScoreInput = {
  id: string;
  name: string;
  /** The game element codes: Water 1 through Dark 5. */
  element: number;
  /** Attack 1, Defense 2, HP 3, Support 4. */
  archetype: number;
  /** Unwanted 0, acceptable 1, preferred 2. */
  mainPreferences: readonly [number, number, number];
  /** One preference entry for every item in `scoredArtifactProperties`. */
  subPropertyPreferences: readonly number[];
};

export type ArtifactScoreRequest = {
  artifacts: readonly PackedArtifactScoreInput[];
  monsters: readonly PackedMonsterScoreInput[];
  acceptableWorth: number;
  conversionMode: 0 | 1 | 2;
  conversionValue: number;
  /** The compact property indexes named by engraved stones in this import. */
  ownedConversionPropertyIndexes: readonly number[];
  /** When supplied, report the score on this artifact's actual wearer as well as the category maximum. */
  targetMonsterIdByArtifact?: Readonly<Record<string, string>>;
  /** Return every eligible artifact-to-monster score for a focused comparison. */
  includeAllScores?: boolean;
  /** Return the compact score matrix for a bulk allocation without expanding it into objects. */
  includeScoreMatrix?: boolean;
};

export type ArtifactConversion = {
  sourceIndex: number;
  propertyId: number;
};

export type ArtifactMaximumScore = {
  artifactId: string;
  monsterId: string;
  monsterName: string;
  value: number;
  conversion: ArtifactConversion | undefined;
};

export type ArtifactScoreResult = {
  backend: ArtifactComputeBackend;
  durationMs: number;
  evaluatedPairs: number;
  maxima: ArtifactMaximumScore[];
  /** Scores for the artifact-to-monster assignments requested by the caller. */
  targetScores: ArtifactMaximumScore[];
  /** Every eligible pair when the caller needs a complete ranking rather than one maximum. */
  allScores: ArtifactMaximumScore[];
  /** Row-major scores, retained only for bulk allocation callers. Negative values are ineligible pairs. */
  scoreMatrix: Float32Array | undefined;
  /** `owned` may correctly have no candidates when the import has no stones. */
  ownedConversionCount: number;
};

export type ArtifactScoreWorkerRequest = {
  type: 'calculate';
  requestId: number;
  request: ArtifactScoreRequest;
  preferWebGpu: boolean;
};

export type ArtifactScoreWorkerResponse = {
  type: 'result';
  requestId: number;
  result: ArtifactScoreResult;
} | {
  type: 'error';
  requestId: number;
  message: string;
};
