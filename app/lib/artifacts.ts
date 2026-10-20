import type { GameRecord } from './game-data';
import type { MonsterArchetype } from './monster-catalog';
import {
  artifactArchetypes, artifactCategoryFromType, artifactElements, artifactGradeFromRank,
  artifactIntangibleEngraveClass, artifactMainProperties, artifactMaxLevel, artifactProperty,
  artifactPropertyMaximum,
} from './artifact-properties';
import type {
  ArtifactCategory, ArtifactGrade, ArtifactMainProperty, ArtifactPropertyDefinition,
} from './artifact-properties';

export type ArtifactSubProperty = {
  definition: ArtifactPropertyDefinition;
  /** Hundredths of a percentage point, so `0.2 %` is 20 and comparisons are exact. */
  valueHundredths: number;
  powerUps: number;
  /**
   * The ceiling this line could have reached, or `null` for a legacy property,
   * which has no range and weighs zero in every score.
   */
  maximumHundredths: number | null;
};

export type Artifact = {
  id: string;
  category: ArtifactCategory;
  /**
   * The element or monster type it may be engraved on. `null` on an Intangible
   * artifact, which names no single class because it matches every one of them
   * — read `intangible` rather than testing these for absence, and never treat
   * `null` as "unknown".
   */
  element: string | null;
  archetype: MonsterArchetype | null;
  /**
   * Whether this artifact may be engraved on any element (attribute category)
   * or any monster type (type category). The game calls it Intangible and
   * `artifactIntangibleEngraveClass` records the code and the evidence. The
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
  /** The `unit_id` it is engraved on, or `null` when the artifact sits in the inventory. */
  occupiedId: string | null;
  /**
   * The account's acquisition sequence, which is what the game's own "Obtained"
   * sort follows. It is `rid` read as a number: the export issues them in
   * ascending order of acquisition, and across this account's 1,862 artifacts
   * sorting by it never puts a later `date_add` before an earlier one. Unique
   * per artifact, so ordering by it needs no tiebreak.
   *
   * `date_add` is deliberately not the ordering key and is not carried on this
   * model at all. It resolves only to the second while the game grants
   * artifacts in bulk — one dungeon run put 139 of this account's artifacts on
   * a single timestamp, and 546 of 1,862 share a second with something — so
   * inside a batch the date decides nothing and cannot reproduce the game's
   * order. The reader still reads it for the roll-model era cutoffs, which are
   * months-scale and untroubled by ties.
   */
  obtainedOrder: number;
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

function readSubProperty(entry: unknown): ArtifactSubProperty | null {
  if (!Array.isArray(entry)) return null;
  const definition = artifactProperty(entry[0]);
  const value = numberOrNull(entry[1]);
  const powerUps = numberOrNull(entry[2]);
  if (!definition || value === null || powerUps === null || !Number.isInteger(powerUps) || powerUps < 0) return null;

  /* The game is the authority on a received value. Roll tables are a planning
     reference, not an import gate: conversion and reappraisal both write
     values whose encoding has changed before, and a narrow local model must
     never freeze the whole account. The structural fields above are enough to
     display, sort and score this line honestly. */
  /* A displayed line is stored in hundredths. Rounding is
     deliberately limited to the export's known float noise. This conversion is
     representation only; it does not claim the value passed a local roll cap. */
  const valueHundredths = toHundredths(value);
  if (Math.abs(value * 100 - valueHundredths) > 0.000001) return null;
  /* The ceiling is the best line the game can produce — not what this line
     happened to collect, and not what its grade allowed (§16). Dividing by the
     line's own contributions measures how luckily it rolled and scores a
     max-rolled one-roll line exactly like a max-rolled five-roll line; dividing
     by the grade's ceiling makes every grade's four lines look equally full and
     so rewards low grades. The optimizer asks how much the artifact
     contributes, and one scale is what makes that answer comparable.

     A legacy line gets no ceiling, on a pre-v8 artifact as on any other. A
     per-era table of old ceilings used to stand in here, but a legacy property
     is wanted by no monster and weighs zero whatever it rolled, so the only
     thing such a ceiling could do was refuse to judge the whole artifact when
     an old line exceeded it — which is how a wrong entry hid artifacts. */
  const maximum = artifactPropertyMaximum(definition);
  return {
    definition,
    valueHundredths,
    powerUps,
    maximumHundredths: maximum === null ? null : toHundredths(maximum),
  };
}

/* v8's late-June 2023 artifact update retired manual power-ups, and an artifact
   acquired before the following month that stopped below +15 still needs the
   game's one-time Refine. */
const artifactPowerUpRemoval = Date.UTC(2023, 6, 1);

/* The export writes `date_add` two ways — `2022-06-27 22:13:04` on old records
   and an ISO instant on newer ones. Only the era cutoff above reads it, and
   it is months-scale, so the space-separated form is left to the engine's
   own parse rather than being pinned to the account's `tzone`: a few hours
   either way cannot move a record across a cutoff. An unreadable value is
   `null`, not `0`, so a missing date cannot pass the pre-v8 cutoff by posing
   as 1970. */
function artifactEraTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasHistoricalRollModel(value: unknown): boolean {
  const obtained = artifactEraTimestamp(value);
  return obtained !== null && obtained < artifactPowerUpRemoval;
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
  /* `rid` is both the identity and the obtained order, so a value that cannot
     carry either — a float, or a magnitude past exact integer arithmetic —
     makes the record unusable rather than merely odd, and is rejected under
     `AGENTS.md` §0.1's third rule instead of ordering the table wrongly. */
  const id = numberOrNull(source.rid);
  if (!category || !grade || id === null || !Number.isSafeInteger(id)) return null;

  const primary = source.pri_effect;
  if (!Array.isArray(primary)) return null;
  const mainProperty = artifactMainProperties[numberOrNull(primary[0]) ?? -1];
  /* The magnitude is checked and then dropped: a record without a readable main
     value is malformed and must fail loudly, but the number itself is never
     carried into the model — see the `mainProperty` note on `Artifact`. */
  if (!mainProperty || numberOrNull(primary[1]) === null) return null;

  const secondary = source.sec_effects;
  if (!Array.isArray(secondary) || secondary.length !== 4) return null;
  const subProperties: ArtifactSubProperty[] = [];
  const currentConversionLocks: number[] = [];
  const legacyConversionLocks: number[] = [];
  for (const [index, entry] of secondary.entries()) {
    /* The current client marks the converted line in tuple position 3. The
       earlier capture used position 4, so it remains a fallback for records
       without the current marker. Both describe the line to overwrite, not
       the property that was replaced. */
    const currentConversionFlag = numberOrNull(Array.isArray(entry) ? entry[3] : null);
    const legacyConversionFlag = numberOrNull(Array.isArray(entry) ? entry[4] : null);
    if (currentConversionFlag === null || !Number.isInteger(currentConversionFlag) || currentConversionFlag < 0
      || legacyConversionFlag === null || !Number.isInteger(legacyConversionFlag) || legacyConversionFlag < 0) return null;
    if (currentConversionFlag > 0) currentConversionLocks.push(index);
    if (legacyConversionFlag > 0) legacyConversionLocks.push(index);
    const subProperty = readSubProperty(entry);
    if (!subProperty) return null;
    subProperties.push(subProperty);
  }
  /* Prefer the flag confirmed by the current game panel. The old position is
     only a compatibility fallback, never evidence that can override it. */
  const convertedPropertyIndex = (currentConversionLocks.length > 0
    ? currentConversionLocks
    : legacyConversionLocks)[0] ?? null;

  const occupied = numberOrNull(source.occupied_id);
  /* §15.1: `type` decides which of the two fields carries the engrave class, and
     the other is always 0. Reading only the field that governs keeps a value in
     the unused field from being mistaken for this artifact's class. */
  const engraveClassCode = numberOrNull(category === 'attribute' ? source.attribute : source.unit_style);
  const intangible = engraveClassCode === artifactIntangibleEngraveClass;
  /* Parity rule (`AGENTS.md` §0.1): an engrave class JASWA cannot name is a
     reader gap, and the loud failure of a rejected record is what surfaces it.
     Accepting one would import an artifact the user owns and then hide it from
     every recommendation, because no monster could ever match it — the silent
     shortfall the parity rule exists to prevent. */
  const namedClass = category === 'attribute'
    ? artifactElements[engraveClassCode ?? -1] !== undefined
    : artifactArchetypes[engraveClassCode ?? -1] !== undefined;
  if (!namedClass && !intangible) return null;
  return {
    id: String(id),
    category,
    element: category === 'attribute' ? artifactElements[engraveClassCode ?? -1] ?? null : null,
    archetype: category === 'type' ? artifactArchetypes[engraveClassCode ?? -1] ?? null : null,
    intangible,
    mainProperty,
    grade,
    subProperties,
    convertedPropertyIndex,
    occupiedId: occupied === null || occupied === 0 ? null : String(occupied),
    obtainedOrder: id,
    locked: Boolean(numberOrNull(source.locked)),
    unrefined: hasHistoricalRollModel(source.date_add)
      && Number.isSafeInteger(numberOrNull(source.level))
      && (numberOrNull(source.level) as number) < artifactMaxLevel,
  };
}

/**
 * Every artifact on the account. `completeEngravedCollections` has already
 * merged the engraved ones into `data.artifacts` and de-duplicated them on
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
