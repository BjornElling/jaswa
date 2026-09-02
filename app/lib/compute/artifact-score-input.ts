import { defaultPropertyPreferences, recordedArtifactPreferenceMonsterIds } from '../artifact-preferences';
import { readArtifacts } from '../artifacts';
import { artifactProperty } from '../artifact-properties';
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
function artifactRestriction(artifact: Artifact): number {
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
  };
}

/* Scores describe a monster, not a copy of one, so both callers below pass a
   species id and the name shown is the species name — a collaboration pair
   appears once, under both of its names, rather than twice under one each. */
function packMonster(speciesId: string, category: ArtifactCategory): PackedMonsterScoreInput | undefined {
  const preferences = defaultPropertyPreferences(speciesId, category);
  if (!preferences) return undefined;
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

/* Engraved conversion stones use craft type 6. Their `craft_type_id` is the
   game's item id, not the artifact effect id: the final four digits hold the
   effect plus 600, so both 140814 and 220815 name effects 214 and 215. The
   prefix varies with the stone, while the suffix makes the usable property
   explicit and keeps ordinary rune craft items out of this calculation. */
const engravedConversionStoneCraftType = 6;
const engravedConversionStoneEffectOffset = 600;
const engravedConversionStoneEffectDigits = 10_000;

function integerValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Reads the current artifact properties named by owned engraved stones. */
export function readOwnedEngravedConversionPropertyIndexes(data: GameRecord | undefined): number[] {
  const records = data?.rune_craft_item_list;
  if (!Array.isArray(records)) return [];
  const propertyIndexes = new Set<number>();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const craft = record as GameRecord;
    if (integerValue(craft.craft_type) !== engravedConversionStoneCraftType) continue;
    const craftTypeId = integerValue(craft.craft_type_id);
    if (craftTypeId === undefined) continue;
    const definition = artifactProperty(
      (craftTypeId % engravedConversionStoneEffectDigits) - engravedConversionStoneEffectOffset,
    );
    if (!definition || definition.status !== 'current') continue;
    const propertyIndex = artifactPropertyIndex.get(definition.id);
    if (propertyIndex !== undefined) propertyIndexes.add(propertyIndex);
  }
  return [...propertyIndexes];
}

function sourceMonsterIds(monsters: readonly GameRecord[], ownOnly: boolean): readonly string[] {
  return ownOnly ? ownMonsterSpeciesIds(monsters) : recordedArtifactPreferenceMonsterIds;
}

/** Builds two category-specific matrices so no artifact is compared with an ineligible element or archetype. */
export function buildArtifactScoreRequestsForMonsterIds(
  data: GameRecord | undefined,
  monsterIds: readonly string[],
  settings: ArtifactSettings,
  artifactIds?: ReadonlySet<string>,
): ArtifactScoreRequest[] {
  const sourceIds = [...new Set(monsterIds)];
  const artifacts = readArtifacts(data).filter((artifact) => artifactIds === undefined || artifactIds.has(artifact.id));
  const ownedConversionPropertyIndexes = readOwnedEngravedConversionPropertyIndexes(data);
  const conversionMode: 0 | 1 | 2 = settings.conversionStoneMode === 'none' ? 0
    : settings.conversionStoneMode === 'theoretical' ? 1 : 2;
  const conversionValue = [0, 0.5, 0.75, 1][settings.conversionStoneValue - 1] ?? 0;
  return (['attribute', 'type'] as const).map((category) => ({
    artifacts: artifacts.filter((artifact) => artifact.category === category).map(packArtifact),
    monsters: sourceIds.map((id) => packMonster(id, category)).filter((monster): monster is PackedMonsterScoreInput => monster !== undefined),
    acceptableWorth: settings.acceptableWorth,
    conversionMode,
    conversionValue,
    ownedConversionPropertyIndexes,
  })).filter((request) => request.artifacts.length > 0 && request.monsters.length > 0);
}

/** Uses the configured account scope for recommendations that are not about one chosen monster. */
export function buildArtifactScoreRequests(
  data: GameRecord | undefined,
  monsters: readonly GameRecord[],
  settings: ArtifactSettings,
  artifactIds?: ReadonlySet<string>,
): ArtifactScoreRequest[] {
  return buildArtifactScoreRequestsForMonsterIds(data, sourceMonsterIds(monsters, settings.onlyFactorInOwnedMonsters), settings, artifactIds);
}
