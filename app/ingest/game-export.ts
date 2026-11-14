import type { HelperSession, ImportIssue, ImportIssueCode, ImportReport, ImportedGame, StoredGame } from '../domain/model';
import { readArtifact, readArtifacts } from '../domain/artifacts/artifacts';
import { readRelic, readRelics, relicEngravingProblem } from '../domain/relics/relics';
import { isReadableEngravedConversionStone, readEngravedConversionStones } from '../domain/artifacts/artifact-conversion-stones';
import { readCraftItem, readCraftItems } from '../domain/runes/craft/rune-craft-items';
import { readRune, readRunes } from '../domain/runes/runes';
import { readDeckPresets } from '../domain/placements/deck-presets';
import { intangibleSetId } from '../domain/combat/monster-stats';
import { hasMonsterCatalogEntry } from '../domain/monsters/monster-catalog';
import { normalShrineList, normalShrineRecords, shrineMonsterRecords, summonedShrineList, summonedShrineRecords } from '../domain/account/sealed-shrine-storage';
import { accountBuildingsProblem, readBuildingBonuses, readSkyTribeTotem } from '../domain/account/account-buildings';
import { accountCounts } from '../domain/account/account-counts';
import type { GameRecord } from '../domain/account/game-record';
import { completeCoverage, readCaptureCoverage } from '../domain/account/account-snapshot';
import type { AccountSnapshot, CaptureCoverage, MonsterCopy, SummonedStack } from '../domain/account/account-snapshot';
import { readLocalAccountChanges } from '../domain/account/local-account-changes';
import { readPresets } from '../domain/placements/presets';
import { readRuneLocks } from '../domain/placements/rune-locks';

const expectedSections = [
  'unit_list', 'unit_storage_list', 'unit_storage_normal_list', 'runes', 'artifacts', 'relics', 'rune_craft_item_list', 'artifact_crafts', 'inventory_info',
] as const;
const excludedKeys = new Set(['session_key', 'session_key_node']);

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordCollection(value: unknown): GameRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasCollection(value: unknown): boolean {
  return Array.isArray(value);
}

function isPositiveIdentifier(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

/* A collection is a count of owned entities, not a bag of values that happen
   to look like them. Requiring a positive id and one occurrence per collection
   keeps malformed records from becoming a count that no table can honour. The
   problem carries the first index so a refusal can be diagnosed without
   sending the source data anywhere. */
type CollectionProblem = {
  index?: number;
  entityId?: string;
  reason: 'not-an-array' | 'not-a-record' | 'invalid-identifier' | 'failed-record-check' | 'duplicate-identifier';
  firstIndex?: number;
};

function recordEntityId(record: GameRecord, identifier: string): string | undefined {
  const value = record[identifier];
  return typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;
}

function firstIdentifiedCollectionProblem(
  value: unknown,
  identifier: string,
  recordCheck: (record: GameRecord) => boolean = () => true,
): CollectionProblem | undefined {
  if (!Array.isArray(value)) return { reason: 'not-an-array' };
  const records: GameRecord[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return { index, reason: 'not-a-record' };
    const entityId = recordEntityId(entry, identifier);
    if (!isPositiveIdentifier(entry[identifier])) return { index, entityId, reason: 'invalid-identifier' };
    if (!recordCheck(entry)) return { index, entityId, reason: 'failed-record-check' };
    records.push(entry);
  }
  const firstById = new Map<string, number>();
  for (const [index, record] of records.entries()) {
    const id = String(record[identifier]);
    const firstIndex = firstById.get(id);
    if (firstIndex !== undefined) return { index, entityId: id, reason: 'duplicate-identifier', firstIndex };
    firstById.set(id, index);
  }
  return undefined;
}

function collectionProblemExplanation(problem: CollectionProblem, identifier: string): string {
  if (problem.reason === 'not-an-array') return 'The collection is not an array.';
  if (problem.reason === 'not-a-record') return `The record at index ${problem.index} is not an object.`;
  if (problem.reason === 'invalid-identifier') return `The record at index ${problem.index} has an invalid ${identifier}.`;
  if (problem.reason === 'failed-record-check') return `The record at index ${problem.index} failed its reader check.`;
  return `The ${identifier} is duplicated at index ${problem.index}; its first record is at index ${problem.firstIndex}.`;
}

function identifiedCollectionIssue(
  code: ImportIssueCode,
  collection: string,
  identifier: string,
  problem: CollectionProblem,
): ImportIssue {
  const sourcePath = problem.index === undefined ? collection : `${collection}[${problem.index}]`;
  return {
    code, collection, sourcePath,
    ...(problem.entityId !== undefined ? { entityId: problem.entityId, field: identifier } : {}),
    explanation: collectionProblemExplanation(problem, identifier),
  };
}

/* Read through the workspace's own reader, for the reason `AGENTS.md` §0.1
   gives: a stack that passes a structural check and then cannot be decoded into
   a kind, a set, a stat and a grade is counted in the account total and absent
   from the box list — invisible, which is worse than rejected. */
function isEmptyCraftRecord(record: GameRecord): boolean {
  /* The game leaves an emptied stack in the account response after its last
     item is spent. It is not an owned item, so it must disappear at the import
     boundary; first check the record with a positive amount so a malformed zero
     record cannot use this cleanup path to bypass the craft reader. */
  return record.amount === 0
    && readCraftItem({ ...record, amount: 1 }) !== null;
}

function isValidCraftRecord(record: GameRecord): boolean {
  return readCraftItem(record) !== null || isEmptyCraftRecord(record);
}

function isValidRuneRecord(record: GameRecord): boolean {
  return readRune(record) !== null;
}

function isValidStorageRecord(record: GameRecord): boolean {
  const masterId = record.unit_master_id;
  const quantity = record.quantity;
  const validMasterId = isPositiveIdentifier(masterId);
  const validQuantity = typeof quantity === 'number'
    && Number.isSafeInteger(quantity)
    && quantity > 0;
  const validGrade = record.class === undefined
    || (typeof record.class === 'number' && Number.isSafeInteger(record.class) && record.class >= 1 && record.class <= 6);
  return validMasterId && validQuantity && validGrade;
}

function isEmptyStorageRecord(record: GameRecord): boolean {
  /* Summoned Shrine uses the same stack convention as craft inventory: the
     game can answer with the last stack at zero before it drops the row. It is
     not an owned monster, but its identity and optional grade still need to be
     real before the import removes it. */
  return record.quantity === 0
    && isValidStorageRecord({ ...record, quantity: 1 });
}

function isValidImportedStorageRecord(record: GameRecord): boolean {
  return isValidStorageRecord(record) || isEmptyStorageRecord(record);
}

function isWholeNumberBetween(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/* A skill is `[skill id, skill level]`, both positive. */
function isSkillList(value: unknown): boolean {
  return Array.isArray(value) && value.every((skill) => Array.isArray(skill) && skill.length >= 2
    && isWholeNumberBetween(skill[0], 1, Number.MAX_SAFE_INTEGER) && isWholeNumberBetween(skill[1], 1, Number.MAX_SAFE_INTEGER));
}

/* A unit is counted the moment it is accepted, so every field a page reads it
   by must be one JASWA can act on (`AGENTS.md` §0.1, part 3). The master id is
   what every catalogue, stat and family lookup keys on, so it is required; a
   grade, level or skill list the record carries must be one the game can
   produce. A record that omits one of those three is still read, and the pages
   show the gap as "—" rather than inventing a value. */
function isValidUnitRecord(record: GameRecord): boolean {
  return isWholeNumberBetween(record.unit_master_id, 1, Number.MAX_SAFE_INTEGER)
    && (record.class === undefined || isWholeNumberBetween(record.class, 1, 6))
    && (record.unit_level === undefined || isWholeNumberBetween(record.unit_level, 1, 40))
    && (record.skills === undefined || isSkillList(record.skills));
}

/** The game allows one Intangible Rune in a monster's engraved six. */
type IndexedRecord = { index: number; record: GameRecord };

/** The second Intangible record is the one that makes the monster's six contradictory. */
function firstEngravedIntangibleProblem(records: readonly GameRecord[]): IndexedRecord | undefined {
  const owners = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (record.set_id !== intangibleSetId || record.occupied_type !== 1) continue;
    const owner = String(record.occupied_id);
    if (owners.has(owner)) return { index, record };
    owners.add(owner);
  }
  return undefined;
}

function firstRepeatedEngravedItem(
  units: readonly GameRecord[],
  section: 'runes' | 'artifacts',
  identifier: string,
): { unitIndex: number; itemIndex: number; item: GameRecord; first: { unitIndex: number; itemIndex: number } } | undefined {
  const seen = new Map<string, { unitIndex: number; itemIndex: number }>();
  for (const [unitIndex, unit] of units.entries()) {
    for (const [itemIndex, item] of recordCollection(unit[section]).entries()) {
      const id = String(item[identifier]);
      const first = seen.get(id);
      if (first) return { unitIndex, itemIndex, item, first };
      seen.set(id, { unitIndex, itemIndex });
    }
  }
  return undefined;
}

/** The account-level record whose placement disagrees with the monster lists. */
function firstMisplacedItem(
  value: GameRecord,
  units: readonly GameRecord[],
  section: 'runes' | 'artifacts',
  identifier: string,
): IndexedRecord | undefined {
  const carrier = new Map<string, string>();
  for (const unit of units) {
    for (const item of recordCollection(unit[section])) carrier.set(String(item[identifier]), String(unit.unit_id));
  }
  if (!Array.isArray(value[section])) return undefined;
  for (const [index, entry] of value[section].entries()) {
    if (!isRecord(entry)) continue;
    const engraved = section === 'runes' ? entry.occupied_type === 1 : Number(entry.occupied_id) > 0;
    const on = carrier.get(String(entry[identifier]));
    if (engraved ? on !== String(entry.occupied_id) : on !== undefined) return { index, record: entry };
  }
  return undefined;
}

function resolvedCollectionPath(
  value: GameRecord,
  key: string,
  containers: readonly (readonly string[])[],
): string {
  for (const containerPath of containers) {
    let current: unknown = value;
    for (const step of containerPath) current = isRecord(current) ? current[step] : undefined;
    if (isRecord(current) && Array.isArray(current[key])) return [...containerPath, key].join('.');
  }
  return key;
}

function shrineCollectionPath(value: GameRecord, kind: 'summoned' | 'normal'): string {
  return kind === 'summoned'
    ? resolvedCollectionPath(value, 'unit_storage_list', [[], ['GetUnitStorageList'], ['GetWizardDataPart1'], ['GetWizardDataPart1', 'GetUnitStorageList']])
    : resolvedCollectionPath(value, 'unit_storage_normal_list', [[], ['GetWizardDataPart1'], ['GetUnitStorageList']]);
}

function issuePrefix(issue: ImportIssue): string {
  switch (issue.code) {
    case 'not-an-object': return 'This is not a valid Summoners War JSON file.';
    case 'missing-core-lists': return 'This file does not contain the monster and rune lists needed by JASWA.';
    case 'unreadable-monster': return 'This file contains a monster JASWA cannot read.';
    case 'unreadable-rune': return 'This file contains a rune JASWA cannot read.';
    case 'two-intangibles-on-one-monster': return 'This file has more than one Intangible Rune engraved on one monster.';
    case 'unreadable-deck-preset':
    case 'relic-engraving':
    case 'unreadable-buildings': return issue.explanation;
    case 'unreadable-shrine-monster': return 'This file contains a sealed-shrine monster JASWA cannot read.';
    case 'monster-in-two-places': return 'This file places a monster in Inventory and Sealed Shrine at once.';
    case 'invalid-account-identity': return 'This file contains an invalid account identity.';
    case 'foreign-monster': return 'This file contains a monster JASWA cannot verify as belonging to this account.';
    case 'unreadable-engraved-rune': return 'This file contains an engraved rune JASWA cannot read.';
    case 'unreadable-engraved-artifact': return 'This file contains an engraved artifact JASWA cannot read.';
    case 'unreadable-engraved-relic': return 'This file contains an engraved relic JASWA cannot read.';
    case 'rune-engraved-twice': return 'This file engraves one rune on two monsters.';
    case 'artifact-engraved-twice': return 'This file engraves one artifact on two monsters.';
    case 'rune-misplaced': return 'This file places a rune on a monster that does not carry it.';
    case 'artifact-misplaced': return 'This file places an artifact on a monster that does not carry it.';
    case 'unreadable-artifact': return 'This file contains an artifact JASWA cannot read.';
    case 'unreadable-relic': return 'This file contains a relic JASWA cannot read.';
    case 'unreadable-conversion-stone': return 'This file contains an engraved conversion stone JASWA cannot read.';
    case 'unreadable-craft-item': return 'This file contains an invalid craft-item collection.';
  }
}

function importMessage(issue: ImportIssue): string {
  const prefix = issuePrefix(issue);
  if (issue.sourcePath === '$') return prefix;
  const sentence = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
  const location = ` (${issue.sourcePath}${issue.entityId !== undefined && issue.field ? `, ${issue.field} ${issue.entityId}` : ''})`;
  return `${sentence}${location}.`;
}
type IssueEntity = { field: string; entityId: string | undefined };
const entityOf = (record: GameRecord, field: string): IssueEntity => ({ field, entityId: recordEntityId(record, field) });

function directImportIssue(
  code: ImportIssueCode,
  collection: string,
  sourcePath: string,
  explanation: string,
  entity?: IssueEntity,
): ImportIssue {
  return { code, collection, sourcePath, ...(entity?.entityId !== undefined ? { entityId: entity.entityId, field: entity.field } : {}), explanation };
}

function validateAccountCollections(value: GameRecord): ImportIssue | undefined {
  const unitProblem = firstIdentifiedCollectionProblem(value.unit_list, 'unit_id', isValidUnitRecord);
  if (unitProblem) return identifiedCollectionIssue('unreadable-monster', 'unit_list', 'unit_id', unitProblem);

  const runeProblem = firstIdentifiedCollectionProblem(value.runes, 'rune_id', isValidRuneRecord);
  if (runeProblem) return identifiedCollectionIssue('unreadable-rune', 'runes', 'rune_id', runeProblem);

  const intangible = firstEngravedIntangibleProblem(recordCollection(value.runes));
  if (intangible) {
    return directImportIssue(
      'two-intangibles-on-one-monster', 'runes', `runes[${intangible.index}]`,
      `The second Intangible Rune engraved on monster ${String(intangible.record.occupied_id)} is at this index.`,
      entityOf(intangible.record, 'rune_id'),
    );
  }
  try {
    readDeckPresets(value);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : 'This account contains a Deck Preset JASWA cannot read.';
    /* The deck reader owns the deck contract; its sentence says what failed, and
       restating its rules here to find the index would be a second deck reader. */
    return directImportIssue('unreadable-deck-preset', 'deck presets', 'deck_list', explanation);
  }
  /* Each tab is checked where the account carries it, nested or at the root,
     because that same list is what the import publishes, counts and shows. */
  const summonedShrine = summonedShrineList(value);
  if (summonedShrine !== undefined) {
    const problem = firstIdentifiedCollectionProblem(summonedShrine, 'unit_master_id', isValidImportedStorageRecord);
    if (problem) return identifiedCollectionIssue('unreadable-shrine-monster', shrineCollectionPath(value, 'summoned'), 'unit_master_id', problem);
  }
  const normalShrine = normalShrineList(value);
  if (normalShrine !== undefined) {
    const problem = firstIdentifiedCollectionProblem(normalShrine, 'unit_id', isValidUnitRecord);
    if (problem) return identifiedCollectionIssue('unreadable-shrine-monster', shrineCollectionPath(value, 'normal'), 'unit_id', problem);
  }

  const units = recordCollection(value.unit_list);
  const normalStorageUnits = recordCollection(normalShrine);
  /* Normal Shrine is a location for a unit, not another collection of units.
     A repeated id is contradictory source data: choosing a row to hide would
     make the account total look plausible while leaving its location false. */
  const liveUnitIds = new Set(units.map((unit) => String(unit.unit_id)));
  const duplicateLocationIndex = normalStorageUnits.findIndex((unit) => liveUnitIds.has(String(unit.unit_id)));
  if (duplicateLocationIndex >= 0) {
    const duplicate = normalStorageUnits[duplicateLocationIndex];
    return directImportIssue(
      'monster-in-two-places', shrineCollectionPath(value, 'normal'), `${shrineCollectionPath(value, 'normal')}[${duplicateLocationIndex}]`,
      `The monster is listed in Inventory and Sealed Shrine at once.`, entityOf(duplicate, 'unit_id'),
    );
  }
  /* A full export normally carries the account wizard id on every owned unit.
     Without this boundary, a battle response can look like a valid monster
     record and add an opponent's LD5 to the account simply because it has a
     positive unit_id and a level. Normal-shrine records are an account-level
     collection, and the game may omit that optional field on those records;
     an explicit different id is still rejected. */
  if (value.wizard_id !== undefined) {
    if (!isPositiveIdentifier(value.wizard_id)) {
      const entityId = typeof value.wizard_id === 'number' || typeof value.wizard_id === 'string' ? String(value.wizard_id) : undefined;
      return directImportIssue('invalid-account-identity', 'wizard_id', 'wizard_id', 'The account wizard_id is not a positive identifier.', { field: 'wizard_id', entityId });
    }
    const accountWizardId = String(value.wizard_id);
    const foreignUnitIndex = units.findIndex((unit) => String(unit.wizard_id) !== accountWizardId);
    const foreignNormalIndex = normalStorageUnits.findIndex((unit) => unit.wizard_id !== undefined
      && String(unit.wizard_id) !== accountWizardId);
    if (foreignUnitIndex >= 0) {
      const unit = units[foreignUnitIndex];
      return directImportIssue(
        'foreign-monster', 'unit_list', `unit_list[${foreignUnitIndex}]`,
        `The monster's wizard_id does not match the account wizard_id ${accountWizardId}.`, entityOf(unit, 'unit_id'),
      );
    }
    if (foreignNormalIndex >= 0) {
      const unit = normalStorageUnits[foreignNormalIndex];
      const collection = shrineCollectionPath(value, 'normal');
      return directImportIssue(
        'foreign-monster', collection, `${collection}[${foreignNormalIndex}]`,
        `The monster's wizard_id does not match the account wizard_id ${accountWizardId}.`, entityOf(unit, 'unit_id'),
      );
    }
  }
  for (const [unitIndex, unit] of units.entries()) {
    if (unit.runes !== undefined) {
      const problem = firstIdentifiedCollectionProblem(unit.runes, 'rune_id', isValidRuneRecord);
      if (problem) {
        const collection = `unit_list[${unitIndex}].runes`;
        return identifiedCollectionIssue('unreadable-engraved-rune', collection, 'rune_id', problem);
      }
      const duplicateIntangible = firstEngravedIntangibleProblem(recordCollection(unit.runes));
      if (duplicateIntangible) {
        const collection = `unit_list[${unitIndex}].runes`;
        return directImportIssue(
          'two-intangibles-on-one-monster', collection, `${collection}[${duplicateIntangible.index}]`,
          `The second Intangible Rune engraved on monster ${String(duplicateIntangible.record.occupied_id)} is at this index.`,
          entityOf(duplicateIntangible.record, 'rune_id'),
        );
      }
    }
    if (unit.artifacts !== undefined) {
      const problem = firstIdentifiedCollectionProblem(unit.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null);
      if (problem) {
        const collection = `unit_list[${unitIndex}].artifacts`;
        return identifiedCollectionIssue('unreadable-engraved-artifact', collection, 'rid', problem);
      }
    }
    if (unit.relics !== undefined) {
      const problem = firstIdentifiedCollectionProblem(unit.relics, 'rid', (relic) => readRelic(relic) !== null);
      if (problem) {
        const collection = `unit_list[${unitIndex}].relics`;
        return identifiedCollectionIssue('unreadable-engraved-relic', collection, 'rid', problem);
      }
    }
  }
  const repeatedRune = firstRepeatedEngravedItem(units, 'runes', 'rune_id');
  if (repeatedRune) {
    const collection = `unit_list[${repeatedRune.unitIndex}].runes`;
    return directImportIssue(
      'rune-engraved-twice', collection, `${collection}[${repeatedRune.itemIndex}]`,
      `The rune is also engraved on monster ${String(units[repeatedRune.first.unitIndex].unit_id)}.`,
      entityOf(repeatedRune.item, 'rune_id'),
    );
  }
  const repeatedArtifact = firstRepeatedEngravedItem(units, 'artifacts', 'rid');
  if (repeatedArtifact) {
    const collection = `unit_list[${repeatedArtifact.unitIndex}].artifacts`;
    return directImportIssue(
      'artifact-engraved-twice', collection, `${collection}[${repeatedArtifact.itemIndex}]`,
      `The artifact is also engraved on monster ${String(units[repeatedArtifact.first.unitIndex].unit_id)}.`,
      entityOf(repeatedArtifact.item, 'rid'),
    );
  }
  const misplacedRune = firstMisplacedItem(value, units, 'runes', 'rune_id');
  if (misplacedRune) {
    return directImportIssue('rune-misplaced', 'runes', `runes[${misplacedRune.index}]`,
      'The account record and monster engraving do not name the same placement.', entityOf(misplacedRune.record, 'rune_id'));
  }
  const misplacedArtifact = firstMisplacedItem(value, units, 'artifacts', 'rid');
  if (misplacedArtifact) {
    return directImportIssue('artifact-misplaced', 'artifacts', `artifacts[${misplacedArtifact.index}]`,
      'The account record and monster engraving do not name the same placement.', entityOf(misplacedArtifact.record, 'rid'));
  }

  if (value.artifacts !== undefined) {
    const problem = firstIdentifiedCollectionProblem(value.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null);
    if (problem) return identifiedCollectionIssue('unreadable-artifact', 'artifacts', 'rid', problem);
  }
  /* Relics are read through the same reader the workspace uses, for the reason
     `AGENTS.md` §0.1 gives: a relic that passes a structural check and then
     cannot be judged is counted, invisible, and worse than rejected. */
  if (value.relics !== undefined) {
    const problem = firstIdentifiedCollectionProblem(value.relics, 'rid', (relic) => readRelic(relic) !== null);
    if (problem) return identifiedCollectionIssue('unreadable-relic', 'relics', 'rid', problem);
  }
  const relicProblem = relicEngravingProblem(units);
  if (relicProblem) return directImportIssue('relic-engraving', 'unit_list[*].relics', 'unit_list[*].relics', relicProblem);
  if (value.artifact_crafts !== undefined) {
    const problem = firstIdentifiedCollectionProblem(value.artifact_crafts, 'rid', isReadableEngravedConversionStone);
    if (problem) return identifiedCollectionIssue('unreadable-conversion-stone', 'artifact_crafts', 'rid', problem);
  }
  if (value.rune_craft_item_list !== undefined) {
    const problem = firstIdentifiedCollectionProblem(value.rune_craft_item_list, 'craft_item_id', isValidCraftRecord);
    if (problem) return identifiedCollectionIssue('unreadable-craft-item', 'rune_craft_item_list', 'craft_item_id', problem);
  }
  /* The buildings move every combat speed and every stat they
     touch, so a building list that cannot say a level is refused rather than
     read as "no building". */
  const buildingsProblem = accountBuildingsProblem(value);
  if (buildingsProblem) return directImportIssue('unreadable-buildings', 'buildings', 'deco_list', buildingsProblem);
  return undefined;
}
/* Artifacts and relics both carry their own id as `rid`, not `artifact_id` or
   `relic_id`: no record in the export has either, so keying on them silently
   de-duplicated nothing and would let an engraved item appear twice once the
   account list and a unit's list overlapped. Runes really do use `rune_id`.
   `ARTIFACT-CANONICAL.md` §15.1 settles the artifact field, and the relic
   records in the same export carry the same one. */
function itemId(section: 'runes' | 'artifacts' | 'relics', item: GameRecord): string | undefined {
  const key = section === 'runes' ? 'rune_id' : 'rid';
  const value = item[key];
  return typeof value === 'number' || typeof value === 'string' ? `${key}:${value}` : undefined;
}

/* Engraved items live below their owner in the export. The prepared game keeps
   the owner data and also exposes a complete account-wide collection. */
function completeEngravedCollections(data: GameRecord): GameRecord {
  const units = recordCollection(data.unit_list);
  const complete = (section: 'runes' | 'artifacts' | 'relics') => {
    const seen = new Set<string>();
    return [...recordCollection(data[section]), ...units.flatMap((unit) => recordCollection(unit[section]))]
      .filter((item) => {
        const id = itemId(section, item);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  };
  const prepared: GameRecord = {
    ...data,
    unit_list: units,
    runes: complete('runes'),
    artifacts: complete('artifacts'),
    relics: complete('relics'),
    rune_craft_item_list: recordCollection(data.rune_craft_item_list)
      .filter((record) => !isEmptyCraftRecord(record)),
  };
  /* These two account collections are not yet separate workspaces, but live
     import still keeps them current so a later workspace never starts from a
     stale snapshot. Missing stays missing; an explicitly empty collection
     remains the user's empty answer. */
  if (hasCollection(data.artifact_crafts)) {
    prepared.artifact_crafts = recordCollection(data.artifact_crafts);
  }
  /* Both Sealed Shrine tabs are published at the root from wherever the
     account carried them, so no later reader has to know the nesting. */
  const summonedShrine = summonedShrineList(data);
  if (hasCollection(summonedShrine)) {
    prepared.unit_storage_list = recordCollection(summonedShrine)
      .filter((record) => !isEmptyStorageRecord(record));
  }
  const normalShrine = normalShrineList(data);
  if (hasCollection(normalShrine)) {
    prepared.unit_storage_normal_list = recordCollection(normalShrine);
  }
  if (hasCollection(data.inventory_info)) {
    prepared.inventory_info = recordCollection(data.inventory_info);
  }
  return prepared;
}

function removeExcludedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeExcludedKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !excludedKeys.has(key))
    .map(([key, entry]) => [key, removeExcludedKeys(entry)]));
}

function readHelperSession(value: unknown): HelperSession | undefined | null {
  if (value === undefined) return undefined;
  return isRecord(value) && typeof value.instanceId === 'string' && value.instanceId.length > 0
    && typeof value.sessionId === 'number' && Number.isSafeInteger(value.sessionId) && value.sessionId > 0
    ? { instanceId: value.instanceId, sessionId: value.sessionId } : null;
}

/** The stored form of an accepted import: its observation and local choices, never what derives from them. */
export function storedGame(game: ImportedGame): StoredGame {
  return {
    fileName: game.fileName, importedAt: game.importedAt, data: game.data, coverage: game.coverage,
    ...(game.helperSession ? { helperSession: game.helperSession } : {}),
    ...(game.localChanges ? { localChanges: game.localChanges } : {}),
    ...(game.runeLocks ? { runeLocks: game.runeLocks } : {}),
  };
}

/**
 * Read a stored import back through the same validation a fresh one passes. The
 * observation and its capture facts are the account and are taken whole or not
 * at all; the local choices made against it are read one field at a time, so a
 * malformed lock costs that lock and never the account (`AGENTS.md` §0).
 */
export function readStoredGame(value: unknown): ImportedGame | null {
  if (!isRecord(value)) return null;
  const helperSession = readHelperSession(value.helperSession);
  const coverage = readCaptureCoverage(value.coverage);
  if (typeof value.fileName !== 'string' || value.fileName.length === 0
    || typeof value.importedAt !== 'string' || !Number.isFinite(Date.parse(value.importedAt))
    || helperSession === null || coverage === null || !isRecord(value.data)) return null;
  const report = validateGameFile(value.data);
  if (!report.valid) return null;
  const localChanges = readLocalAccountChanges(value.localChanges);
  const runeLocks = readRuneLocks(value.runeLocks);
  return withAccountSnapshot({
    fileName: value.fileName, importedAt: value.importedAt, data: value.data, coverage, report,
    ...(helperSession ? { helperSession } : {}),
    ...(localChanges ? { localChanges } : {}),
    ...(runeLocks ? { runeLocks } : {}),
  });
}

/* The snapshot is rebuilt only when the observation it reads changed: a lock or
   a local-change record leaves `data` the same object and the snapshot with it. */
const snapshots = new WeakMap<object, AccountSnapshot>();

/** The game with its typed snapshot read from its current data. */
export function withAccountSnapshot(game: Omit<ImportedGame, 'snapshot'> & { snapshot?: AccountSnapshot }): ImportedGame {
  const held = snapshots.get(game.data);
  if (held && game.snapshot === held) return game as ImportedGame;
  const snapshot = held ?? buildAccountSnapshot(game.data, game.importedAt, game.fileName, game.helperSession, game.coverage);
  snapshots.set(game.data, snapshot);
  return { ...game, snapshot };
}

export function validateGameFile(value: unknown): ImportReport {
  if (!isRecord(value)) {
    const issue = directImportIssue('not-an-object', 'root', '$', 'The import root is not an object.');
    return { valid: false, message: importMessage(issue), knownSections: [], unknownMonsterIds: [], issues: [issue] };
  }
  const knownSections = expectedSections.filter((section) => hasCollection(section === 'unit_storage_list' ? summonedShrineList(value)
    : section === 'unit_storage_normal_list' ? normalShrineList(value) : value[section]));
  if (!hasCollection(value.unit_list) || !hasCollection(value.runes)) {
    const collection = !hasCollection(value.unit_list) ? 'unit_list' : 'runes';
    const issue = directImportIssue('missing-core-lists', collection, collection,
      `The required ${collection === 'unit_list' ? 'monster' : 'rune'} collection is missing or is not an array.`);
    return { valid: false, message: importMessage(issue), knownSections, unknownMonsterIds: [], issues: [issue] };
  }
  const collectionIssue = validateAccountCollections(value);
  if (collectionIssue) {
    return { valid: false, message: importMessage(collectionIssue), knownSections, unknownMonsterIds: [], issues: [collectionIssue] };
  }
  const unknownMonsterIds = [...new Set([
    ...recordCollection(value.unit_list),
    ...shrineMonsterRecords(value),
  ]
    .map((monster) => String(monster.unit_master_id))
    .filter((id) => id !== 'undefined' && !hasMonsterCatalogEntry(id)))];
  return { valid: true, message: 'Ready to import.', knownSections, unknownMonsterIds, issues: [] };
}

export function createImportedGame(fileName: string, data: Record<string, unknown>, report: ImportReport, helperSession?: HelperSession,
  coverage: CaptureCoverage = completeCoverage): ImportedGame {
  const importedAt = new Date().toISOString();
  const prepared = completeEngravedCollections(removeExcludedKeys(data) as GameRecord);
  return withAccountSnapshot({
    fileName, importedAt, data: prepared, coverage, report,
    ...(helperSession ? { helperSession } : {}),
  });
}

function monsterCopy(record: GameRecord): MonsterCopy | null {
  const unitId = record.unit_id;
  const speciesId = record.unit_master_id;
  if ((typeof unitId !== 'number' && typeof unitId !== 'string')
    || (typeof speciesId !== 'number' && typeof speciesId !== 'string')) return null;
  const number = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
  return {
    id: String(unitId), speciesId: String(speciesId),
    name: typeof record.name === 'string' ? record.name : null,
    element: typeof record.attribute === 'string' ? record.attribute : null,
    level: number(record.unit_level), grade: number(record.class), record,
  };
}

function buildAccountSnapshot(data: GameRecord, importedAt: string, fileName: string, helperSession: HelperSession | undefined,
  coverage: CaptureCoverage): AccountSnapshot {
  const units = recordCollection(data.unit_list);
  const monsters = units.map(monsterCopy).filter((entry): entry is MonsterCopy => entry !== null);
  const normalShrine = normalShrineRecords(data).map(monsterCopy).filter((entry): entry is MonsterCopy => entry !== null);
  const summonedShrine: SummonedStack[] = summonedShrineRecords(data).flatMap((record) => {
    const speciesId = record.unit_master_id;
    const quantity = record.quantity;
    return (typeof speciesId === 'number' || typeof speciesId === 'string') && typeof quantity === 'number'
      ? [{ speciesId: String(speciesId), quantity, grade: typeof record.class === 'number' ? record.class : null, record }]
      : [];
  });
  const presets = readPresets(data, []);
  return {
    accountId: isPositiveIdentifier(data.wizard_id) ? String(data.wizard_id) : null,
    importedAt,
    source: helperSession ? { kind: 'helper', instanceId: helperSession.instanceId, sessionId: helperSession.sessionId } : { kind: 'file', fileName },
    monsters, normalShrine, summonedShrine,
    runes: readRunes(data), artifacts: readArtifacts(data), relics: readRelics(data),
    craftItems: readCraftItems(data), conversionStones: readEngravedConversionStones(data),
    counts: accountCounts(data), buildings: readBuildingBonuses(data), skyTribeTotem: readSkyTribeTotem(data),
    presets, scenario: presets.find((preset) => preset.kind === 'scenario') ?? null,
    coverage,
  };
}
