import { artifactArchetypes, artifactElements, artifactProperty } from './artifact-properties';
import { readEngravedConversionStones } from './artifact-conversion-stones';
import type { EngravedConversionStone } from './artifact-conversion-stones';
import type { ArtifactCategory } from './artifact-properties';
import type { ArtifactConversion } from './compute/artifact-score-protocol';
import type { GameRecord } from './game-data';
import type { ArtifactSettings } from './types';

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
 * property and equip class (§17.6). `undefined` when the account owns none,
 * which is the ordinary case in the theoretical mode where nothing is spent.
 */
export function engravedStoneFor(
  stones: readonly EngravedConversionStone[],
  category: ArtifactCategory,
  equipClassCode: number,
  propertyId: number,
): EngravedConversionStone | undefined {
  let best: EngravedConversionStone | undefined;
  for (const stone of stones) {
    if (stone.category !== category || stone.propertyId !== propertyId) continue;
    /* An Intangible artifact carries no class of its own, so every stone of the
       category fits it and the grade alone decides. */
    if (equipClassCode !== 0 && stone.equipClassCode !== equipClassCode) continue;
    if (!best || gradeRank(stone.grade) > gradeRank(best.grade)) best = stone;
  }
  return best;
}

const gradeOrder = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'] as const;

function gradeRank(grade: EngravedConversionStone['grade']): number {
  return gradeOrder.indexOf(grade);
}

/** Reads the account's stones once, for a view that labels many rows. */
export function engravedStonesFor(data: GameRecord | undefined): EngravedConversionStone[] {
  return readEngravedConversionStones(data);
}

/**
 * The equip classes by their export code, which is the same numbering the score
 * protocol uses for an artifact's restriction — so a stone and the artifact it
 * would be spent on are named from one table.
 */
const stoneEquipClassNames: Record<ArtifactCategory, Record<number, string>> = {
  attribute: artifactElements,
  type: artifactArchetypes,
};

/**
 * A conversion as one line of text: what it converts, to what, and — where a
 * stone would be spent — which stone (§17.6). The stone is named by grade and
 * class only, because the conversion itself already names the property.
 */
export function conversionLabel(
  conversion: ArtifactConversion,
  stone?: EngravedConversionStone,
  /** The artifact's permanently converted line, where it has one (§10). */
  convertedPropertyIndex?: number | null,
): string {
  const property = artifactProperty(conversion.propertyId);
  const target = property ? property.name : `property ${conversion.propertyId}`;
  /* The lock means a further stone overwrites the line already converted, so
     the wording says so: this replaces a conversion rather than spending the
     artifact's one free slot. A user reading "convert" would not know the
     existing line is what pays for it. */
  const verb = convertedPropertyIndex === conversion.sourceIndex ? 'Re-convert' : 'Convert';
  const source = `${verb} sub ${conversion.sourceIndex + 1} to ${target}`;
  if (!stone) return source;
  const equipClass = stoneEquipClassNames[stone.category][stone.equipClassCode] ?? '';
  return `${source} · ${stone.grade} ${equipClass} stone`.replace('  ', ' ');
}
