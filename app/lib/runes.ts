/**
 * The account's runes, read once into the shape the workspaces judge.
 *
 * The export states a rune twice — once in the account's own `runes` list and
 * once under whichever monster wears it — and `completeEquipmentCollections`
 * has already merged and de-duplicated the two on `rune_id`. This reads that
 * one list, so a rune can never be counted in a total and missing from a table.
 *
 * Every rule encoded here is stated in `docs/RUNE-CANONICAL.md`; none of it is
 * inferred from the export. Where the document leaves something open, this
 * module says so rather than picking a value.
 */
import type { GameRecord } from './game-data';
import { runeSetName } from './rune-sets';

/**
 * The eleven stats a rune property can carry, in the game's own words
 * (`RUNE-CANONICAL.md` §2). Effect 7 is deliberately absent: it is not a valid
 * rune property in any observed export and code may not invent one.
 */
export const runeStatNames: Readonly<Record<number, string>> = {
  1: 'HP +', 2: 'HP %', 3: 'ATK +', 4: 'ATK %', 5: 'DEF +', 6: 'DEF %',
  8: 'SPD', 9: 'CRI Rate', 10: 'CRI Dmg', 11: 'Resistance', 12: 'Accuracy',
};

/** The same eleven, in the order the game's own property list reads. */
export const runeStatIds: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

export function runeStatName(id: number): string | undefined {
  return runeStatNames[id];
}

/** The level at which a rune becomes eligible for an Enchanted Gem (§8). */
export const gemMinimumLevel = 12;

/** The highest power-up level a rune can reach. */
export const runeMaximumLevel = 15;

/**
 * Sub-property types that can never appear in a slot, over and above the ban on
 * repeating the main or prefix property (`RUNE-CANONICAL.md` §5). Slots 2, 4
 * and 6 choose their own main property and so have nothing fixed to forbid.
 */
const forbiddenSubStats: Readonly<Record<number, readonly number[]>> = {
  1: [3, 5, 6],
  3: [5, 3, 4],
  5: [1],
};

/** Whether a slot may carry this sub-property type at all, before the rune's
    own main, prefix and other sub properties are considered. */
export function slotAllowsSubStat(slot: number, statId: number): boolean {
  return !forbiddenSubStats[slot]?.includes(statId);
}

/**
 * One of a rune's up to four sub properties.
 *
 * `value` and `grind` stay apart because the two are different facts: `value`
 * is the roll (or the value an Enchanted Gem put there) and `grind` is the
 * separate Grindstone bonus sitting on top of it (§8). The stat the game shows
 * is their sum, which is what `runeSubValue` returns — adding them at read time
 * would make a later grindstone impossible to model.
 */
export type RuneSubProperty = {
  statId: number;
  /** The roll, or the value an Enchanted Gem gave this property. */
  value: number;
  /** This property came from an Enchanted Gem. */
  gemmed: boolean;
  /** The Grindstone bonus already applied, `0` when none has been. */
  grind: number;
};

export const runeSubValue = (property: RuneSubProperty): number => property.value + property.grind;

export type Rune = {
  id: string;
  setId: number;
  setName: string;
  /** `1`–`6`. */
  slot: number;
  /** Star class, `1`–`6`. An Ancient rune is a six-star rune (§7). */
  stars: number;
  /** From Dimension Hole; takes Ancient craft items and no others (§7). */
  ancient: boolean;
  /** Power-up level, `0`–`15`. */
  level: number;
  mainStatId: number;
  mainValue: number;
  /** The innate property, or `null` where the rune has none (§4). */
  prefixStatId: number | null;
  prefixValue: number;
  subProperties: RuneSubProperty[];
  /** The `unit_id` wearing it, or `null` while it sits in inventory. */
  occupiedId: string | null;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wholeInRange(value: unknown, lowest: number, highest: number): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < lowest || parsed > highest) return null;
  return parsed;
}

/** A property triple or quadruple as the export writes it (§8). */
function readProperty(value: unknown): RuneSubProperty | null {
  if (!Array.isArray(value)) return null;
  const statId = numberOrNull(value[0]);
  const amount = numberOrNull(value[1]);
  if (statId === null || amount === null || amount < 0) return null;
  if (!runeStatNames[statId]) return null;
  const grind = numberOrNull(value[3]) ?? 0;
  return {
    statId,
    value: amount,
    gemmed: Boolean(numberOrNull(value[2])),
    grind: grind > 0 ? grind : 0,
  };
}

/**
 * One rune from the export, or `null` when the record does not satisfy the
 * current contract.
 *
 * Rejection is loud on purpose (`AGENTS.md` §0.1). A rune this reader could not
 * understand but the import counted would be invisible: present in the account
 * total, absent from every table, and surfaced by nothing.
 *
 * `prefix_eff` is the one field written both ways. A rune without an innate
 * property carries `[0, 0]` rather than omitting the field, so a zero stat id
 * is *absence* and not a malformed record.
 */
export function readRune(record: unknown): Rune | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const source = record as GameRecord;

  const id = numberOrNull(source.rune_id);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;

  const setId = numberOrNull(source.set_id);
  const setName = runeSetName(setId);
  if (setId === null || !setName) return null;

  const slot = wholeInRange(source.slot_no, 1, 6);
  const level = wholeInRange(source.upgrade_curr, 0, runeMaximumLevel);
  if (slot === null || level === null) return null;

  /* `16` is the Ancient marker rather than a seventeenth star class (§7), so it
     is read as a six-star rune that takes Ancient craft items. */
  const starClass = numberOrNull(source.class);
  if (starClass === null || (starClass !== 16 && (!Number.isInteger(starClass) || starClass < 1 || starClass > 6))) return null;

  const main = readProperty(source.pri_eff);
  if (!main) return null;

  const prefix = Array.isArray(source.prefix_eff) && numberOrNull(source.prefix_eff[0]) !== 0
    ? readProperty(source.prefix_eff)
    : null;
  if (Array.isArray(source.prefix_eff) && numberOrNull(source.prefix_eff[0]) !== 0 && !prefix) return null;

  const rawSubs = source.sec_eff;
  if (rawSubs !== undefined && !Array.isArray(rawSubs)) return null;
  const subProperties: RuneSubProperty[] = [];
  for (const entry of Array.isArray(rawSubs) ? rawSubs : []) {
    const property = readProperty(entry);
    if (!property) return null;
    subProperties.push(property);
  }

  /* `occupied_type` is `1` for a rune a monster wears and `2` for one in
     inventory. Anything else is a placement JASWA does not model, and a rune
     whose location is unknown cannot be offered as a target. */
  const occupiedType = numberOrNull(source.occupied_type);
  if (occupiedType !== 1 && occupiedType !== 2) return null;
  const occupiedId = numberOrNull(source.occupied_id);
  if (occupiedType === 1 && (occupiedId === null || occupiedId <= 0)) return null;

  return {
    id: String(id),
    setId,
    setName,
    slot,
    stars: starClass === 16 ? 6 : starClass,
    ancient: starClass === 16,
    level,
    mainStatId: main.statId,
    mainValue: main.value,
    prefixStatId: prefix?.statId ?? null,
    prefixValue: prefix?.value ?? 0,
    subProperties,
    occupiedId: occupiedType === 1 && occupiedId !== null ? String(occupiedId) : null,
  };
}

/** Every rune on the account, in the order the prepared import lists them. */
export function readRunes(data: GameRecord | undefined): Rune[] {
  const records = data?.runes;
  if (!Array.isArray(records)) return [];
  const runes: Rune[] = [];
  for (const record of records) {
    const rune = readRune(record);
    if (rune) runes.push(rune);
  }
  return runes;
}

/** `Violent · Slot 4`, the short identity every table leads a rune with. */
export function runeLabel(rune: Rune): string {
  return `${rune.ancient ? 'Ancient ' : ''}${rune.setName} · Slot ${rune.slot}`;
}
