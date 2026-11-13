import { artifactPreferenceStatus, defaultPropertyPreferences, recordedArtifactPreferenceMonsterIds } from '../../profiles/artifact-preferences';
import { readArtifacts } from '../artifacts';
import { readEngravedConversionStones } from '../artifact-conversion-stones';
import { artifactArchetypes, artifactConversionRollFraction, artifactElements } from '../artifact-properties';
import { artifactLineMaxRolls } from '../artifact-optimal-value';
import type { Artifact, ArtifactSubProperty } from '../artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../artifact-properties';
import type { GameRecord } from '../../account/game-record';
import { copyArtifactMainBands, honouredMainStat } from '../../combat/main-stat-model';
import { canEngraveArtifacts } from '../../monsters/monster-engrave-eligibility';
import type { MonsterCopyPreferences, MonsterProfiles } from '../../profiles/monster-preferences';
import { statedAnswer, statedBand } from '../../profiles/monster-preferences';
import { monsterSpeciesPresentation } from '../../monsters/monster-catalog';
import { monsterSpeciesId } from '../../monsters/monster-identity';
import { labelledMonsterName, monsterCopyNames } from '../../monsters/monster-names';
import { elementName } from '../../runes/rune-sets';
import { artifactPropertyFamilyIndex, artifactPropertyIndex, categoryCode, scoredArtifactProperties } from './artifact-score-schema';
import { artifactFitsClassCodes, artifactScoreRow, intangibleRestrictionCode } from './artifact-score-protocol';
import type { ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput } from './artifact-score-protocol';
import type { ArtifactSettings } from '../../model';
import { artifactOptimizationMonsters } from '../artifact-optimization-monsters';

const mainPropertyIndexes: Record<ArtifactMainProperty, 0 | 1 | 2> = { HP: 0, ATK: 1, DEF: 2 };
/* The export's own class codes, read back from the tables `readArtifact` names
   them with, so an artifact's class, a monster's and a stone's are compared on
   the one numbering the game uses and no second copy of it can drift. */
function codesByName(names: Record<number, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(names).map(([code, name]) => [name, Number(code)]));
}
const archetypeCodes = codesByName(artifactArchetypes);
const elementCodes = codesByName(artifactElements);

function preferenceCode(preference: 'preferred' | 'acceptable' | 'unwanted' | undefined): number {
  if (preference === 'preferred') return 2;
  return preference === 'acceptable' ? 1 : 0;
}

function masterIdElement(masterId: string): number {
  const lastDigit = Number(masterId.at(-1));
  return elementName(lastDigit) ? lastDigit : 0;
}

/**
 * The engrave class as a comparison code, or `intangibleRestrictionCode` for an
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
  /* Unreachable for an artifact from `readArtifact`. Failing is the only safe
     answer if it is ever reached: the wildcard would let the artifact fit every
     monster, a mismatch would hide it from every one, and either is a wrong
     ranking nobody would see. */
  if (code === undefined) throw new Error(`Artifact ${artifact.id} names no engrave class JASWA knows.`);
  return code;
}

/**
 * The engrave rule (§1) for an artifact and one monster species, named rather
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

function packArtifact(artifact: Artifact): PackedArtifactScoreInput {
  const indexes = artifact.subProperties.map((subProperty) => artifactPropertyIndex.get(subProperty.definition.id) ?? -1);
  const families = artifact.subProperties.map((subProperty) => artifactPropertyFamilyIndex.get(subProperty.definition.id) ?? -1);
  const points = artifact.subProperties.map(rollPoints);
  return {
    id: artifact.id,
    category: categoryCode(artifact.category),
    restriction: artifactRestriction(artifact),
    mainProperty: mainPropertyIndexes[artifact.mainProperty],
    convertedPropertyIndex: artifact.convertedPropertyIndex ?? -1,
    subPropertyIndexes: [indexes[0], indexes[1], indexes[2], indexes[3]],
    subPropertyFamilyIndexes: [families[0], families[1], families[2], families[3]],
    subPropertyRollPoints: [points[0], points[1], points[2], points[3]],
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
    subPropertyShares: scoredArtifactProperties.map((property) => preferences.subShares.get(property.id) ?? 0),
  };
}

/**
 * One owned copy's own row, where it wants something its species does not.
 *
 * That is so in two ways. Its owner may have stated what it is for, and the
 * user's answers replace the statistics rather than blending with them (§19.4):
 * a stated list of mains is the whole list of mains, and a stated list of
 * substats is the whole list. Or the main-stat model may read this copy's own
 * runes differently from its species' statistics
 * (`main-stat-model.ts`), and a copy built for HP is ranked as one. Where the
 * row would repeat the species row exactly, there is none.
 *
 * The copy inherits the *species'* element and archetype. Those are facts about
 * the monster rather than preferences about the copy, and an artifact's engrave
 * rule is checked against them, so taking them from anywhere else would let a
 * copy be offered artifacts it cannot take.
 */
function packCopy(
  monster: GameRecord,
  speciesId: string,
  category: ArtifactCategory,
  stated: MonsterCopyPreferences | undefined,
  name: string | undefined,
): PackedMonsterScoreInput | undefined {
  const species = packMonster(speciesId, category);
  if (!species) return undefined;
  const unitId = String(monster.unit_id);
  const mains = copyArtifactMainBands(monster, stated);
  const subs = statedAnswer(stated?.artifacts?.sub?.[category]);
  /* The user's two bands are the scorer's two bands, and an option in neither
     is unwanted — `copyArtifactMainBands` and `statedBand` are the readings of
     that, shared with the per-artifact reader. */
  const mainPreferences: readonly [number, number, number] = mains === undefined
    ? species.mainPreferences
    : [preferenceCode(mains.HP), preferenceCode(mains.ATK), preferenceCode(mains.DEF)];
  const ownMains = mainPreferences.some((code, at) => code !== species.mainPreferences[at]);
  if (honouredMainStat(stated) === undefined && subs === undefined && !ownMains) return undefined;

  return {
    ...species,
    id: unitId,
    ownerUnitId: unitId,
    /* The copy's own name, numbered as every table numbers it, so its row and
       its species' row can be told apart in one ranking. */
    name: name ?? labelledMonsterName(species.name, stated?.label),
    mainPreferences,
    subPropertyPreferences: subs === undefined
      ? species.subPropertyPreferences
      : scoredArtifactProperties.map((property) => preferenceCode(statedBand(subs, property.id))),
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

/* Attribute stones name an element and type stones an archetype, on the same
   numbering the artifacts themselves use, so a stone's class code is the score
   protocol's restriction code as it stands; only a code naming no class is
   left out. */
function stoneClassCode(category: ArtifactCategory, code: number): number | undefined {
  const names: Record<number, string> = category === 'attribute' ? artifactElements : artifactArchetypes;
  return names[code] === undefined ? undefined : code;
}

/**
 * The engraved stones usable on each engrave class of one category, as compact
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
    const classCode = stoneClassCode(category, stone.engraveClassCode);
    const propertyIndex = artifactPropertyIndex.get(stone.propertyId);
    if (classCode === undefined || propertyIndex === undefined) continue;
    (byClass[classCode] ??= new Set()).add(propertyIndex);
  }
  return Object.fromEntries(Object.entries(byClass).map(([code, indexes]) => [Number(code), [...indexes]]));
}

/**
 * The stones usable on one engrave class, for the verification script and for
 * anything asking the question about a single artifact rather than a matrix.
 */
export function ownedConversionPropertyIndexesFor(
  data: GameRecord | undefined,
  category: ArtifactCategory,
  engraveClassCode: number,
): number[] {
  return ownedConversionPropertyIndexesByClass(data, category)[engraveClassCode] ?? [];
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
 * The owned copies that want something their species does not, paired with the
 * species whose defaults stand behind them.
 *
 * A copy earns a row only where it actually disagrees with its species. A
 * record holding just a label says nothing about artifacts, and a copy whose
 * runes the model reads as its species' statistics wants what they want, so
 * giving either a row would add a duplicate of the species row and make a
 * collaboration pair rank twice for no gain.
 */
function copyRows(
  data: GameRecord | undefined,
  speciesIds: ReadonlySet<string>,
  monsterPreferences: MonsterProfiles,
  category: ArtifactCategory,
): PackedMonsterScoreInput[] {
  const roster = (Array.isArray(data?.unit_list) ? data.unit_list : [])
    .filter((record): record is GameRecord => Boolean(record) && typeof record === 'object');
  /* The roster is the export's, which is Scenario, so the profiles are Scenario's:
     every artifact page plans Scenario (`DECK-PRESETS.md` §5). */
  const names = monsterCopyNames(roster, monsterPreferences);
  const rows: PackedMonsterScoreInput[] = [];
  for (const monster of roster) {
    if (monster.unit_id === undefined || monster.unit_id === null || !canEngraveArtifacts(monster)) continue;
    const stated = monsterPreferences[String(monster.unit_id)];
    const speciesId = monsterSpeciesId(String(monster.unit_master_id));
    /* A copy's row stands beside its species' row, so a species the request
       leaves out takes its copies with it. */
    if (!speciesIds.has(speciesId)) continue;
    const row = packCopy(monster, speciesId, category, stated, names[String(monster.unit_id)]?.name);
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
  monsterPreferences: MonsterProfiles = {},
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
    artifactConversionRollFraction(property, settings.conversionRoll) ?? 0);
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
       every copy that wants what its species wants still answers to it. */
    monsters: [
      ...sourceIds.map((id) => packMonster(id, category))
        .filter((monster): monster is PackedMonsterScoreInput => monster !== undefined),
      ...copyRows(data, new Set(sourceIds), monsterPreferences, category),
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
  monsterPreferences: MonsterProfiles = {},
): ArtifactScoreRequest[] {
  return buildArtifactScoreRequestsForMonsterIds(
    data, sourceMonsterIds(monsters, settings), settings, artifactIds, monsterPreferences,
  );
}

/**
 * The requests for one owned copy alone: each holds the one row that copy is
 * scored under, so a request's maximum over its monsters is that copy's score.
 */
export function buildArtifactScoreRequestsForCopy(
  data: GameRecord | undefined,
  unitId: string,
  masterId: string,
  settings: ArtifactSettings,
  monsterPreferences: MonsterProfiles = {},
): ArtifactScoreRequest[] {
  const speciesId = monsterSpeciesId(masterId);
  return buildArtifactScoreRequestsForMonsterIds(data, [speciesId], settings, undefined, monsterPreferences)
    .map((request) => {
      const row = artifactScoreRow(request, speciesId, unitId);
      return { ...request, monsters: row === undefined ? [] : [row] };
    })
    .filter((request) => request.monsters.length > 0);
}
