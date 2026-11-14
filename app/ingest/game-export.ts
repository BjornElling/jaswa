import type { HelperSession, ImportReport, ImportedGame } from '../domain/model';
import { readArtifact, readArtifacts } from '../domain/artifacts/artifacts';
import { readRelic, readRelics, relicEngravingProblem } from '../domain/relics/relics';
import { isReadableEngravedConversionStone, readEngravedConversionStones } from '../domain/artifacts/artifact-conversion-stones';
import { readCraftItem, readCraftItems } from '../domain/runes/craft/rune-craft-items';
import { readRune, readRunes } from '../domain/runes/runes';
import { readDeckPresets } from '../domain/placements/deck-presets';
import { intangibleSetId } from '../domain/combat/monster-stats';
import { hasMonsterCatalogEntry } from '../domain/monsters/monster-catalog';
import { normalShrineList, normalShrineRecords, shrineMonsterRecords, summonedShrineList, summonedShrineRecords } from '../domain/account/sealed-shrine-storage';
import { accountBuildingsProblem, readBuildingBonuses } from '../domain/account/account-buildings';
import type { GameRecord } from '../domain/account/game-record';
import { isAccountSnapshot } from '../domain/account/account-snapshot';
import type { AccountSnapshot, CaptureCoverage, MonsterCopy, SummonedStack } from '../domain/account/account-snapshot';
import { readPresets } from '../domain/placements/presets';

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
   keeps malformed records from becoming a count that no table can honour. */
function isValidIdentifiedCollection(
  value: unknown,
  identifier: string,
  recordCheck: (record: GameRecord) => boolean = () => true,
): value is GameRecord[] {
  if (!Array.isArray(value)) return false;
  const records = value.filter(isRecord);
  if (records.length !== value.length) return false;
  if (!records.every((record) => isPositiveIdentifier(record[identifier]) && recordCheck(record))) return false;
  return new Set(records.map((record) => String(record[identifier]))).size === records.length;
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

/** The game allows one Intangible Rune in a monster's engraved six. */
function hasAtMostOneEngravedIntangible(records: readonly GameRecord[]): boolean {
  const owners = new Set<string>();
  for (const record of records) {
    if (record.set_id !== intangibleSetId || record.occupied_type !== 1) continue;
    const owner = String(record.occupied_id);
    if (owners.has(owner)) return false;
    owners.add(owner);
  }
  return true;
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

/* In Scenario an item is engraved on one monster at most (`DECK-PRESETS.md`
   §1); a list naming it under two would leave its owner to whichever unit was
   read last, so it is refused as a saved deck repeating one is. */
function engravesAnItemTwice(units: readonly GameRecord[], section: 'runes' | 'artifacts', identifier: string): boolean {
  const seen = new Set<string>();
  for (const unit of units) {
    for (const item of recordCollection(unit[section])) {
      const id = String(item[identifier]);
      if (seen.has(id)) return true;
      seen.add(id);
    }
  }
  return false;
}

/**
 * Whether an item's own record in the account list and the monsters' gear lists
 * disagree about where it is. Scenario reads the gear lists, a rune's location
 * reads its record, so a disagreement showed an inventory rune as engraved on a
 * monster that did not carry it while every rule treated it as free. A game
 * export never disagrees; a prepared account repeats each engraved item in the
 * account list with the same placement, which agrees.
 */
function misplacesAnItem(value: GameRecord, units: readonly GameRecord[], section: 'runes' | 'artifacts', identifier: string): boolean {
  const carrier = new Map<string, string>();
  for (const unit of units) {
    for (const item of recordCollection(unit[section])) carrier.set(String(item[identifier]), String(unit.unit_id));
  }
  return recordCollection(value[section]).some((item) => {
    const engraved = section === 'runes' ? item.occupied_type === 1 : Number(item.occupied_id) > 0;
    const on = carrier.get(String(item[identifier]));
    return engraved ? on !== String(item.occupied_id) : on !== undefined;
  });
}

function validateAccountCollections(value: GameRecord): string | undefined {
  if (!isValidIdentifiedCollection(value.unit_list, 'unit_id', isValidUnitRecord)) {
    return 'This file contains a monster JASWA cannot read.';
  }
  if (!isValidIdentifiedCollection(value.runes, 'rune_id', isValidRuneRecord)) {
    return 'This file contains a rune JASWA cannot read.';
  }
  if (!hasAtMostOneEngravedIntangible(recordCollection(value.runes))) {
    return 'This file has more than one Intangible Rune engraved on one monster.';
  }
  try {
    readDeckPresets(value);
  } catch (error) {
    return error instanceof Error ? error.message : 'This account contains a Deck Preset JASWA cannot read.';
  }
  /* Each tab is checked where the account carries it, nested or at the root,
     because that same list is what the import publishes, counts and shows. */
  const summonedShrine = summonedShrineList(value);
  if (summonedShrine !== undefined && !isValidIdentifiedCollection(summonedShrine, 'unit_master_id', isValidImportedStorageRecord)) {
    return 'This file contains a sealed-shrine monster JASWA cannot read.';
  }
  const normalShrine = normalShrineList(value);
  if (normalShrine !== undefined && !isValidIdentifiedCollection(normalShrine, 'unit_id', isValidUnitRecord)) {
    return 'This file contains a sealed-shrine monster JASWA cannot read.';
  }

  const units = recordCollection(value.unit_list);
  const normalStorageUnits = recordCollection(normalShrine);
  /* Normal Shrine is a location for a unit, not another collection of units.
     A repeated id is contradictory source data: choosing a row to hide would
     make the account total look plausible while leaving its location false. */
  const liveUnitIds = new Set(units.map((unit) => String(unit.unit_id)));
  if (normalStorageUnits.some((unit) => liveUnitIds.has(String(unit.unit_id)))) {
    return 'This file places a monster in Inventory and Sealed Shrine at once.';
  }
  /* A full export normally carries the account wizard id on every owned unit.
     Without this boundary, a battle response can look like a valid monster
     record and add an opponent's LD5 to the account simply because it has a
     positive unit_id and a level. Normal-shrine records are an account-level
     collection, and the game may omit that optional field on those records;
     an explicit different id is still rejected. */
  if (value.wizard_id !== undefined) {
    if (!isPositiveIdentifier(value.wizard_id)) {
      return 'This file contains an invalid account identity.';
    }
    const accountWizardId = String(value.wizard_id);
    if (units.some((unit) => String(unit.wizard_id) !== accountWizardId)
      || normalStorageUnits.some((unit) => unit.wizard_id !== undefined
        && String(unit.wizard_id) !== accountWizardId)) {
      return 'This file contains a monster JASWA cannot verify as belonging to this account.';
    }
  }
  for (const unit of units) {
    if (unit.runes !== undefined && !isValidIdentifiedCollection(unit.runes, 'rune_id', isValidRuneRecord)) {
      return 'This file contains an engraved rune JASWA cannot read.';
    }
    if (unit.runes !== undefined && !hasAtMostOneEngravedIntangible(recordCollection(unit.runes))) {
      return 'This file has more than one Intangible Rune engraved on one monster.';
    }
    if (unit.artifacts !== undefined && !isValidIdentifiedCollection(unit.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null)) {
      return 'This file contains an engraved artifact JASWA cannot read.';
    }
    if (unit.relics !== undefined && !isValidIdentifiedCollection(unit.relics, 'rid', (relic) => readRelic(relic) !== null)) {
      return 'This file contains an engraved relic JASWA cannot read.';
    }
  }
  if (engravesAnItemTwice(units, 'runes', 'rune_id')) {
    return 'This file engraves one rune on two monsters.';
  }
  if (engravesAnItemTwice(units, 'artifacts', 'rid')) {
    return 'This file engraves one artifact on two monsters.';
  }
  if (misplacesAnItem(value, units, 'runes', 'rune_id')) {
    return 'This file places a rune on a monster that does not carry it.';
  }
  if (misplacesAnItem(value, units, 'artifacts', 'rid')) {
    return 'This file places an artifact on a monster that does not carry it.';
  }

  if (value.artifacts !== undefined && !isValidIdentifiedCollection(value.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null)) {
    return 'This file contains an artifact JASWA cannot read.';
  }
  /* Relics are read through the same reader the workspace uses, for the reason
     `AGENTS.md` §0.1 gives: a relic that passes a structural check and then
     cannot be judged is counted, invisible, and worse than rejected. */
  if (value.relics !== undefined && !isValidIdentifiedCollection(value.relics, 'rid', (relic) => readRelic(relic) !== null)) {
    return 'This file contains a relic JASWA cannot read.';
  }
  const relicProblem = relicEngravingProblem(units);
  if (relicProblem) return relicProblem;
  if (value.artifact_crafts !== undefined
    && !isValidIdentifiedCollection(value.artifact_crafts, 'rid', isReadableEngravedConversionStone)) {
    return 'This file contains an engraved conversion stone JASWA cannot read.';
  }
  if (value.rune_craft_item_list !== undefined
    && !isValidIdentifiedCollection(value.rune_craft_item_list, 'craft_item_id', isValidCraftRecord)) {
    return 'This file contains an invalid craft-item collection.';
  }
  /* The buildings move every combat speed and every stat they
     touch, so a building list that cannot say a level is refused rather than
     read as "no building". */
  return accountBuildingsProblem(value);
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

function isImportReport(value: unknown): value is ImportReport {
  return isRecord(value)
    && typeof value.valid === 'boolean'
    && typeof value.message === 'string'
    && Array.isArray(value.knownSections) && value.knownSections.every((entry) => typeof entry === 'string')
    && Array.isArray(value.unknownMonsterIds) && value.unknownMonsterIds.every((entry) => typeof entry === 'string');
}

/** Accept only a complete game record. */
export function isValidImportedGame(value: unknown): value is ImportedGame {
  if (!isRecord(value)) return false;
  const helperSession = value.helperSession === undefined || (isRecord(value.helperSession)
    && typeof value.helperSession.instanceId === 'string' && value.helperSession.instanceId.length > 0
    && typeof value.helperSession.sessionId === 'number' && Number.isSafeInteger(value.helperSession.sessionId) && value.helperSession.sessionId > 0);
  return typeof value.fileName === 'string' && value.fileName.length > 0
    && typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt))
    && isRecord(value.data) && validateGameFile(value.data).valid
    && isAccountSnapshot(value.snapshot)
    && isImportReport(value.report)
    && helperSession;
}

export function validateGameFile(value: unknown): ImportReport {
  if (!isRecord(value)) return { valid: false, message: 'This is not a valid Summoners War JSON file.', knownSections: [], unknownMonsterIds: [] };
  const knownSections = expectedSections.filter((section) => hasCollection(section === 'unit_storage_list' ? summonedShrineList(value)
    : section === 'unit_storage_normal_list' ? normalShrineList(value) : value[section]));
  if (!hasCollection(value.unit_list) || !hasCollection(value.runes)) {
    return { valid: false, message: 'This file does not contain the monster and rune lists needed by JASWA.', knownSections, unknownMonsterIds: [] };
  }
  const collectionError = validateAccountCollections(value);
  if (collectionError) return { valid: false, message: collectionError, knownSections, unknownMonsterIds: [] };
  const unknownMonsterIds = [...new Set([
    ...recordCollection(value.unit_list),
    ...shrineMonsterRecords(value),
  ]
    .map((monster) => String(monster.unit_master_id))
    .filter((id) => id !== 'undefined' && !hasMonsterCatalogEntry(id)))];
  return { valid: true, message: 'Ready to import.', knownSections, unknownMonsterIds };
}

export function createImportedGame(fileName: string, data: Record<string, unknown>, report: ImportReport, helperSession?: HelperSession,
  coverage: CaptureCoverage = { complete: true, misses: [] }): ImportedGame {
  const importedAt = new Date().toISOString();
  const prepared = completeEngravedCollections(removeExcludedKeys(data) as GameRecord);
  return {
    fileName, importedAt, data: prepared,
    snapshot: buildAccountSnapshot(prepared, importedAt, fileName, helperSession, coverage),
    report,
    ...(helperSession ? { helperSession } : {}),
  };
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

export function buildAccountSnapshot(data: GameRecord, importedAt: string, fileName: string, helperSession?: HelperSession,
  coverage: CaptureCoverage = { complete: true, misses: [] }): AccountSnapshot {
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
    buildings: readBuildingBonuses(data), presets, scenario: presets.find((preset) => preset.kind === 'scenario') ?? null,
    coverage,
  };
}

