import type { ComputeBackend } from '../../shared/calculation-summary';

export type ArtifactComputeBackend = ComputeBackend;

/**
 * The `restriction` value for an Intangible artifact, which fits every monster
 * its category allows. Chosen as `0` because it is outside both class
 * numberings — elements run 1–5 and archetypes 1–4 — so no restricted artifact
 * can collide with it. Both backends must treat it identically; see `fits` in
 * `artifact-score-core.ts` and the same test in the WebGPU shader.
 */
export const intangibleRestrictionCode = 0;

/**
 * The engrave rule (`ARTIFACT-CANONICAL.md` §1), on the class codes the protocol
 * carries: an attribute artifact goes on a monster of its element, a type
 * artifact on a monster of its archetype, and an Intangible on any monster its
 * category allows.
 *
 * A monster whose own class the catalogue does not describe carries `0`, and a
 * *restricted* artifact demands an exact class — which `0` is not — so such a
 * monster is refused rather than matched by accident. The wildcard accepts it,
 * which is correct: an Intangible genuinely fits any monster.
 *
 * Declared here, next to the code it tests, because it is a rule two different
 * readers have to reach. The packed scorer applies it to rank; the artifact
 * library applies it before putting a number beside the monster it is engraved on. It lived only in
 * the scorer, and the library scored every pair it was handed — so an artifact
 * the engrave rule forbids read as a number on one page and "not judged" on the
 * other.
 */
export function artifactFitsClassCodes(
  category: 1 | 2,
  restriction: number,
  monsterElement: number,
  monsterArchetype: number,
): boolean {
  if (restriction === intangibleRestrictionCode) return true;
  return category === 1 ? monsterElement === restriction : monsterArchetype === restriction;
}

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
  /**
   * The scored property each line occupies for the no-duplicates rule
   * (`artifactPropertyFamilyIndex`): the line's own index, a merged legacy
   * line's successor, or -1. A conversion reads this, never the score.
   */
  subPropertyFamilyIndexes: readonly [number, number, number, number];
  /** Each line's value in max-roll points: one maximum natural roll is one point. */
  subPropertyRollPoints: readonly [number, number, number, number];
};

export type PackedMonsterScoreInput = {
  /**
   * The species id, or an owned copy's `unit_id` where that copy states
   * preferences of its own.
   *
   * **A row is a species until a copy disagrees.** Scores describe a monster
   * rather than a copy of one, so a collaboration pair ranks once and every
   * unstated copy of a species shares one row — that is still the rule. But
   * preferences are keyed per copy (`ARTIFACT-CANONICAL.md` §19.2) precisely so
   * two Lushens can be built for different things, and a species-keyed matrix
   * cannot express that: one of the two would have to be scored against the
   * other's answers. So a copy that has stated anything gets a row of its own,
   * and `id` is its `unit_id`. `ownerUnitId` says which is which.
   */
  id: string;
  name: string;
  /** Set where this row is one owned copy's own, rather than a species'. */
  ownerUnitId?: string;
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
  /** A conversion recommendation must improve by more than this many whole score points. */
  insignificantDifference: number;
  /**
   * The compact property indexes named by engraved stones in this import, for
   * the whole category. Used to report how many stones an import yielded; the
   * per-artifact rule below is what eligibility actually reads.
   */
  ownedConversionPropertyIndexes: readonly number[];
  /**
   * The stones usable on one engrave class, keyed by that class's code — a stone
   * is engraved for one class and converts nothing else
   * (`ARTIFACT-CANONICAL.md` §15.12). `intangibleRestrictionCode` deliberately
   * has no entry: an Intangible artifact cannot be converted at all (§10.1;
   * v8.1.9), so no stone ever applies to one.
   */
  ownedConversionPropertyIndexesByClass: Readonly<Record<number, readonly number[]>>;
  /** When supplied, report the score on the monster this artifact is engraved on as well as the category maximum. */
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
   *
   * A same-property reroll is also alone here: applying that target to another
   * source line would create a duplicate property rather than improve the line.
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
  /** The best conversion to recommend, or `undefined` when none clears the configured band. */
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

/**
 * The row one monster is scored under in one request: the copy's own where it
 * has one, its species' otherwise (`ARTIFACT-CANONICAL.md` §19.2). Per request,
 * because a copy may state the substats of one artifact category and not the
 * other.
 */
export function artifactScoreRow(
  request: ArtifactScoreRequest, speciesId: string, unitId?: string,
): PackedMonsterScoreInput | undefined {
  return (unitId === undefined ? undefined : request.monsters.find((entry) => entry.ownerUnitId === unitId))
    ?? request.monsters.find((entry) => entry.id === speciesId && entry.ownerUnitId === undefined);
}
