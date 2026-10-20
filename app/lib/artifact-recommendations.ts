import { artifactArchetypes, artifactElements, artifactProperty } from './artifact-properties';
import { readEngravedConversionStones } from './artifact-conversion-stones';
import { qualityTiers } from './quality-tiers';
import { scoreArtifactOnMonster, scorePercent } from './compute/artifact-score-core';
import type { EngravedConversionStone } from './artifact-conversion-stones';
import type { ArtifactCategory } from './artifact-properties';
import { artifactScoreRow } from './compute/artifact-score-protocol';
import type { ArtifactConversion, ArtifactScoreRequest } from './compute/artifact-score-protocol';
import type { GameRecord } from './game-data';
import type { ArtifactSettings } from './types';

/**
 * The settings that decide what a calculation *produces*, for the key each
 * recommendation view compares a held result against (`ACCOUNT-TABLES.md`
 * §7).
 *
 * `recalculate` is dropped because it only decides *when* a table re-runs. Left
 * in, switching the mode would mark every held result stale — and in the
 * on-change mode that reads as the setting recalculating the page merely by
 * being chosen. One function rather than three spreads, so a setting added
 * later cannot be scoring input in one view and not in another.
 */
export function scoringSettings(settings: ArtifactSettings): Omit<ArtifactSettings, 'recalculate'> {
  /* Listed rather than spread-minus-one, so the compiler makes a setting added
     later be classified on purpose: `Omit` fails the return type until the new
     field is either named here as scoring input or excluded like `recalculate`.
     A rest spread would have quietly swept it in. */
  return {
    acceptableWorth: settings.acceptableWorth,
    onlyFactorInOwnedMonsters: settings.onlyFactorInOwnedMonsters,
    onlyLevel40Monsters: settings.onlyLevel40Monsters,
    conversionStoneMode: settings.conversionStoneMode,
    conversionRoll: settings.conversionRoll,
    ignoreInsignificantDifferences: settings.ignoreInsignificantDifferences,
    insignificantDifference: settings.insignificantDifference,
    includeIntangibleArtifacts: settings.includeIntangibleArtifacts,
  };
}

/**
 * One artifact's score on one monster, read out of the packed requests the
 * compute backends are given.
 *
 * A view that shows an artifact beside its ranking needs two readings of the
 * same pair — what it is worth as it stands, and what it would be worth after
 * the conversion the settings allow — and both must come from the scorer that
 * built the ranking, or a row would disagree with the list it sits in. So this
 * is the whole boundary between a packed request and a figure on screen:
 * `conversions: false` forces the no-conversion mode, everything else follows
 * the request, and the value comes back in the whole percentage points every
 * score is compared on (§17.1).
 *
 * `undefined` means the pair was never scorable — an ineligible engrave class, a
 * monster with no recorded preferences, an artifact the settings excluded — and
 * is deliberately not zero, which would read as a judgement.
 */
export function artifactPairScore(
  requests: readonly ArtifactScoreRequest[],
  artifactId: string,
  /** The monster's species id: score matrices are indexed by species. */
  monsterId: string,
  /* `unitId` names the owned copy being asked about, where there is one. A copy
     that wants something its species does not has a row of its own, and the
     question is then answered from that row (§19.2). */
  options: { conversions: boolean; unitId?: string },
): { value: number; conversions: readonly ArtifactConversion[] } | undefined {
  for (const request of requests) {
    const artifact = request.artifacts.find((entry) => entry.id === artifactId);
    const monster = artifactScoreRow(request, monsterId, options.unitId);
    if (!artifact || !monster) continue;
    const score = scoreArtifactOnMonster(artifact, monster,
      options.conversions ? request : { ...request, conversionMode: 0 });
    return score === undefined ? undefined : { value: scorePercent(score.value), conversions: score.conversions };
  }
  return undefined;
}

/**
 * The band inside which two scores count as the same, in whole percentage
 * points (`ARTIFACT-CANONICAL.md` §17.3). Zero when the user has not asked for
 * one, which is the rule switched off rather than a band of nothing.
 */
export function insignificantDifference(settings: ArtifactSettings): number {
  return settings.ignoreInsignificantDifferences ? settings.insignificantDifference : 0;
}

/**
 * Whether moving to `candidate` is worth showing against `current`, both in
 * whole percentage points.
 *
 * A gain that does not clear the band is not an improvement (§17.3), and an
 * equal score never is: a recommendation that changes nothing is noise, which
 * is the whole of §17.2.
 */
export function isWorthwhileGain(candidate: number, current: number, settings: ArtifactSettings): boolean {
  return candidate - current > insignificantDifference(settings);
}

/**
 * The stone a recommendation would spend: the best grade owned for this
 * property and engrave class (§17.6). `undefined` when the account owns none,
 * which is the ordinary case in the theoretical mode where nothing is spent.
 *
 * Only restricted artifacts ever reach this: an Intangible cannot be converted
 * (§10.1), so no recommendation names a stone for one.
 */
export function engravedStoneFor(
  stones: readonly EngravedConversionStone[],
  category: ArtifactCategory,
  engraveClassCode: number,
  propertyId: number,
): EngravedConversionStone | undefined {
  let best: EngravedConversionStone | undefined;
  for (const stone of stones) {
    if (stone.category !== category || stone.propertyId !== propertyId) continue;
    if (stone.engraveClassCode !== engraveClassCode) continue;
    if (!best || gradeRank(stone.grade) > gradeRank(best.grade)) best = stone;
  }
  return best;
}

/* The shared tier order, weakest first, rather than a copy of it. */
function gradeRank(grade: EngravedConversionStone['grade']): number {
  return qualityTiers.indexOf(grade);
}

/** Reads the account's stones once, for a view that labels many rows. */
export function engravedStonesFor(data: GameRecord | undefined): EngravedConversionStone[] {
  return readEngravedConversionStones(data);
}

/**
 * The engrave classes by their export code, which is the same numbering the score
 * protocol uses for an artifact's restriction — so a stone and the artifact it
 * would be spent on are named from one table.
 */
const stoneEngraveClassNames: Record<ArtifactCategory, Record<number, string>> = {
  attribute: artifactElements,
  type: artifactArchetypes,
};

/** The semantic pieces of one conversion recommendation (§17.6). */
export function conversionDescription(
  conversion: ArtifactConversion,
  stone?: EngravedConversionStone,
  /** The artifact's permanently converted line, where it has one (§10). */
  convertedPropertyIndex?: number | null,
  /** The current property on the line being converted, when known. */
  sourcePropertyId?: number,
): { action: 'Convert to' | 'Re-convert to' | 'Improve roll in'; source: string; target: string; stone?: string } {
  const property = artifactProperty(conversion.propertyId);
  const target = property ? property.name : `property ${conversion.propertyId}`;
  /* The lock means a further stone overwrites the line already converted, so
     the wording says so: it either replaces the property's roll or replaces
     the property itself, rather than spending the artifact's one free slot. */
  const action = sourcePropertyId === conversion.propertyId
    ? 'Improve roll in'
    : convertedPropertyIndex === conversion.sourceIndex ? 'Re-convert to' : 'Convert to';
  /* The line the stone would be spent on leads the recommendation, so it is
     named as the subject of the sentence rather than as an object inside it.
     Where the monster ranks several lines the same, all of them are named —
     "Sub 1/2/4" — because the recommendation is indifferent between them and
     the user may have a reason of their own to keep one. The scorer's own
     choice is still in the list, so a single-line reading stays exact. */
  const sourceIndexes = conversion.equivalentSourceIndexes?.length
    ? [...conversion.equivalentSourceIndexes].sort((left, right) => left - right)
    : [conversion.sourceIndex];
  const source = `Sub ${sourceIndexes.map((index) => index + 1).join('/')}`;
  if (!stone) return { action, source, target };
  const engraveClass = stoneEngraveClassNames[stone.category][stone.engraveClassCode] ?? '';
  return { action, source, target, stone: `${stone.grade} ${engraveClass} stone`.replace('  ', ' ') };
}
