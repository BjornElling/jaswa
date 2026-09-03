import { artifactProperty, artifactGrades } from './artifact-properties';
import type { ArtifactCategory, ArtifactGrade } from './artifact-properties';
import type { GameRecord } from './game-data';

/**
 * An engraved conversion stone the account owns, as `artifact_crafts` records
 * it. The stone names one property *and* one equip class: a Water stone
 * converts a Water attribute artifact and nothing else, which is why the class
 * travels with the property rather than being discarded.
 *
 * `ARTIFACT-CANONICAL.md` §15.12 records the encoding and the evidence.
 */
export type EngravedConversionStone = {
  category: ArtifactCategory;
  /** Element for an attribute stone, archetype for a type stone. */
  equipClassCode: number;
  grade: ArtifactGrade;
  propertyId: number;
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

const gradesByNaturalRank = new Map<number, ArtifactGrade>(
  (Object.keys(artifactGrades) as ArtifactGrade[]).map((grade) => [artifactGrades[grade].naturalRank, grade]),
);

function integerValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * One stone record, or `undefined` when it does not satisfy the encoding.
 *
 * A stone naming a legacy property is refused rather than kept: §12 forbids
 * computing a roll for a property whose range is unknown, so a conversion to
 * one could not be valued. 174 of the account's 463 stones are in that state,
 * and they are genuinely unusable for a recommendation rather than merely
 * unread.
 */
export function readEngravedConversionStone(record: unknown): EngravedConversionStone | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const source = record as GameRecord;
  const masterId = integerValue(source.master_id);
  const quantity = integerValue(source.quantity);
  if (masterId === undefined || quantity === undefined || quantity <= 0) return undefined;

  const digits = String(masterId);
  if (digits.length !== stoneMasterIdDigits) return undefined;
  const categoryCode = Number(digits.slice(0, 3));
  const elementCode = Number(digits.slice(3, 6));
  const archetypeAndGrade = Number(digits.slice(6, 9));
  const propertyId = Number(digits.slice(9, 12));

  const grade = gradesByNaturalRank.get(archetypeAndGrade % 100);
  const archetypeCode = Math.floor(archetypeAndGrade / 100);
  if (!grade) return undefined;

  const definition = artifactProperty(propertyId);
  if (!definition || definition.status !== 'current') return undefined;

  if (categoryCode === attributeStoneCategoryCode) {
    /* The two class fields are mutually exclusive in the data. A record filling
       both names a stone this encoding does not describe, and guessing which
       half governs is exactly the invention `AGENTS.md` §0.1 forbids. */
    if (archetypeCode !== 0 || elementCode === 0 || elementCode % elementCodeScale !== 0) return undefined;
    if (definition.availability === 'type') return undefined;
    return { category: 'attribute', equipClassCode: elementCode / elementCodeScale, grade, propertyId, quantity };
  }
  if (categoryCode === typeStoneCategoryCode) {
    if (elementCode !== 0 || archetypeCode === 0) return undefined;
    if (definition.availability === 'attribute') return undefined;
    return { category: 'type', equipClassCode: archetypeCode, grade, propertyId, quantity };
  }
  return undefined;
}

/** Every readable engraved conversion stone in this import. */
export function readEngravedConversionStones(data: GameRecord | undefined): EngravedConversionStone[] {
  const records = data?.artifact_crafts;
  if (!Array.isArray(records)) return [];
  const stones: EngravedConversionStone[] = [];
  for (const record of records) {
    const stone = readEngravedConversionStone(record);
    if (stone) stones.push(stone);
  }
  return stones;
}
