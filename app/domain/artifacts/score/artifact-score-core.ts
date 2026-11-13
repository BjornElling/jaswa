import { artifactPropertyAvailability, scoredArtifactProperties } from './artifact-score-schema';
import {
  artifactMainPropertyPoints, artifactPreferenceWeight, artifactScoreFromPoints,
} from '../artifact-optimal-value';
import { artifactNormalConversionContributions, bestArtifactLineContributions } from '../artifact-properties';
import { artifactFitsClassCodes, intangibleRestrictionCode } from './artifact-score-protocol';
import type {
  ArtifactConversion, ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput,
} from './artifact-score-protocol';

/* The packed inputs carry preferences as codes and the per-artifact reader
   carries them as names, but they mean the same three things and are worth the
   same three amounts. `artifactPreferenceWeight` takes either, so this file no
   longer holds a second opinion about what an acceptable line counts for. */
const weight = artifactPreferenceWeight;

/**
 * Whether the engrave rule (§1) permits this pair. The rule itself is
 * `artifactFitsClassCodes`, shared with the artifact library's own reader; this
 * only unpacks the two inputs into the four codes it tests.
 *
 * The category still binds either way, and that is what makes the Intangible
 * wildcard safe: an attribute Intangible is only ever compared against the
 * attribute matrix.
 */
function fits(artifact: PackedArtifactScoreInput, monster: PackedMonsterScoreInput): boolean {
  return artifactFitsClassCodes(artifact.category, artifact.restriction, monster.element, monster.archetype);
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
    * artifact.subPropertyRollPoints[index];
}

/**
 * Orders two source lines by the score lost when each is replaced. A conversion
 * recommendation changes only the one worst line, not every line that could
 * improve. When lines contribute the same score, the lower natural-roll
 * percentage goes first. A remaining tie keeps artifact order.
 */
function compareSacrifice(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  left: number,
  right: number,
  acceptableWorth: number,
): number {
  const firstContribution = sourceContribution(artifact, monster, left, acceptableWorth);
  const secondContribution = sourceContribution(artifact, monster, right, acceptableWorth);
  if (firstContribution !== secondContribution) return firstContribution - secondContribution;
  const firstRoll = artifact.subPropertyRollPoints[left];
  const secondRoll = artifact.subPropertyRollPoints[right];
  if (firstRoll !== secondRoll) return firstRoll - secondRoll;
  return left - right;
}

/**
 * The lines the recommendation is indifferent between: every sub property whose
 * conversion to the same target lands on the same whole-point score as the
 * chosen source's, in numeric order.
 *
 * The test is the figure shown beside the recommendation, not the preference
 * band. A band once stood in for it, and named all four lines of an artifact
 * whose four lines were all preferred — while the score beside it held only for
 * the weakest, so a stone spent on the strongest line would land well short of
 * the figure promised. Unwanted lines and empty slots still group together, as
 * they should: each contributes nothing, so giving up any of them yields the
 * same score, and the choice between them belongs to the user, who may be
 * keeping one for a monster this plan has not reached yet.
 */
function equivalentSources(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  sourceIndex: number,
  value: number,
  scoreWithout: (index: number) => number,
): number[] {
  /* The lock leaves no choice to offer: a further stone overwrites this slot
     and no other, however the rest are ranked (§10). */
  if (artifact.convertedPropertyIndex >= 0) return [sourceIndex];
  return [0, 1, 2, 3].filter((index) => index === sourceIndex || scoreWithout(index) === value);
}

function candidateAllowed(
  artifact: PackedArtifactScoreInput,
  propertyIndex: number,
  owned: ReadonlySet<number>,
  mode: number,
  sourceIndex: number,
): boolean {
  const availability = artifactPropertyAvailability[propertyIndex];
  if (availability !== 0 && availability !== artifact.category) return false;
  /* A conversion may reroll the source line into the same property. It still
     leaves the artifact with one copy of that property; other properties
     already present remain unavailable targets. A legacy line v8 merged counts
     as its successor here, as the game counts it: ATK Increasing Effect on one
     line closes ATK/DEF UP Effect to every other (§4). */
  if (artifact.subPropertyFamilyIndexes.includes(propertyIndex)
    && artifact.subPropertyFamilyIndexes[sourceIndex] !== propertyIndex) return false;
  return mode !== 2 || owned.has(propertyIndex);
}

/** Whole percentage points, the one scale every score is compared on (§17.1). */
export function scorePercent(value: number): number {
  return Math.round(value * 100);
}

/**
 * The stones usable on this artifact. A stone is engraved for one engrave class
 * and converts nothing else (§15.12), so the artifact's own class selects the
 * set. Only restricted artifacts reach here: §10.1 stops an Intangible before
 * any conversion is projected, so there is no classless case to answer.
 */
function ownedPropertiesFor(
  artifact: PackedArtifactScoreInput,
  request: Pick<ArtifactScoreRequest, 'ownedConversionPropertyIndexesByClass'>,
): ReadonlySet<number> {
  return new Set(request.ownedConversionPropertyIndexesByClass[artifact.restriction] ?? []);
}

/**
 * The conversion model is deliberately phrased in weighted max-roll points. It
 * chooses the single least-contributing source line (or the permanent converted
 * slot), then the best legal property, including a higher-roll reroll of the
 * source property.
 *
 * The line given up is the one contributing least to this monster; equal lines
 * are separated by their natural-roll percentage, weakest first. The
 * property converted to is the most wanted and, among equals, the one most
 * players engrave. Neither tie falls accidentally to vocabulary order.
 *
 * A re-conversion is judged by the total artifact score it would produce. The
 * permanent lock names the only line it may replace; it does not preserve a
 * high but unwanted roll when a lower, wanted replacement helps the monster.
 */
export function scoreArtifactOnMonster(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  request: Pick<ArtifactScoreRequest,
    'acceptableWorth' | 'conversionMode' | 'conversionRollFractions' | 'insignificantDifference' | 'ownedConversionPropertyIndexesByClass'>,
): { value: number; conversion: ArtifactConversion | undefined; conversions: ArtifactConversion[] } | undefined {
  if (!fits(artifact, monster)) return undefined;
  /* The main property adds its own max-roll points; it does not gate the four
     rolled lines. An unwanted main therefore forfeits these points and nothing
     else, so the artifact is still scored — and still worth converting — on what
     its sub properties deliver. */
  const mainPoints = weight(monster.mainPreferences[artifact.mainProperty] ?? 0, request.acceptableWorth)
    * artifactMainPropertyPoints;

  let weightedSubProperties = 0;
  for (let index = 0; index < 4; index += 1) {
    const points = artifact.subPropertyRollPoints[index];
    if (!Number.isFinite(points) || points < 0 || points > bestArtifactLineContributions) return undefined;
    weightedSubProperties += sourceContribution(artifact, monster, index, request.acceptableWorth);
  }
  const currentValue = artifactScoreFromPoints(mainPoints, weightedSubProperties, request.acceptableWorth);
  const currentPercent = scorePercent(currentValue);
  if (request.conversionMode === 0) return { value: currentValue, conversion: undefined, conversions: [] };
  /* §10.1: an Intangible artifact cannot be converted at all, so it is scored
     on what it holds and nothing more. Projecting a conversion here would rank
     these above artifacts that can genuinely be improved, on a gain the game
     will never let the user collect. */
  if (artifact.restriction === intangibleRestrictionCode) {
    return { value: currentValue, conversion: undefined, conversions: [] };
  }

  /* A permanently converted slot is the only line the game will let a further
     stone touch, so it is the source whatever it holds. Otherwise one and only
     one source is considered: the lowest-contributing sub property. */
  const sources = artifact.convertedPropertyIndex >= 0
    ? [artifact.convertedPropertyIndex]
    : [[0, 1, 2, 3].reduce((worst, candidate) => (
      compareSacrifice(artifact, monster, candidate, worst, request.acceptableWorth) < 0 ? candidate : worst
    ))];
  const owned = ownedPropertiesFor(artifact, request);
  const candidates: Array<ArtifactConversion & { share: number }> = [];

  for (const sourceIndex of sources) {
    if (sourceIndex < 0 || sourceIndex > 3) continue;
    const withoutSource = weightedSubProperties
      - sourceContribution(artifact, monster, sourceIndex, request.acceptableWorth);
    for (let propertyIndex = 0; propertyIndex < scoredArtifactProperties.length; propertyIndex += 1) {
      if (!candidateAllowed(artifact, propertyIndex, owned, request.conversionMode, sourceIndex)) continue;
      const band = monster.subPropertyPreferences[propertyIndex] ?? 0;
      /* §17.5: a property the monster neither prefers nor accepts is never
         suggested, however much arithmetic it would add. */
      if (band === 0) continue;
      const convertedWeight = weight(band, request.acceptableWorth);
      const conversionFraction = request.conversionRollFractions[propertyIndex];
      if (!Number.isFinite(conversionFraction) || conversionFraction < 0 || conversionFraction > 1) continue;
      /* A perfect conversion counts as one and a half maximum natural rolls.
         This is deliberately the underlying game rate, rather than a
         property-specific display rounding such as 5 → 8. */
      const conversionPoints = conversionFraction * artifactNormalConversionContributions;
      const convertedValue = artifactScoreFromPoints(
        mainPoints, withoutSource + convertedWeight * conversionPoints, request.acceptableWorth);
      const value = scorePercent(convertedValue);
      /* §17.4 condition 1: a conversion that does not raise the score is not a
         projection. Compared as whole points, so a conversion the interface
         would show as no change is not offered as one. */
      if (value <= currentPercent) continue;
      candidates.push({
        sourceIndex,
        /* A same-property reroll is only valid on the line that already holds
           that property; the other equivalent source lines would create a
           duplicate. */
        equivalentSourceIndexes: propertyIndex === artifact.subPropertyFamilyIndexes[sourceIndex]
          ? [sourceIndex]
          : equivalentSources(artifact, monster, sourceIndex, value, (index) => scorePercent(artifactScoreFromPoints(
            mainPoints,
            weightedSubProperties - sourceContribution(artifact, monster, index, request.acceptableWorth)
              + convertedWeight * conversionPoints,
            request.acceptableWorth))),
        propertyId: scoredArtifactProperties[propertyIndex].id,
        value,
        gain: value - currentPercent,
        preference: band === 2 ? 'preferred' : 'acceptable',
        share: monster.subPropertyShares[propertyIndex] ?? 0,
      });
    }
  }

  const worthwhile = candidates.filter((candidate) => candidate.gain > request.insignificantDifference);
  /* §17.5: preferred conversions displace accepted ones outright rather than
     competing with them on value. A preferred property is what the monster
     wants; an accepted one is a concession, and listing a strong concession
     above a weak preference would invite spending a stone on the wrong line. */
  const preferred = worthwhile.filter((candidate) => candidate.preference === 'preferred');
  const offered = preferred.length ? preferred : worthwhile;
  offered.sort((left, right) => right.value - left.value
    /* Equal scores mean the band is all the weight read, so the property more
       players engrave is recommended ahead of whichever the vocabulary lists
       first; the id settles a tie in the observations themselves. */
    || right.share - left.share
    || left.propertyId - right.propertyId);
  /* The share was only ever a tiebreak for the ordering above; it is not part
     of the recommendation the interface shows. */
  const conversions = offered.map((candidate) => ({
    sourceIndex: candidate.sourceIndex,
    equivalentSourceIndexes: candidate.equivalentSourceIndexes,
    propertyId: candidate.propertyId,
    value: candidate.value,
    gain: candidate.gain,
    preference: candidate.preference,
  }));
  const best = conversions[0];
  return {
    /* Potential means a conversion the player would actually be asked to take:
       it clears the configured band and, when possible, is preferred rather
       than merely acceptable. */
    value: (conversions[0]?.value ?? currentPercent) / 100,
    conversion: best,
    conversions,
  };
}

/**
 * The matrix carries whole percentage points (§17.1), so every consumer — the
 * allocation, the rankings, the thresholds — compares the number the interface
 * shows. A negative entry is an ineligible pair, as before.
 */
export function calculateArtifactScoresCpu(request: ArtifactScoreRequest): Float32Array {
  const scores = new Float32Array(request.artifacts.length * request.monsters.length);
  let output = 0;
  for (const artifact of request.artifacts) {
    for (const monster of request.monsters) {
      const score = scoreArtifactOnMonster(artifact, monster, request);
      scores[output] = score === undefined ? -1 : scorePercent(score.value);
      output += 1;
    }
  }
  return scores;
}
