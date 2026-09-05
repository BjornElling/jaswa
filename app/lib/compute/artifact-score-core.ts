import { artifactPropertyAvailability, scoredArtifactProperties } from './artifact-score-schema';
import { artifactScoreBenchmark } from '../artifact-optimal-value';
import { intangibleRestrictionCode } from './artifact-score-protocol';
import type {
  ArtifactConversion, ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput,
} from './artifact-score-protocol';

function weight(preference: number, acceptableWorth: number): number {
  if (preference === 2) return 1;
  return preference === 1 ? acceptableWorth / 100 : 0;
}

/**
 * Whether the equip rule (§1) permits this pair.
 *
 * The restriction code `0` means **Intangible**: the artifact fills its category
 * slot but names no class, so it fits every monster the category allows. The
 * category itself still binds, and that is the only reason this can be a
 * wildcard safely — an attribute Intangible is still compared only against the
 * attribute matrix.
 *
 * A monster whose own class the catalogue does not describe also carries `0`,
 * and a *restricted* artifact still demands an exact class — which `0` is not —
 * so such a monster is refused rather than matched by accident. The wildcard
 * accepts it, which is correct: an Intangible genuinely fits any monster.
 */
function fits(artifact: PackedArtifactScoreInput, monster: PackedMonsterScoreInput): boolean {
  if (artifact.restriction === intangibleRestrictionCode) return true;
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

/**
 * Orders two source lines by the score lost when each is replaced. A conversion
 * recommendation changes only the one worst line, not every line that could
 * improve. When several lines contribute zero, their score cannot settle the
 * choice, so the lower roll goes first. A remaining tie keeps artifact order.
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
  if (firstContribution === 0) {
    const firstRoll = artifact.subPropertyFractions[left];
    const secondRoll = artifact.subPropertyFractions[right];
    if (firstRoll !== secondRoll) return firstRoll - secondRoll;
  }
  return left - right;
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

/** Whole percentage points, the one scale every score is compared on (§17.1). */
export function scorePercent(value: number): number {
  return Math.round(value * 100);
}

/**
 * The stones usable on this artifact. A stone is engraved for one equip class
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
 * The conversion model is deliberately phrased in score space. It chooses the
 * single least-contributing source line (or the permanent converted slot), then
 * best missing legal property.
 *
 * The line given up is the one contributing least to this monster; multiple
 * zero-contribution lines are separated by their roll, weakest first. The
 * property converted to is the most wanted and, among equals, the one most
 * players engrave. Neither tie falls accidentally to vocabulary order.
 *
 * The current result always wins over a lower calculated roll, which is what
 * the settings promise means by keeping a better roll already present on the
 * artifact.
 */
export function scoreArtifactOnMonster(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  request: Pick<ArtifactScoreRequest,
    'acceptableWorth' | 'conversionMode' | 'conversionRollFractions' | 'insignificantDifference' | 'ownedConversionPropertyIndexesByClass'>,
): { value: number; conversion: ArtifactConversion | undefined; conversions: ArtifactConversion[] } | undefined {
  if (!fits(artifact, monster)) return undefined;
  const main = weight(monster.mainPreferences[artifact.mainProperty] ?? 0, request.acceptableWorth);
  if (main === 0) return { value: 0, conversion: undefined, conversions: [] };

  const benchmark = artifactScoreBenchmark(request.acceptableWorth);
  let weightedSubProperties = 0;
  for (let index = 0; index < 4; index += 1) {
    const fraction = artifact.subPropertyFractions[index];
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return undefined;
    weightedSubProperties += sourceContribution(artifact, monster, index, request.acceptableWorth);
  }
  const currentValue = main * (weightedSubProperties / benchmark);
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
      if (!candidateAllowed(artifact, propertyIndex, owned, request.conversionMode)) continue;
      const band = monster.subPropertyPreferences[propertyIndex] ?? 0;
      /* §17.5: a property the monster neither prefers nor accepts is never
         suggested, however much arithmetic it would add. */
      if (band === 0) continue;
      const convertedWeight = weight(band, request.acceptableWorth);
      const conversionFraction = request.conversionRollFractions[propertyIndex];
      if (!Number.isFinite(conversionFraction) || conversionFraction < 0 || conversionFraction > 1) continue;
      /* The conversion reaches a fraction of the *line's* ceiling, because a
         conversion collects two contributions whatever the grade allows (§10).
         Using the fraction without that ceiling would let a converted line
         score like a perfectly rolled one and overstate every conversion on a
         good artifact. */
      const reach = conversionFraction * artifact.conversionCeilingFraction;
      /* §17.4 condition 2: a converted slot already holding more than the
         projection would produce keeps what it has. The lock means a further
         stone overwrites that same line, so proposing one proposes destroying
         the better roll. Both sides are fractions of the conversion ceiling,
         which is what makes them comparable. */
      if (sourceIndex === artifact.convertedPropertyIndex
        && artifact.convertedSlotConversionFraction >= 0
        && artifact.convertedSlotConversionFraction >= conversionFraction) continue;
      const convertedValue = main * ((withoutSource + convertedWeight * reach) / benchmark);
      const value = scorePercent(convertedValue);
      /* §17.4 condition 1: a conversion that does not raise the score is not a
         recommendation. Compared as whole points, so a conversion the interface
         would show as no change is not offered as one. */
      if (value - currentPercent <= request.insignificantDifference) continue;
      candidates.push({
        sourceIndex,
        propertyId: scoredArtifactProperties[propertyIndex].id,
        value,
        gain: value - currentPercent,
        preference: band === 2 ? 'preferred' : 'acceptable',
        share: monster.subPropertyShares[propertyIndex] ?? 0,
      });
    }
  }

  /* §17.5: preferred conversions displace accepted ones outright rather than
     competing with them on value. A preferred property is what the monster
     wants; an accepted one is a concession, and listing a strong concession
     above a weak preference would invite spending a stone on the wrong line. */
  const preferred = candidates.filter((candidate) => candidate.preference === 'preferred');
  const offered = preferred.length ? preferred : candidates;
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
    propertyId: candidate.propertyId,
    value: candidate.value,
    gain: candidate.gain,
    preference: candidate.preference,
  }));
  const best = conversions[0];
  return {
    value: best ? best.value / 100 : currentValue,
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
