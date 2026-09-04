import { artifactPreferenceStatus, defaultPropertyPreferences, recordedArtifactPreferenceMonsterIds } from '../artifact-preferences';
import { readArtifacts } from '../artifacts';
import { readEngravedConversionStones } from '../artifact-conversion-stones';
import {
  artifactConversionContributions, artifactConversionMaximum, artifactConversionRollFraction, bestArtifactLineContributions,
} from '../artifact-properties';
import type { Artifact, ArtifactSubProperty } from '../artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../artifact-properties';
import type { GameRecord } from '../game-data';
import { monsterSpeciesPresentation } from '../monster-catalog';
import { monsterSpeciesId } from '../monster-species';
import { elementName } from '../rune-sets';
import { artifactPropertyIndex, categoryCode, scoredArtifactProperties } from './artifact-score-schema';
import { intangibleRestrictionCode } from './artifact-score-protocol';
import type { ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput } from './artifact-score-protocol';
import type { ArtifactSettings } from '../types';
import { artifactOptimizationMonsters } from '../artifact-optimization-monsters';

const mainPropertyIndexes: Record<ArtifactMainProperty, 0 | 1 | 2> = { HP: 0, ATK: 1, DEF: 2 };
const archetypeCodes: Record<string, number> = { Attack: 1, Defense: 2, HP: 3, Support: 4 };
/* The same numbering `artifactElements` uses, so an artifact's element and a
   monster's element are compared on one scale. */
const elementCodes: Record<string, number> = { Water: 1, Fire: 2, Wind: 3, Light: 4, Dark: 5 };

function preferenceCode(preference: 'preferred' | 'acceptable' | 'unwanted' | undefined): number {
  if (preference === 'preferred') return 2;
  return preference === 'acceptable' ? 1 : 0;
}

function masterIdElement(masterId: string): number {
  const lastDigit = Number(masterId.at(-1));
  return elementName(lastDigit) ? lastDigit : 0;
}

/**
 * The equip class as a comparison code, or `intangibleRestrictionCode` for an
 * Intangible artifact, which matches every monster its category allows.
 *
 * `readArtifact` has already rejected any artifact whose class cannot be named,
 * so there is no third case to encode here: every artifact that reaches this
 * point is either restricted to one named class or deliberately unrestricted.
 */
export function artifactRestriction(artifact: Artifact): number {
  if (artifact.intangible) return intangibleRestrictionCode;
  const code = artifact.category === 'attribute'
    ? elementCodes[artifact.element ?? '']
    : archetypeCodes[artifact.archetype ?? ''];
  /* Unreachable for an artifact from `readArtifact`. Kept as the wildcard code
     rather than a silent mismatch so a future reader change cannot make an
     artifact vanish from the rankings without anyone noticing. */
  return code ?? intangibleRestrictionCode;
}

function fraction(subProperty: ArtifactSubProperty): number {
  if (subProperty.maximumHundredths === null || subProperty.maximumHundredths <= 0) return 0;
  return subProperty.valueHundredths / subProperty.maximumHundredths;
}

/**
 * What the converted slot already holds, measured against the ceiling a
 * *conversion* can reach (§10's two contributions) rather than against the
 * grade's. `-1` when the artifact has no converted slot, or when the line's
 * range is unknown and no honest comparison exists.
 *
 * §17.4 compares this with the projected conversion, and both sides must be on
 * this scale: a slot holding a max conversion sits at 1, so no projection can
 * beat it, which is exactly the outcome the rule wants.
 */
function convertedSlotConversionFraction(artifact: Artifact): number {
  const index = artifact.convertedPropertyIndex;
  if (index === null) return -1;
  const line = artifact.subProperties[index];
  const maximum = line ? artifactConversionMaximum(line.definition) : null;
  if (!line || maximum === null || maximum <= 0) return -1;
  /* `artifactConversionMaximum` is in percentage points and the stored value in
     hundredths of one, so the ceiling is scaled rather than the value rounded —
     §9's rule that these are never compared as floats. */
  return line.valueHundredths / Math.round(maximum * 100);
}

function packArtifact(artifact: Artifact): PackedArtifactScoreInput {
  const indexes = artifact.subProperties.map((subProperty) => artifactPropertyIndex.get(subProperty.definition.id) ?? -1);
  const fractions = artifact.subProperties.map(fraction);
  return {
    id: artifact.id,
    category: categoryCode(artifact.category),
    restriction: artifactRestriction(artifact),
    mainProperty: mainPropertyIndexes[artifact.mainProperty],
    convertedPropertyIndex: artifact.convertedPropertyIndex ?? -1,
    subPropertyIndexes: [indexes[0], indexes[1], indexes[2], indexes[3]],
    subPropertyFractions: [fractions[0], fractions[1], fractions[2], fractions[3]],
    convertedSlotConversionFraction: convertedSlotConversionFraction(artifact),
    /* A conversion collects two contributions on every grade (§10) and every
       line is now measured against the game's best line, so this is one figure
       rather than a per-grade one. Dividing by the artifact's own grade made it
       reach 1 on a Normal or Magic artifact — a conversion scoring as a full
       line — which overstated conversions precisely where they help least. */
    conversionCeilingFraction: artifactConversionContributions / bestArtifactLineContributions,
  };
}


/* Scores describe a monster, not a copy of one, so both callers below pass a
   species id and the name shown is the species name — a collaboration pair
   appears once, under both of its names, rather than twice under one each. */
function packMonster(speciesId: string, category: ArtifactCategory): PackedMonsterScoreInput | undefined {
  const preferences = defaultPropertyPreferences(speciesId, category);
  if (!preferences || artifactPreferenceStatus(speciesId, category) !== 'scorable') return undefined;
  const presentation = monsterSpeciesPresentation(speciesId);
  const masterId = speciesId;
  return {
    id: masterId,
    name: presentation.name,
    element: masterIdElement(masterId),
    archetype: presentation.archetype ? archetypeCodes[presentation.archetype] ?? 0 : 0,
    mainPreferences: [
      preferenceCode(preferences.main.HP), preferenceCode(preferences.main.ATK), preferenceCode(preferences.main.DEF),
    ],
    subPropertyPreferences: scoredArtifactProperties.map((property) => preferenceCode(preferences.sub.get(property.id))),
    subPropertyShares: scoredArtifactProperties.map((property) => preferences.subShares.get(property.id) ?? 0),
  };
}

/* Collapsed to species: holding both halves of a collaboration pair is holding
   one monster twice over, and scoring it twice would rank the same result above
   everything else it ties with. */
function ownMonsterSpeciesIds(monsters: readonly GameRecord[]): string[] {
  const ids = new Set<string>();
  for (const monster of monsters) {
    const masterId = monster.unit_master_id;
    if ((typeof masterId === 'number' || typeof masterId === 'string') && String(masterId)) {
      ids.add(monsterSpeciesId(masterId));
    }
  }
  return [...ids];
}

/* The equip class as the score protocol codes it. Attribute stones name an
   element and type stones an archetype, on the same numbering the artifacts
   themselves use, so a stone and an artifact are compared on one scale. */
const stoneClassCodes: Record<ArtifactCategory, Record<number, number>> = {
  attribute: { 1: elementCodes.Water, 2: elementCodes.Fire, 3: elementCodes.Wind, 4: elementCodes.Light, 5: elementCodes.Dark },
  type: { 1: archetypeCodes.Attack, 2: archetypeCodes.Defense, 3: archetypeCodes.HP, 4: archetypeCodes.Support },
};

/**
 * The engraved stones usable on each equip class of one category, as compact
 * property indexes.
 *
 * A stone is engraved for a single class and converts nothing else
 * (`ARTIFACT-CANONICAL.md` §15.12), so the map is keyed by class rather than
 * pooled. `intangibleRestrictionCode` carries the union: an Intangible artifact
 * names no class, and every stone of its category applies to it.
 */
export function ownedConversionPropertyIndexesByClass(
  data: GameRecord | undefined,
  category: ArtifactCategory,
): Record<number, number[]> {
  const byClass: Record<number, Set<number>> = { [intangibleRestrictionCode]: new Set() };
  for (const stone of readEngravedConversionStones(data)) {
    if (stone.category !== category) continue;
    const classCode = stoneClassCodes[category][stone.equipClassCode];
    const propertyIndex = artifactPropertyIndex.get(stone.propertyId);
    if (classCode === undefined || propertyIndex === undefined) continue;
    (byClass[classCode] ??= new Set()).add(propertyIndex);
    byClass[intangibleRestrictionCode].add(propertyIndex);
  }
  return Object.fromEntries(Object.entries(byClass).map(([code, indexes]) => [Number(code), [...indexes]]));
}

/**
 * The stones usable on one equip class, for the verification script and for
 * anything asking the question about a single artifact rather than a matrix.
 */
export function ownedConversionPropertyIndexesFor(
  data: GameRecord | undefined,
  category: ArtifactCategory,
  equipClassCode: number,
): number[] {
  return ownedConversionPropertyIndexesByClass(data, category)[equipClassCode] ?? [];
}

/** Every current property any owned engraved stone names, for reporting a count. */
export function readOwnedEngravedConversionPropertyIndexes(data: GameRecord | undefined): number[] {
  const propertyIndexes = new Set<number>();
  for (const stone of readEngravedConversionStones(data)) {
    const propertyIndex = artifactPropertyIndex.get(stone.propertyId);
    if (propertyIndex !== undefined) propertyIndexes.add(propertyIndex);
  }
  return [...propertyIndexes];
}

function sourceMonsterIds(monsters: readonly GameRecord[], settings: ArtifactSettings): readonly string[] {
  const candidates = artifactOptimizationMonsters(monsters, settings);
  /* The catalogue has no account level to inspect. A Lv. 40 restriction is
     therefore necessarily an owned-roster calculation, even if the broader
     scope setting would otherwise use every species in the game. */
  return settings.onlyFactorInOwnedMonsters || settings.onlyLevel40Monsters
    ? ownMonsterSpeciesIds(candidates)
    : recordedArtifactPreferenceMonsterIds;
}

/**
 * Score matrices are indexed by species, never by an event-exclusive master id.
 * Keeping this tiny boundary explicit makes every caller — including a future
 * single-monster view — share the same identity contract.
 */
export function canonicalArtifactScoreMonsterIds(monsterIds: readonly string[]): string[] {
  return [...new Set(monsterIds.map(monsterSpeciesId))];
}

/** Builds two category-specific matrices so no artifact is compared with an ineligible element or archetype. */
export function buildArtifactScoreRequestsForMonsterIds(
  data: GameRecord | undefined,
  monsterIds: readonly string[],
  settings: ArtifactSettings,
  artifactIds?: ReadonlySet<string>,
): ArtifactScoreRequest[] {
  /* This is the public score-input boundary: a caller may hold an owned
     collaboration id, while every score matrix is a species matrix. Resolving
     here keeps the matrix ids identical to the ids every result lookup uses,
     and covers every present and future collaboration table entry at once. */
  const sourceIds = canonicalArtifactScoreMonsterIds(monsterIds);
  const artifacts = readArtifacts(data).filter((artifact) => artifactIds === undefined || artifactIds.has(artifact.id));
  const ownedConversionPropertyIndexes = readOwnedEngravedConversionPropertyIndexes(data);
  const conversionMode: 0 | 1 | 2 = settings.conversionStoneMode === 'none' ? 0
    : settings.conversionStoneMode === 'theoretical' ? 1 : 2;
  const conversionRollFractions = scoredArtifactProperties.map((property) =>
    artifactConversionRollFraction(property, settings.conversionStoneValue) ?? 0);
  const insignificantDifference = settings.ignoreInsignificantDifferences
    ? settings.insignificantDifference
    : 0;
  return (['attribute', 'type'] as const).map((category) => ({
    artifacts: artifacts
      .filter((artifact) => artifact.category === category)
      /* §17.7: one Intangible choice, made in Settings and honoured by every
         view, rather than a filter each page answers for itself. */
      .filter((artifact) => settings.includeIntangibleArtifacts || !artifact.intangible)
      .map(packArtifact),
    monsters: sourceIds.map((id) => packMonster(id, category)).filter((monster): monster is PackedMonsterScoreInput => monster !== undefined),
    acceptableWorth: settings.acceptableWorth,
    conversionMode,
    conversionRollFractions,
    insignificantDifference,
    ownedConversionPropertyIndexes,
    ownedConversionPropertyIndexesByClass: ownedConversionPropertyIndexesByClass(data, category),
  })).filter((request) => request.artifacts.length > 0 && request.monsters.length > 0);
}

/** Uses the configured account scope for recommendations that are not about one chosen monster. */
export function buildArtifactScoreRequests(
  data: GameRecord | undefined,
  monsters: readonly GameRecord[],
  settings: ArtifactSettings,
  artifactIds?: ReadonlySet<string>,
): ArtifactScoreRequest[] {
  return buildArtifactScoreRequestsForMonsterIds(data, sourceMonsterIds(monsters, settings), settings, artifactIds);
}
