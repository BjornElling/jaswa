import { artifactPreferenceStatus, defaultPropertyPreferences, recordedArtifactPreferenceMonsterIds } from '../artifact-preferences';
import { readArtifacts } from '../artifacts';
import { readEngravedConversionStones } from '../artifact-conversion-stones';
import { artifactConversionRollFraction } from '../artifact-properties';
import { artifactLineMaxRolls } from '../artifact-optimal-value';
import type { Artifact, ArtifactSubProperty } from '../artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../artifact-properties';
import type { GameRecord } from '../game-data';
import type { MonsterCopyPreferences, MonsterPreferences } from '../monster-preferences';
import { monsterSpeciesPresentation } from '../monster-catalog';
import { monsterSpeciesId } from '../monster-identity';
import { elementName } from '../rune-sets';
import { artifactPropertyIndex, categoryCode, scoredArtifactProperties } from './artifact-score-schema';
import { artifactFitsClassCodes, intangibleRestrictionCode } from './artifact-score-protocol';
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

/**
 * The equip rule (§1) for an artifact and one monster species, named rather
 * than packed. The rule itself is `artifactFitsClassCodes`; this reads the four
 * codes out of an artifact object and a species id, so a caller holding those
 * rather than packed inputs asks the same question the scorer asks.
 */
export function artifactFitsMonster(artifact: Artifact, speciesId: string): boolean {
  const presentation = monsterSpeciesPresentation(speciesId);
  return artifactFitsClassCodes(
    categoryCode(artifact.category),
    artifactRestriction(artifact),
    masterIdElement(speciesId),
    presentation.archetype ? archetypeCodes[presentation.archetype] ?? 0 : 0,
  );
}

/* The line's worth in max-roll points, from the one definition of that in
   `artifactLineMaxRolls`, so the packed scorer and the per-artifact reader
   cannot come to different numbers for the same line. */
function rollPoints(subProperty: ArtifactSubProperty): number {
  if (subProperty.maximumHundredths === null || subProperty.maximumHundredths <= 0) return 0;
  return artifactLineMaxRolls(subProperty.valueHundredths, subProperty.maximumHundredths);
}

/* A legacy line whose value cannot be read is `-1` rather than `0`: zero is a
   real roll of nothing and would clear a floor of zero, where the point of the
   marker is that this line cannot be compared against a floor at all. */
function valueHundredths(subProperty: ArtifactSubProperty): number {
  return subProperty.maximumHundredths === null ? -1 : subProperty.valueHundredths;
}

function packArtifact(artifact: Artifact): PackedArtifactScoreInput {
  const indexes = artifact.subProperties.map((subProperty) => artifactPropertyIndex.get(subProperty.definition.id) ?? -1);
  const points = artifact.subProperties.map(rollPoints);
  const values = artifact.subProperties.map(valueHundredths);
  return {
    id: artifact.id,
    category: categoryCode(artifact.category),
    restriction: artifactRestriction(artifact),
    mainProperty: mainPropertyIndexes[artifact.mainProperty],
    convertedPropertyIndex: artifact.convertedPropertyIndex ?? -1,
    subPropertyIndexes: [indexes[0], indexes[1], indexes[2], indexes[3]],
    subPropertyRollPoints: [points[0], points[1], points[2], points[3]],
    subPropertyValueHundredths: [values[0], values[1], values[2], values[3]],
  };
}


/* Scores describe a monster, not a copy of one, so a species id is the default
   key and the name shown is the species name — a collaboration pair appears
   once, under both of its names, rather than twice under one each. A copy that
   states preferences of its own is the exception, and `packStatedCopy` below
   is where it gets a row. */
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
    subPropertyMinimums: scoredArtifactProperties.map(() => 0),
    subPropertyShares: scoredArtifactProperties.map((property) => preferences.subShares.get(property.id) ?? 0),
  };
}

/**
 * One owned copy's own row, where its owner has stated what it is for.
 *
 * The user's answers replace the statistics rather than blending with them
 * (§19.4): a stated list of mains is the whole list of mains, and a stated list
 * of substats is the whole list. Where they stated nothing about a half, that
 * half falls back on the species defaults — which is why the species row is
 * read first and then overwritten in place.
 *
 * The copy inherits the *species'* element and archetype. Those are facts about
 * the monster rather than preferences about the copy, and an artifact's equip
 * rule is checked against them, so taking them from anywhere else would let a
 * copy be offered artifacts it cannot wear.
 */
function packStatedCopy(
  unitId: string,
  speciesId: string,
  category: ArtifactCategory,
  stated: MonsterCopyPreferences,
): PackedMonsterScoreInput | undefined {
  const species = packMonster(speciesId, category);
  if (!species) return undefined;
  const wishes = stated.artifacts?.[category];
  if (!wishes || (wishes.main === undefined && wishes.sub === undefined)) return undefined;

  const mains = wishes.main;
  const subs = wishes.sub;
  return {
    ...species,
    id: unitId,
    ownerUnitId: unitId,
    name: stated.label && stated.label.length > 0 ? stated.label : species.name,
    /* A stated list is exhaustive: a main the user did not name is one they do
       not want, which is `unwanted`, not `acceptable`. Every named main is
       preferred — the user drew no ranking, so the scorer must not invent one. */
    mainPreferences: mains === undefined
      ? species.mainPreferences
      : [
        mains.includes('HP') ? 2 : 0,
        mains.includes('ATK') ? 2 : 0,
        mains.includes('DEF') ? 2 : 0,
      ],
    subPropertyPreferences: subs === undefined
      ? species.subPropertyPreferences
      : scoredArtifactProperties.map((property) => (subs[String(property.id)] === undefined ? 0 : 2)),
    subPropertyMinimums: subs === undefined
      ? species.subPropertyMinimums
      : scoredArtifactProperties.map((property) => subs[String(property.id)]?.minimumHundredths ?? 0),
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
 * pooled. There is deliberately no entry for `intangibleRestrictionCode`: an
 * Intangible artifact cannot be converted at all (§10.1), so it never asks
 * which stones would fit it.
 */
export function ownedConversionPropertyIndexesByClass(
  data: GameRecord | undefined,
  category: ArtifactCategory,
): Record<number, number[]> {
  const byClass: Record<number, Set<number>> = {};
  for (const stone of readEngravedConversionStones(data)) {
    if (stone.category !== category) continue;
    const classCode = stoneClassCodes[category][stone.equipClassCode];
    const propertyIndex = artifactPropertyIndex.get(stone.propertyId);
    if (classCode === undefined || propertyIndex === undefined) continue;
    (byClass[classCode] ??= new Set()).add(propertyIndex);
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

/**
 * The owned copies that state artifact preferences of their own, paired with
 * the species whose defaults stand behind them.
 *
 * A copy earns a row only where it actually disagrees with its species. A
 * record holding just a label, or just stat targets, says nothing about
 * artifacts, so giving it a row would add a duplicate of the species row and
 * make a collaboration pair rank twice for no gain.
 */
function statedCopyRows(
  data: GameRecord | undefined,
  monsterPreferences: MonsterPreferences,
  category: ArtifactCategory,
): PackedMonsterScoreInput[] {
  const roster = Array.isArray(data?.unit_list) ? data.unit_list : [];
  const rows: PackedMonsterScoreInput[] = [];
  for (const record of roster) {
    const monster = record as GameRecord | null;
    if (!monster) continue;
    const unitId = String(monster.unit_id);
    const stated = monsterPreferences[unitId];
    if (!stated) continue;
    const speciesId = monsterSpeciesId(String(monster.unit_master_id));
    const row = packStatedCopy(unitId, speciesId, category, stated);
    if (row) rows.push(row);
  }
  return rows;
}

/** Builds two category-specific matrices so no artifact is compared with an ineligible element or archetype. */
export function buildArtifactScoreRequestsForMonsterIds(
  data: GameRecord | undefined,
  monsterIds: readonly string[],
  settings: ArtifactSettings,
  artifactIds?: ReadonlySet<string>,
  monsterPreferences: MonsterPreferences = {},
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
    /* The species rows, then the rows of the copies that disagree with them.
       Both are scored: a copy with its own answers is ranked against those, and
       every copy that stated nothing still answers to its species. */
    monsters: [
      ...sourceIds.map((id) => packMonster(id, category))
        .filter((monster): monster is PackedMonsterScoreInput => monster !== undefined),
      ...statedCopyRows(data, monsterPreferences, category),
    ],
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
  monsterPreferences: MonsterPreferences = {},
): ArtifactScoreRequest[] {
  return buildArtifactScoreRequestsForMonsterIds(
    data, sourceMonsterIds(monsters, settings), settings, artifactIds, monsterPreferences,
  );
}
