import type { GameRecord } from './game-data';
import type { MonsterArchetype } from './monster-catalog';
import {
  artifactArchetypes, artifactCategoryFromType, artifactElements, artifactGradeFromRank,
  artifactGrades, artifactMainProperties, artifactProperty,
} from './artifact-properties';
import type {
  ArtifactCategory, ArtifactGrade, ArtifactMainProperty, ArtifactPropertyDefinition,
} from './artifact-properties';

export type ArtifactSubProperty = {
  definition: ArtifactPropertyDefinition;
  /** Hundredths of a percentage point, so `0.2 %` is 20 and comparisons are exact. */
  valueHundredths: number;
  powerUps: number;
  /** The ceiling this line could have reached, or `null` for a legacy property. */
  maximumHundredths: number | null;
};

export type Artifact = {
  id: string;
  category: ArtifactCategory;
  /** The element or monster type it may be equipped to; `null` when unrecognised. */
  element: string | null;
  archetype: MonsterArchetype | null;
  mainProperty: ArtifactMainProperty;
  mainValue: number;
  grade: ArtifactGrade;
  subProperties: ArtifactSubProperty[];
  /** The zero-based sub-property position permanently bound to conversion. */
  convertedPropertyIndex: number | null;
  /** The wearer's `unit_id`, or `null` when the artifact sits in the inventory. */
  occupiedId: string | null;
  locked: boolean;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Percentages arrive as decimals and one of them — `Additional Damage by HP` —
 * arrives with float error already in it, `0.6000000000000001` appearing in the
 * real export. Rounding to hundredths of a point on read is what makes these
 * values comparable at all (`ARTIFACT-CANONICAL.md` §9).
 */
function toHundredths(value: number): number {
  return Math.round(value * 100);
}

/**
 * A line's contributions are its power-ups plus one for the line itself. The
 * export marks an un-upgraded line in position 4 of the tuple, and counting
 * that mark as a contribution is what makes the grade invariant hold: without
 * it 44 of the user's 1,864 artifacts appear to break §15.3's rule, and with it
 * only one does. The meaning of the flag is still unverified (§15.7), so this
 * reads it as evidence about the roll structure and nothing more.
 */
function contributions(powerUps: number, newestLine: boolean): number {
  return powerUps + (newestLine ? 1 : 0) + 1;
}

function readSubProperty(entry: unknown, category: ArtifactCategory, grade: ArtifactGrade): ArtifactSubProperty | null {
  if (!Array.isArray(entry)) return null;
  const definition = artifactProperty(entry[0]);
  const value = numberOrNull(entry[1]);
  const powerUps = numberOrNull(entry[2]);
  if (!definition || value === null || powerUps === null || powerUps < 0) return null;
  /* §5's category split is absolute in the export, so a property on the wrong
     category is a corrupt record rather than a surprise to accommodate. */
  if (definition.availability !== 'both' && definition.availability !== category) return null;

  /* A line cannot have collected more contributions than its grade ever
     granted, so a record claiming otherwise is corrupt rather than exceptional
     — and accepting it would compute a ceiling no artifact of that grade can
     reach, quietly making a good roll look poor. */
  const lineContributions = contributions(powerUps, Boolean(numberOrNull(entry[4])));
  if (lineContributions > artifactGrades[grade].maxContributions) return null;
  /* A displayed line must be a reachable sum of this slot's rolls. Rounding is
     deliberately limited to the export's known float noise; accepting a value
     such as 0.251 % as 0.25 % would quietly repair malformed user data. */
  const valueHundredths = toHundredths(value);
  if (Math.abs(value * 100 - valueHundredths) > 0.000001) return null;
  if (definition.minRoll !== null && definition.maxRoll !== null) {
    const minimumHundredths = toHundredths(definition.minRoll * lineContributions);
    const maximumHundredths = toHundredths(definition.maxRoll * lineContributions);
    if (valueHundredths < minimumHundredths || valueHundredths > maximumHundredths) return null;
  }
  return {
    definition,
    valueHundredths,
    powerUps,
    /* The ceiling is what this line could hold given the contributions it
       actually collected, not the grade's best case: a line that received one
       roll cannot reach the four-roll maximum, and judging it against that
       would call every ordinary line a poor one. The grade still bounds it —
       `artifactPropertyMaximum` is the same arithmetic at the grade's limit. */
    maximumHundredths: definition.maxRoll === null
      ? null
      : toHundredths(definition.maxRoll * lineContributions),
  };
}

/**
 * One artifact from the export, or `null` when the record does not satisfy the
 * current contract. Malformed records are rejected rather than repaired
 * (`AGENTS.md` §0), because a partly-read artifact would be judged as though it
 * were whole.
 */
export function readArtifact(record: unknown): Artifact | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const source = record as GameRecord;

  const category = artifactCategoryFromType[numberOrNull(source.type) ?? -1];
  const grade = artifactGradeFromRank(source.natural_rank);
  const id = numberOrNull(source.rid);
  if (!category || !grade || id === null) return null;

  const primary = source.pri_effect;
  if (!Array.isArray(primary)) return null;
  const mainProperty = artifactMainProperties[numberOrNull(primary[0]) ?? -1];
  const mainValue = numberOrNull(primary[1]);
  if (!mainProperty || mainValue === null) return null;

  const secondary = source.sec_effects;
  if (!Array.isArray(secondary) || secondary.length !== 4) return null;
  const subProperties: ArtifactSubProperty[] = [];
  let convertedPropertyIndex: number | null = null;
  for (const [index, entry] of secondary.entries()) {
    /* The conversion flag identifies the line's permanent conversion slot.
       Its magnitude is not part of the model yet, but a malformed flag must
       not quietly become an unconverted artifact. */
    const conversionFlag = numberOrNull(Array.isArray(entry) ? entry[3] : null);
    if (conversionFlag === null || !Number.isInteger(conversionFlag) || conversionFlag < 0) return null;
    if (conversionFlag > 0) {
      if (convertedPropertyIndex !== null) return null;
      convertedPropertyIndex = index;
    }
    const subProperty = readSubProperty(entry, category, grade);
    if (!subProperty) return null;
    subProperties.push(subProperty);
  }
  /* §4: the same property never appears twice on one artifact. */
  if (new Set(subProperties.map((property) => property.definition.id)).size !== subProperties.length) return null;
  /* The export's grade invariant is exact: it is the only trustworthy check
     that a record has not redistributed or invented a power-up while still
     making each line look individually plausible. */
  if (subProperties.reduce((total, property) => total + property.powerUps, 0) !== artifactGrades[grade].naturalRank - 1) return null;

  const occupied = numberOrNull(source.occupied_id);
  return {
    id: String(id),
    category,
    element: category === 'attribute' ? artifactElements[numberOrNull(source.attribute) ?? -1] ?? null : null,
    archetype: category === 'type' ? artifactArchetypes[numberOrNull(source.unit_style) ?? -1] ?? null : null,
    mainProperty,
    mainValue,
    grade,
    subProperties,
    convertedPropertyIndex,
    occupiedId: occupied === null || occupied === 0 ? null : String(occupied),
    locked: Boolean(numberOrNull(source.locked)),
  };
}

/**
 * Every artifact on the account. `completeEquipmentCollections` has already
 * merged the equipped ones into `data.artifacts` and de-duplicated them on
 * `rid`, so this reads that one list rather than walking the roster again.
 */
export function readArtifacts(data: GameRecord | undefined): Artifact[] {
  const records = data?.artifacts;
  if (!Array.isArray(records)) return [];
  const artifacts: Artifact[] = [];
  for (const record of records) {
    const artifact = readArtifact(record);
    if (artifact) artifacts.push(artifact);
  }
  return artifacts;
}
