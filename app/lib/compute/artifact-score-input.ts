import { defaultPropertyPreferences, recordedArtifactPreferenceMonsterIds } from '../artifact-preferences';
import { readArtifacts } from '../artifacts';
import { artifactProperty } from '../artifact-properties';
import type { Artifact, ArtifactSubProperty } from '../artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../artifact-properties';
import type { GameRecord } from '../game-data';
import { monsterPresentation } from '../monster-catalog';
import { elementName } from '../rune-sets';
import { artifactPropertyIndex, categoryCode, scoredArtifactProperties } from './artifact-score-schema';
import type { ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput } from './artifact-score-protocol';
import type { ArtifactSettings } from '../types';

const mainPropertyIndexes: Record<ArtifactMainProperty, 0 | 1 | 2> = { HP: 0, ATK: 1, DEF: 2 };
const archetypeCodes: Record<string, number> = { Attack: 1, Defense: 2, HP: 3, Support: 4 };

function preferenceCode(preference: 'preferred' | 'acceptable' | 'unwanted' | undefined): number {
  if (preference === 'preferred') return 2;
  return preference === 'acceptable' ? 1 : 0;
}

function masterIdElement(masterId: string): number {
  const lastDigit = Number(masterId.at(-1));
  return elementName(lastDigit) ? lastDigit : 0;
}

function artifactRestriction(artifact: Artifact): number {
  if (artifact.category === 'attribute') {
    const entry = Object.entries({ Water: 1, Fire: 2, Wind: 3, Light: 4, Dark: 5 })
      .find(([element]) => element === artifact.element);
    return entry ? entry[1] : 0;
  }
  return artifact.archetype ? archetypeCodes[artifact.archetype] ?? 0 : 0;
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

function packMonster(masterId: string, category: ArtifactCategory): PackedMonsterScoreInput | undefined {
  const preferences = defaultPropertyPreferences(masterId, category);
  if (!preferences) return undefined;
  const presentation = monsterPresentation(masterId);
  return {
    id: masterId,
    name: presentation.name,
    element: masterIdElement(masterId),
    archetype: presentation.archetype ? archetypeCodes[presentation.archetype] ?? 0 : 0,
    mainPreferences: [
      preferenceCode(preferences.main.HP), preferenceCode(preferences.main.ATK), preferenceCode(preferences.main.DEF),
    ],
    subPropertyPreferences: scoredArtifactProperties.map((property) => preferenceCode(preferences.sub.get(property.id))),
  };
}

function ownMonsterMasterIds(monsters: readonly GameRecord[]): string[] {
  const ids = new Set<string>();
  for (const monster of monsters) {
    const masterId = monster.unit_master_id;
    if ((typeof masterId === 'number' || typeof masterId === 'string') && String(masterId)) ids.add(String(masterId));
  }
  return [...ids];
}

/**
 * The game has not supplied a separate documented inventory schema for these
 * stones. A property id is useful only where it is one of the known current
 * artifact properties, so this reader accepts that narrow, independently
 * verifiable shape and ignores every other craft record rather than guessing.
 */
export function readOwnedEngravedConversionPropertyIndexes(data: GameRecord | undefined): number[] {
  const records = data?.rune_craft_item_list;
  if (!Array.isArray(records)) return [];
  const propertyIndexes = new Set<number>();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const candidate = (record as GameRecord).craft_type_id;
    const definition = artifactProperty(candidate);
    if (!definition || definition.status !== 'current') continue;
    const propertyIndex = artifactPropertyIndex.get(definition.id);
    if (propertyIndex !== undefined) propertyIndexes.add(propertyIndex);
  }
  return [...propertyIndexes];
}

function sourceMonsterIds(monsters: readonly GameRecord[], ownOnly: boolean): readonly string[] {
  return ownOnly ? ownMonsterMasterIds(monsters) : recordedArtifactPreferenceMonsterIds;
}

/** Builds two category-specific matrices so no artifact is compared with an ineligible element or archetype. */
export function buildArtifactScoreRequestsForMonsterIds(
  data: GameRecord | undefined,
  monsterIds: readonly string[],
  settings: ArtifactSettings,
): ArtifactScoreRequest[] {
  const sourceIds = [...new Set(monsterIds)];
  const artifacts = readArtifacts(data);
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
): ArtifactScoreRequest[] {
  return buildArtifactScoreRequestsForMonsterIds(data, sourceMonsterIds(monsters, settings.onlyFactorInOwnedMonsters), settings);
}
