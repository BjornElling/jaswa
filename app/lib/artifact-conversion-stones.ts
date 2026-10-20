import { artifactGradeFromRank, artifactProperty } from './artifact-properties';
import type { ArtifactCategory, ArtifactGrade } from './artifact-properties';
import type { GameRecord } from './game-data';

/**
 * An engraved conversion stone the account owns, as `artifact_crafts` records
 * it. The stone names one property *and* one engrave class: a Water stone
 * converts a Water attribute artifact and nothing else, which is why the class
 * travels with the property rather than being discarded.
 *
 * `ARTIFACT-CANONICAL.md` §15.12 records the encoding and the evidence.
 */
export type EngravedConversionStone = {
  category: ArtifactCategory;
  /** Element for an attribute stone, archetype for a type stone. */
  engraveClassCode: number;
  grade: ArtifactGrade;
  propertyId: number;
  /**
   * Whether a conversion to this property can be valued. A stone naming a
   * property v8.0.0 retired is still a stone the account owns and the game
   * still lets it be used ("remain usable", v8.0.0 notice), so it is read,
   * counted and shown — but the property is legacy, wanted by no monster, and
   * a conversion to it is worth nothing to any preference, so no
   * recommendation spends one.
   */
  valued: boolean;
  /** Zero is an empty stack: readable, and owning nothing. */
  quantity: number;
};

/* The 12-digit `master_id` reads `CCC EEE AAG PPP`, confirmed on all 271
   records of the captured account with no exceptions:

     CCC  101 attribute stone, 102 type stone
     EEE  element × 10 on an attribute stone, 000 on a type stone
     AAG  archetype × 100 plus the natural grade, 3 Rare / 4 Hero / 5 Legend
     PPP  the artifact property the stone engraves

   An attribute stone always carries an element and archetype 0; a type stone
   always the reverse. That mutual exclusion is what makes the two class fields
   readable as one code without ambiguity. */
const stoneMasterIdDigits = 12;
const attributeStoneCategoryCode = 101;
const typeStoneCategoryCode = 102;
const elementCodeScale = 10;

function integerValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * One stone record, or `undefined` when it does not satisfy the encoding.
 *
 * A stone naming a legacy property is read like any other and marked
 * `valued: false`. It used to be dropped here, which took 174 of the account's
 * 463 stones out of every count without a word — a stone the game says remains
 * usable, silently missing (`AGENTS.md` §0.1). An undecodable record is the
 * other case: the importer refuses the file over it
 * (`isReadableEngravedConversionStone`).
 */
export function readEngravedConversionStone(record: unknown): EngravedConversionStone | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const source = record as GameRecord;
  const masterId = integerValue(source.master_id);
  const quantity = integerValue(source.quantity);
  if (masterId === undefined || quantity === undefined || quantity < 0) return undefined;

  const digits = String(masterId);
  if (digits.length !== stoneMasterIdDigits) return undefined;
  const categoryCode = Number(digits.slice(0, 3));
  const elementCode = Number(digits.slice(3, 6));
  const archetypeAndGrade = Number(digits.slice(6, 9));
  const propertyId = Number(digits.slice(9, 12));

  const grade = artifactGradeFromRank(archetypeAndGrade % 100);
  const archetypeCode = Math.floor(archetypeAndGrade / 100);
  if (!grade) return undefined;

  const definition = artifactProperty(propertyId);
  if (!definition) return undefined;
  const valued = definition.status === 'current';

  if (categoryCode === attributeStoneCategoryCode) {
    /* The two class fields are mutually exclusive in the data. A record filling
       both names a stone this encoding does not describe, and guessing which
       half governs is exactly the invention `AGENTS.md` §0.1 forbids. */
    if (archetypeCode !== 0 || elementCode === 0 || elementCode % elementCodeScale !== 0) return undefined;
    if (definition.availability === 'type') return undefined;
    return { category: 'attribute', engraveClassCode: elementCode / elementCodeScale, grade, propertyId, valued, quantity };
  }
  if (categoryCode === typeStoneCategoryCode) {
    if (elementCode !== 0 || archetypeCode === 0) return undefined;
    if (definition.availability === 'attribute') return undefined;
    return { category: 'type', engraveClassCode: archetypeCode, grade, propertyId, valued, quantity };
  }
  return undefined;
}

/**
 * Whether the importer can accept this `artifact_crafts` record. A stone the
 * encoding does not describe is refused with the whole file, as an unreadable
 * artifact is: skipping it would leave a stone the account owns out of every
 * count and every conversion without anything saying so.
 */
export function isReadableEngravedConversionStone(record: unknown): boolean {
  return readEngravedConversionStone(record) !== undefined;
}

/**
 * Every engraved conversion stone this import holds, valued or not; empty
 * stacks are left out. The importer has already refused any record this cannot
 * read, so nothing is dropped here.
 */
export function readEngravedConversionStones(data: GameRecord | undefined): EngravedConversionStone[] {
  const records = data?.artifact_crafts;
  if (!Array.isArray(records)) return [];
  const stones: EngravedConversionStone[] = [];
  for (const record of records) {
    const stone = readEngravedConversionStone(record);
    if (stone && stone.quantity > 0) stones.push(stone);
  }
  return stones;
}

/**
 * How many engraved conversion stones the account owns, split by whether a
 * conversion to their property can be valued. `undefined` when the import
 * carried no stone collection at all, which is not the same as owning none.
 */
export function engravedConversionStoneCounts(
  data: GameRecord | undefined,
): { valued: number; notValued: number } | undefined {
  if (!Array.isArray(data?.artifact_crafts)) return undefined;
  let valued = 0;
  let notValued = 0;
  for (const stone of readEngravedConversionStones(data)) {
    if (stone.valued) valued += stone.quantity;
    else notValued += stone.quantity;
  }
  return { valued, notValued };
}
