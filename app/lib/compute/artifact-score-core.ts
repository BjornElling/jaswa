import { artifactPropertyAvailability, scoredArtifactProperties } from './artifact-score-schema';
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
 * How willingly a line is given up, lower being sooner. The preference band
 * decides it outright — an unwanted line goes before any acceptable one, and an
 * acceptable one before any preferred one — so a line the monster wants is never
 * sacrificed while a line it does not want survives, however each of them
 * rolled.
 *
 * Inside a band the question changes with the band. A wanted line contributes
 * real score, so the one contributing least is the smallest loss and goes
 * first. An unwanted line contributes nothing whatever it rolled, so score
 * cannot separate two of them at all; there the observed share decides, and the
 * weaker roll settles a tie between two equally engraved ones.
 *
 * Ordering the sources explicitly rather than inferring it from the resulting
 * score matters for exactly those ties: removing either of two lines that
 * contribute the same leaves the same score, so the arithmetic alone would
 * settle it on whichever line the loop happened to reach first.
 */
function sourceSacrificeRank(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  index: number,
  acceptableWorth: number,
): { band: number; contribution: number; share: number; roll: number } {
  const propertyIndex = artifact.subPropertyIndexes[index];
  const roll = artifact.subPropertyFractions[index];
  /* A legacy line names no property the statistics describe. It is unwanted by
     definition and the readiest thing to convert away. Its roll is measured
     against an unknown ceiling, so it cannot be compared with the others and
     is ranked lowest outright rather than on a number that means nothing. */
  if (propertyIndex < 0) return { band: 0, contribution: 0, share: -1, roll: -1 };
  return {
    band: monster.subPropertyPreferences[propertyIndex] ?? 0,
    contribution: sourceContribution(artifact, monster, index, acceptableWorth),
    share: monster.subPropertyShares[propertyIndex] ?? 0,
    roll,
  };
}

/** Orders two lines by how readily each is given up, readiest first. */
function compareSacrifice(
  artifact: PackedArtifactScoreInput,
  monster: PackedMonsterScoreInput,
  left: number,
  right: number,
  acceptableWorth: number,
): number {
  const first = sourceSacrificeRank(artifact, monster, left, acceptableWorth);
  const second = sourceSacrificeRank(artifact, monster, right, acceptableWorth);
  if (first.band !== second.band) return first.band - second.band;
  /* A wanted line is judged on what it actually adds, so a poorly rolled
     popular property is given up before a well rolled rare one. */
  if (first.band > 0) {
    if (first.contribution !== second.contribution) return first.contribution - second.contribution;
    return left - right;
  }
  /* Unwanted lines all contribute nothing, so the share is the only thing that
     distinguishes them, and the roll only where the share ties too. */
  if (first.share !== second.share) return first.share - second.share;
  if (first.roll !== second.roll) return first.roll - second.roll;
  /* Genuinely indistinguishable lines: keep the artifact's own order so the
     recommendation is stable rather than dependent on the sort's internals. */
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

/**
 * The conversion model is deliberately phrased in score space. It chooses the
 * least useful legal source line (or the permanent converted slot), then the
 * best missing legal property.
 *
 * Both halves are decided by the preference band first. The line given up is
 * the least wanted — unwanted before acceptable before preferred — and within
 * the band by what it contributes, except among unwanted lines, which all
 * contribute nothing and are ordered by the observed share instead. The
 * property converted to is the most wanted and, among equals, the one most
 * players engrave. Neither tie falls to the order the lines or the property
 * vocabulary happen to be in.
 *
 * The current result always wins over a lower calculated roll, which is what
 * the settings promise means by keeping a better roll already present on the
 * artifact.
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

  /* A permanently converted slot is the only line the game will let a further
     stone touch, so it is the source whatever it holds. Otherwise the four
     lines are tried in sacrifice order, which decides the ties below: equal
     scores keep the source already chosen, and that is now the readiest one. */
  const sources = artifact.convertedPropertyIndex >= 0
    ? [artifact.convertedPropertyIndex]
    : [0, 1, 2, 3].sort((left, right) => compareSacrifice(artifact, monster, left, right, request.acceptableWorth));
  const owned = new Set(request.ownedConversionPropertyIndexes);
  let bestValue = currentValue;
  let bestConversion: ArtifactConversion | undefined;
  let bestShare = -1;
  for (const sourceIndex of sources) {
    if (sourceIndex < 0 || sourceIndex > 3) continue;
    const withoutSource = weightedSubProperties
      - sourceContribution(artifact, monster, sourceIndex, request.acceptableWorth);
    for (let propertyIndex = 0; propertyIndex < scoredArtifactProperties.length; propertyIndex += 1) {
      if (!candidateAllowed(artifact, propertyIndex, owned, request.conversionMode)) continue;
      const convertedWeight = weight(monster.subPropertyPreferences[propertyIndex] ?? 0, request.acceptableWorth);
      const convertedValue = main * ((withoutSource + convertedWeight * request.conversionValue) / benchmark);
      /* Two candidates in the same preference band score identically, because the
         band is all the weight reads. Ordering those by observed share recommends
         the property more players engrave, rather than whichever the property
         vocabulary happens to list first. */
      const share = monster.subPropertyShares[propertyIndex] ?? 0;
      const improves = convertedValue > bestValue
        || (bestConversion !== undefined && convertedValue === bestValue && share > bestShare);
      if (improves) {
        bestValue = convertedValue;
        bestShare = share;
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
