import type { GameRecord } from './game-data';
import type { MonsterArchetype } from './monster-catalog';
import {
  artifactArchetypes, artifactCategoryFromType, artifactElements, artifactGradeFromRank,
  artifactGrades, artifactIntangibleEquipClass, artifactMainProperties, artifactProperty,
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
  /**
   * The element or monster type it may be equipped to. `null` on an Intangible
   * artifact, which names no single class because it matches every one of them
   * — read `intangible` rather than testing these for absence, and never treat
   * `null` as "unknown".
   */
  element: string | null;
  archetype: MonsterArchetype | null;
  /**
   * Whether this artifact may be equipped to any element (attribute category)
   * or any monster type (type category). The game calls it Intangible and
   * `artifactIntangibleEquipClass` records the code and the evidence. The
   * category slot still binds; only the class within it is open.
   */
  intangible: boolean;
  /**
   * Which of HP/ATK/DEF the main property grants — never how much. The main
   * value is read during import only to reject a malformed record; it is
   * deliberately not part of the model, because no view may show it and no
   * calculation depends on it.
   */
  mainProperty: ArtifactMainProperty;
  grade: ArtifactGrade;
  subProperties: ArtifactSubProperty[];
  /** The zero-based sub-property position permanently bound to conversion. */
  convertedPropertyIndex: number | null;
  /** The wearer's `unit_id`, or `null` when the artifact sits in the inventory. */
  occupiedId: string | null;
  locked: boolean;
  /** Pre-v8 artifacts below +15 still need the game's one-time Refine action. */
  unrefined: boolean;
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

function readSubProperty(
  entry: unknown,
  category: ArtifactCategory,
  grade: ArtifactGrade,
  rollModel: 'current' | 'historical',
  historicalMaximumHundredths: number | null,
): ArtifactSubProperty | null {
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
  if (rollModel === 'current' && definition.minRoll !== null && definition.maxRoll !== null) {
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
    maximumHundredths: rollModel === 'historical'
      ? historicalMaximumHundredths
      : definition.maxRoll === null
        ? historicalMaximumHundredths
      : toHundredths(definition.maxRoll * lineContributions),
  };
}

/* v8's late-June 2023 artifact update retired manual power-ups. A date before
   the following month can therefore name a real pre-v8 artifact whose stored
   rolls are incomplete. The cutoff is deliberately conservative: a malformed
   current artifact is still rejected instead of being reinterpreted. */
const artifactPowerUpRemoval = Date.UTC(2023, 6, 1);
/* v6.2.0, which raised initial and power-up values. The account confirms the
   date rather than merely inheriting it: every single-roll line that falls
   below today's floor — 206 at 3, 406 at 3, 210 at 1 — sits on an artifact
   acquired before it, and none after. Those 28 artifacts are exactly the set
   carrying no power-ups at all, so the pre-v6.2 cohort and the unrefined
   cohort are the same 28 records. */
const artifactPropertyImprovement = Date.UTC(2021, 0, 28);

function hasHistoricalRollModel(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && Date.parse(value) < artifactPowerUpRemoval;
}

/* The v6.0 launch table, the v6.2 improvement notice and the preserved values
   in the export agree that pre-v8 records use a five-roll ceiling. Some old
   property ids disappeared later, so their ceilings belong here instead of
   being guessed from today's drop pool. Values are percentage points.

   206 and 226 follow the corrected names: 206 is SPD UP Effect (4-6, so 30)
   and 226 the merged ATK/DEF UP Effect (3-5, so 25). The account shows why the
   two are not interchangeable — 204 and 205 stop dead at v8 (90 and 42 lines
   before, none after) while 226 begins there (none before, 223 after), so 226
   is the merger of those two halves, and 206 spans both eras untouched. */
function historicalPropertyMaximum(definition: ArtifactPropertyDefinition, dateAdded: unknown): number | null {
  const timestamp = typeof dateAdded === 'string' ? Date.parse(dateAdded) : Number.NaN;
  const improved = Number.isFinite(timestamp) && timestamp >= artifactPropertyImprovement;
  const maxima: Record<number, number> = {
    200: improved ? 70 : 30, 201: improved ? 70 : 30, 202: improved ? 70 : 30,
    203: 30, 204: improved ? 25 : 20, 205: improved ? 25 : 20,
    207: 30, 208: 15, 209: 20, 211: 30, 213: 15,
    216: improved ? 30 : 15, 217: improved ? 30 : 15,
    402: 30, 403: 30,
    206: 30, 210: improved ? 20 : 15, 214: improved ? 20 : 15,
    215: improved ? 40 : 15, 218: 1.5, 219: 20, 220: 20, 221: 200,
    222: 30, 223: 60, 224: 20, 225: 20, 226: 25,
    300: improved ? 25 : 20, 301: improved ? 25 : 20, 302: improved ? 25 : 20,
    303: improved ? 25 : 20, 304: improved ? 25 : 20,
    305: 30, 306: 30, 307: 30, 308: 30, 309: 30,
    400: 30, 401: 30, 404: 30, 405: 30, 406: 30, 407: 30, 408: 30, 409: 30,
    410: 30, 411: 30,
  };
  const maximum = maxima[definition.id];
  return maximum === undefined ? null : toHundredths(maximum);
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
  /* The magnitude is checked and then dropped: a record without a readable main
     value is malformed and must fail loudly, but the number itself is never
     carried into the model — see the `mainProperty` note on `Artifact`. */
  if (!mainProperty || numberOrNull(primary[1]) === null) return null;

  const secondary = source.sec_effects;
  if (!Array.isArray(secondary) || secondary.length !== 4) return null;
  const historicalMaximum = (definition: ArtifactPropertyDefinition) => hasHistoricalRollModel(source.date_add)
    ? historicalPropertyMaximum(definition, source.date_add)
    : null;
  const currentSubProperties: ArtifactSubProperty[] = [];
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
    const definition = artifactProperty(Array.isArray(entry) ? entry[0] : null);
    const subProperty = readSubProperty(entry, category, grade, 'current', definition ? historicalMaximum(definition) : null);
    if (subProperty) currentSubProperties.push(subProperty);
  }
  const currentRollModel = currentSubProperties.length === secondary.length
    && new Set(currentSubProperties.map((property) => property.definition.id)).size === currentSubProperties.length
    /* The export's grade invariant is exact for v8-era artifacts: it is the
       only trustworthy check that a record has not redistributed or invented
       a power-up while still making each line look individually plausible. */
    && currentSubProperties.reduce((total, property) => total + property.powerUps, 0) === artifactGrades[grade].naturalRank - 1;

  let subProperties = currentSubProperties;
  if (!currentRollModel) {
    if (!hasHistoricalRollModel(source.date_add)) return null;
    subProperties = [];
    for (const entry of secondary) {
      const definition = artifactProperty(Array.isArray(entry) ? entry[0] : null);
      const subProperty = readSubProperty(entry, category, grade, 'historical', definition ? historicalMaximum(definition) : null);
      if (!subProperty) return null;
      subProperties.push(subProperty);
    }
    /* §4 is true for both generations; the old model only relaxes the roll
       ranges and total because those are precisely what Refine completed. */
    if (new Set(subProperties.map((property) => property.definition.id)).size !== subProperties.length) return null;
  }

  const occupied = numberOrNull(source.occupied_id);
  /* §15.1: `type` decides which of the two fields carries the equip class, and
     the other is always 0. Reading only the field that governs keeps a value in
     the unused field from being mistaken for this artifact's class. */
  const equipClassCode = numberOrNull(category === 'attribute' ? source.attribute : source.unit_style);
  const intangible = equipClassCode === artifactIntangibleEquipClass;
  /* Parity rule (`AGENTS.md` §0.1): an equip class JASWA cannot name is a
     reader gap, and the loud failure of a rejected record is what surfaces it.
     Accepting one would import an artifact the user owns and then hide it from
     every recommendation, because no monster could ever match it — the silent
     shortfall the parity rule exists to prevent. */
  const namedClass = category === 'attribute'
    ? artifactElements[equipClassCode ?? -1] !== undefined
    : artifactArchetypes[equipClassCode ?? -1] !== undefined;
  if (!namedClass && !intangible) return null;
  return {
    id: String(id),
    category,
    element: category === 'attribute' ? artifactElements[equipClassCode ?? -1] ?? null : null,
    archetype: category === 'type' ? artifactArchetypes[equipClassCode ?? -1] ?? null : null,
    intangible,
    mainProperty,
    grade,
    subProperties,
    convertedPropertyIndex,
    occupiedId: occupied === null || occupied === 0 ? null : String(occupied),
    locked: Boolean(numberOrNull(source.locked)),
    unrefined: hasHistoricalRollModel(source.date_add)
      && Number.isSafeInteger(numberOrNull(source.level))
      && (numberOrNull(source.level) as number) < 15,
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
