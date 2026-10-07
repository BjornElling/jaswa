import type { GameRecord } from './game-data';
import { canEngraveRelics } from './monster-engrave-eligibility';
import {
  relicMainProperties, relicMaximumDurability, relicMaximumLevel, relicProperty,
} from './relic-properties';
import type { RelicMainProperty, RelicPropertyDefinition } from './relic-properties';

/**
 * One relic's unique property as the export states it: which family, how much
 * it grants, and how much of the source stat one unit of that grant costs.
 *
 * The export writes the triple `[type, threshold, percent]`, and the game reads
 * it as "*grant* +`percent` % per `threshold` *source stat* at the start of
 * battle". Both numbers move with the power-up level, so they are the unique
 * property's strength at the relic's current level and not a fixed property of
 * the family.
 */
export type RelicUniqueProperty = {
  definition: RelicPropertyDefinition;
  /** How much of the source stat buys one step of the grant. */
  threshold: number;
  /** Percentage points granted per threshold. */
  percent: number;
};

export type Relic = {
  id: string;
  mainProperty: RelicMainProperty;
  /** Percentage points the main property grants at the current level. */
  mainPercent: number;
  unique: RelicUniqueProperty;
  /** Power-up level, `0`–`15`. */
  level: number;
  /**
   * Power-up attempts this relic can still fail, `0`–`3`. At zero it can never
   * be levelled again, whatever its level — which is the single fact that
   * separates a relic that is merely low from one that is finished.
   */
  durability: number;
  locked: boolean;
  /**
   * The account's acquisition sequence, read from `rid` for the same reason
   * `Artifact.obtainedOrder` is (`artifacts.ts`): the export issues the ids in
   * ascending order of acquisition and no relic record carries anything better.
   */
  obtainedOrder: number;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wholeInRange(value: unknown, lowest: number, highest: number): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < lowest || parsed > highest) return null;
  return parsed;
}

/**
 * One relic from the export, or `null` when the record does not satisfy the
 * current contract.
 *
 * Every rejection here is a loud one by design (`AGENTS.md` §0.1): a relic is
 * engraved on up to `relicEngravingLimit` monsters, so a half-read one would
 * carry a wrong judgement across the whole roster rather than spoiling a single
 * slot.
 *
 * The unique property is the field worth naming. The export states its family
 * twice — once as the record's `type` and once as the first member of
 * `sec_effect` — and every relic this account has ever held agrees with itself.
 * A record where the two disagree is not a relic JASWA knows how to read, so it
 * fails rather than picking a side.
 */
export function readRelic(record: unknown): Relic | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const source = record as GameRecord;

  const id = numberOrNull(source.rid);
  if (id === null || !Number.isSafeInteger(id)) return null;

  const primary = source.pri_effect;
  if (!Array.isArray(primary)) return null;
  const mainProperty = relicMainProperties[numberOrNull(primary[0]) ?? -1];
  const mainPercent = wholeInRange(primary[1], 0, 100);
  if (!mainProperty || mainPercent === null) return null;

  const secondary = source.sec_effect;
  if (!Array.isArray(secondary)) return null;
  const definition = relicProperty(numberOrNull(secondary[0]));
  const threshold = numberOrNull(secondary[1]);
  const percent = numberOrNull(secondary[2]);
  if (!definition || threshold === null || threshold <= 0 || percent === null || percent <= 0) return null;
  /* The record states the family twice; disagreement means JASWA has misread
     one of the two fields and must not guess which. */
  if (numberOrNull(source.type) !== definition.id) return null;

  const level = wholeInRange(source.upgrade_curr, 0, relicMaximumLevel);
  const durability = wholeInRange(source.durability, 0, relicMaximumDurability);
  if (level === null || durability === null) return null;

  return {
    id: String(id),
    mainProperty,
    mainPercent,
    unique: { definition, threshold, percent },
    level,
    durability,
    locked: Boolean(numberOrNull(source.locked)),
    obtainedOrder: id,
  };
}

/**
 * Every relic on the account. `completeEngravedCollections` has already merged
 * the engraved copies into `data.relics` and de-duplicated them on `rid`, so
 * this reads that one list.
 */
export function readRelics(data: GameRecord | undefined): Relic[] {
  const records = data?.relics;
  if (!Array.isArray(records)) return [];
  const relics: Relic[] = [];
  for (const record of records) {
    const relic = readRelic(record);
    if (relic) relics.push(relic);
  }
  return relics;
}

/**
 * The one inventory record the game uses for Relic Power-up Stones. It is kept
 * separate from rune craft items: a stone is an account material, not a gem or
 * grindstone stack.
 */
const relicPowerUpStoneInventoryItem = { masterType: 6, masterId: 19 } as const;

/**
 * The current number of Relic Power-up Stones, or `undefined` when this import
 * did not carry the account-inventory collection. An explicitly present list
 * without the record is an exact zero; a malformed or duplicated record stays
 * unknown rather than being repaired into a number.
 */
export function relicPowerUpStoneCount(data: GameRecord | undefined): number | undefined {
  const inventory = data?.inventory_info;
  if (!Array.isArray(inventory)) return undefined;
  const stones = inventory.filter((entry): entry is GameRecord => Boolean(entry)
    && typeof entry === 'object' && !Array.isArray(entry)
    && entry.item_master_type === relicPowerUpStoneInventoryItem.masterType
    && entry.item_master_id === relicPowerUpStoneInventoryItem.masterId);
  if (stones.length === 0) return 0;
  if (stones.length !== 1) return undefined;
  const quantity = stones[0].item_quantity;
  return typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : undefined;
}

/**
 * How many monsters each relic is engraved on, keyed by relic id.
 *
 * A relic is not gear the way a rune is. The game engraves one relic on
 * many monsters at once, so the export references the same `rid` from every
 * monster and the relic record itself names no owner — there is no
 * `occupied_id` to read. The count therefore comes from walking the roster,
 * and a relic engraved on nobody is simply absent from the map.
 */
export function relicEngravingCounts(monsters: readonly GameRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const monster of monsters) {
    if (!canEngraveRelics(monster)) continue;
    if (!Array.isArray(monster.relics)) continue;
    /* One monster cannot have the same relic engraved twice, but the export is a file
       the user can hand over, so a repeated id counts once rather than
       inflating the reach of a relic. */
    const seen = new Set<string>();
    for (const entry of monster.relics) {
      const id = numberOrNull((entry as GameRecord | null)?.rid);
      if (id === null || seen.has(String(id))) continue;
      seen.add(String(id));
      counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
    }
  }
  return counts;
}
