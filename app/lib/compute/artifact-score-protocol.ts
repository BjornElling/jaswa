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
  /**
   * What the permanently converted slot already holds, as a fraction of the
   * ceiling a *conversion* can reach (`ARTIFACT-CANONICAL.md` §10: two
   * contributions). `-1` when the artifact has no converted slot.
   *
   * It is a separate number from that line's `subPropertyFractions` entry
   * because the two are fractions of different ceilings. §17.4 compares this
   * against a projected conversion, and comparing a five-contribution fraction
   * with a two-contribution one would refuse conversions that plainly help.
   */
  convertedSlotConversionFraction: number;
  /**
   * How much of a *line's* ceiling a conversion can reach on this artifact.
   *
   * A conversion collects two contributions whatever the grade granted (§10),
   * while the line it replaces is measured against the grade's own maximum
   * (§16) — so on a Legend a conversion reaches 2/5 of that line, and on a
   * Rare 2/3. It belongs to the artifact rather than the request because it is
   * a fact about the grade, and one request carries every grade.
   */
  conversionCeilingFraction: number;
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
  /**
   * Each property's observed share of this slot's distribution, in the same
   * order. The score deliberately does not read these — the preference band is
   * what it weighs — but a conversion choosing between two equally weighted
   * candidates breaks the tie on the larger share, so the property more players
   * actually engrave is the one recommended.
   */
  subPropertyShares: readonly number[];
};

export type ArtifactScoreRequest = {
  artifacts: readonly PackedArtifactScoreInput[];
  monsters: readonly PackedMonsterScoreInput[];
  acceptableWorth: number;
  conversionMode: 0 | 1 | 2;
  /** One assumed roll fraction for each current artifact property. */
  conversionRollFractions: readonly number[];
  /** A recommendation must improve by more than this many whole score points. */
  insignificantDifference: number;
  /**
   * The compact property indexes named by engraved stones in this import, for
   * the whole category. Used to report how many stones an import yielded; the
   * per-artifact rule below is what eligibility actually reads.
   */
  ownedConversionPropertyIndexes: readonly number[];
  /**
   * The stones usable on one equip class, keyed by that class's code — a stone
   * is engraved for one class and converts nothing else
   * (`ARTIFACT-CANONICAL.md` §15.12). `intangibleRestrictionCode` holds the
   * union, because an Intangible artifact names no class and every stone of the
   * category applies to it.
   */
  ownedConversionPropertyIndexesByClass: Readonly<Record<number, readonly number[]>>;
  /** When supplied, report the score on this artifact's actual wearer as well as the category maximum. */
  targetMonsterIdByArtifact?: Readonly<Record<string, string>>;
  /** Return every eligible artifact-to-monster score for a focused comparison. */
  includeAllScores?: boolean;
  /** Return the compact score matrix for a bulk allocation without expanding it into objects. */
  includeScoreMatrix?: boolean;
};

export type ArtifactConversion = {
  sourceIndex: number;
  /**
   * Every line the same choice could be made on: the source above together with
   * any other sub property the monster ranks in the same preference band, in
   * numeric order and always including `sourceIndex` itself.
   *
   * The scorer converts exactly one line and picks the one that costs least, so
   * `sourceIndex` remains *the* recommendation and every score is computed from
   * it alone. But a monster that ranks three of the four lines as unwanted is
   * indifferent between them: replacing any one costs it nothing it wanted, and
   * naming only the arithmetic winner told the user a choice was forced when it
   * was theirs. This lists the lines the recommendation is genuinely indifferent
   * between, so the interface can offer them rather than a single line the user
   * may have a reason of their own to keep.
   *
   * A permanently converted slot (§10) is the only line a further stone can
   * touch, so it is alone here whatever the other lines are ranked.
   */
  equivalentSourceIndexes: readonly number[];
  propertyId: number;
  /**
   * The score this conversion produces, as whole percentage points — the same
   * integer scale every other score uses (`ARTIFACT-CANONICAL.md` §17.1).
   */
  value: number;
  /** What it adds over the artifact as it stands, in percentage points. */
  gain: number;
  /** Whether the monster prefers this property or merely accepts it. */
  preference: 'preferred' | 'acceptable';
};

export type ArtifactMaximumScore = {
  artifactId: string;
  monsterId: string;
  monsterName: string;
  /** Whole percentage points (`ARTIFACT-CANONICAL.md` §17.1). */
  value: number;
  /** The best conversion, or `undefined` when none improves on §17.4's tests. */
  conversion: ArtifactConversion | undefined;
  /**
   * Every conversion worth taking, best first — all preferred ones when any
   * exist, otherwise all accepted ones (§17.5). Empty when none qualifies.
   */
  conversions: readonly ArtifactConversion[];
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
