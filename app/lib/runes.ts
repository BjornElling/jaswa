/**
 * The account's runes, read once into the shape the workspaces judge.
 *
 * The export states a rune twice — once in the account's own `runes` list and
 * once under whichever monster it is engraved on — and `completeEngravedCollections`
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

/** The stats written as a percentage — §2's percent and percentage-point forms. */
const percentStatIds: ReadonlySet<number> = new Set([2, 4, 6, 9, 10, 11, 12]);

/**
 * A rune line as the game writes it: `ATK +33%`, `SPD +10`. The stat is named
 * bare and the figure carries the form — the sign in front, the percent sign
 * after — so `HP +` and `HP %`, which name a *kind* of stat in a filter, do not
 * also stand on a line where the figure already says which one it is.
 */
export function runeLineStat(id: number): string | undefined {
  return runeStatNames[id]?.replace(/ [+%]$/, '');
}

/** The figure without its sign, for a value that is a result rather than an addition — what a Gem rolls. */
export function runeLineValue(id: number, value: number, format: (value: number) => string = String): string {
  return `${format(value)}${percentStatIds.has(id) ? '%' : ''}`;
}

export function runeLineFigure(id: number, value: number, format: (value: number) => string = String): string {
  return `+${runeLineValue(id, value, format)}`;
}

export function runeLineText(id: number, value: number): string {
  return `${runeLineStat(id) ?? '?'} ${runeLineFigure(id, value)}`;
}

/** The level at which a rune becomes eligible for an Enchanted Gem (§8). */
export const gemMinimumLevel = 12;

/** The highest power-up level a rune can reach. */
export const runeMaximumLevel = 15;

/** The level every rune projection describes when its main stat is complete. */
export const runeProjectionLevel = runeMaximumLevel;

/**
 * Rarity — how rare a rune was when it dropped, which fixes how many
 * Sub Properties it dropped with and never changes afterwards
 * (`RUNE-CANONICAL.md` §6).
 *
 * It is a separate fact from the star class, and §1 keeps the two apart in its
 * vocabulary: *grade* is the star class (`class`), *rarity* is this
 * (`extra`). The names here follow the document.
 *
 * This is what the game's own "Grade" sort orders by, despite the vocabulary —
 * the panel's heading names the rarity, not the star class (§11.1).
 */
export const runeRarities = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'] as const;

export type RuneRarity = typeof runeRarities[number];

/**
 * `extra` as the export writes it, for an ordinary rune and for an Ancient one
 * (§6). SWEX uses `0` and `1` for Normal in the wild; the remaining ordinary
 * values are one step apart. Some export paths use the Ancient values offset
 * by ten, so both encodings are accepted here. `rank` is deliberately absent:
 * it is commonly `5` on every six-star rune and is not the rune's rarity.
 */
const rarityByExportValue: Readonly<Record<number, RuneRarity>> = {
  0: 'Normal', 1: 'Normal', 2: 'Magic', 3: 'Rare', 4: 'Hero', 5: 'Legend',
  11: 'Normal', 12: 'Magic', 13: 'Rare', 14: 'Hero', 15: 'Legend',
};

/**
 * How the five rarities rank against each other, lowest first — the order the
 * table above is written in, which is the order the game's own Grade sort reads
 * (`RUNE-CANONICAL.md` §11.1).
 *
 * **It is also the number of sub properties a rune of that grade is born with**, and
 * several callers read it that way — `remainingEvents` most of all, which turns it
 * into the whole schedule of what a rune may still gain. That is not a coincidence
 * the game guarantees, it is a property of the order `runeRarities` is written
 * in. Reordering that list therefore changes the event schedule, not just a sort.
 */
export const runeRarityOrder = (grade: RuneRarity): number =>
  runeRarities.indexOf(grade);

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

/** Which main properties the game allows in each rune slot (§3). */
export const slotMainProperties: Readonly<Record<number, readonly number[]>> = {
  1: [3],
  2: [1, 2, 3, 4, 5, 6, 8],
  3: [5],
  4: [1, 2, 3, 4, 5, 6, 9, 10],
  5: [1],
  6: [1, 2, 3, 4, 5, 6, 11, 12],
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
  /** Exact natural upgrade count when a simulated rune supplies the history. */
  rolls?: number;
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
  /**
   * Rarity — how rare it was when it dropped, which fixed its starting Sub
   * Property count and never changes (§6). A separate fact from `stars`: a 6★
   * rune can be any of the five.
   */
  rarity: RuneRarity;
  /** Power-up level, `0`–`15`. */
  level: number;
  mainStatId: number;
  mainValue: number;
  /** The innate property, or `null` where the rune has none (§4). */
  prefixStatId: number | null;
  prefixValue: number;
  subProperties: RuneSubProperty[];
  /** The `unit_id` it is engraved on, or `null` while it sits in inventory. */
  occupiedId: string | null;
  /**
   * The account's acquisition sequence, read from `rune_id` for the same reason
   * `Artifact.obtainedOrder` and `Relic.obtainedOrder` are: the export issues
   * the ids in ascending order of acquisition and no rune record carries
   * anything better. `date_add` is not it — the game grants runes in bulk and
   * the field resolves only to the second, so inside one grant it decides
   * nothing and rows fall back to import order, which is not the order the game
   * shows.
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

/** A property triple or quadruple as the export writes it (§8). */
function readProperty(value: unknown): RuneSubProperty | null {
  if (!Array.isArray(value)) return null;
  const statId = numberOrNull(value[0]);
  const amount = numberOrNull(value[1]);
  if (statId === null || !Number.isInteger(statId)
    || amount === null || !Number.isInteger(amount) || amount < 0) return null;
  if (!runeStatNames[statId]) return null;
  const gemMarker = value.length > 2 ? numberOrNull(value[2]) : 0;
  const grind = value.length > 3 ? numberOrNull(value[3]) : 0;
  if (gemMarker === null || !Number.isInteger(gemMarker) || (gemMarker !== 0 && gemMarker !== 1)
    || grind === null || !Number.isInteger(grind) || grind < 0) return null;
  return {
    statId,
    value: amount,
    gemmed: gemMarker === 1,
    grind,
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

  /* The rarity comes from `extra`, not `rank`. The latter is not a quality
     field in SWEX and is often `5` for every six-star rune. The rarity is
     rejected rather than defaulted when the table does not cover
     it (`AGENTS.md` §0.1): a rune counted in the account total but carrying an
     invented grade would sort into a position the game never puts it in, and
     nothing on screen would say so. */
  const exportGrade = numberOrNull(source.extra);
  const rarity = exportGrade === null ? undefined : rarityByExportValue[exportGrade];
  if (!rarity) return null;

  const main = readProperty(source.pri_eff);
  if (!main) return null;
  if (!slotMainProperties[slot]?.includes(main.statId)) return null;

  const prefix = Array.isArray(source.prefix_eff) && numberOrNull(source.prefix_eff[0]) !== 0
    ? readProperty(source.prefix_eff)
    : null;
  if (Array.isArray(source.prefix_eff) && numberOrNull(source.prefix_eff[0]) !== 0 && !prefix) return null;
  const usedStats = new Set<number>([main.statId]);
  if (prefix) {
    if (!slotAllowsSubStat(slot, prefix.statId) || usedStats.has(prefix.statId)) return null;
    usedStats.add(prefix.statId);
  }

  const rawSubs = source.sec_eff;
  if (rawSubs !== undefined && !Array.isArray(rawSubs)) return null;
  const subProperties: RuneSubProperty[] = [];
  for (const entry of Array.isArray(rawSubs) ? rawSubs : []) {
    const property = readProperty(entry);
    if (!property) return null;
    if (!slotAllowsSubStat(slot, property.statId) || usedStats.has(property.statId)) return null;
    usedStats.add(property.statId);
    subProperties.push(property);
  }
  if (subProperties.length > 4) return null;

  /* `occupied_type` is `1` for a rune engraved on a monster and `2` for one in
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
    rarity,
    level,
    mainStatId: main.statId,
    mainValue: main.value,
    prefixStatId: prefix?.statId ?? null,
    prefixValue: prefix?.value ?? 0,
    subProperties,
    occupiedId: occupiedType === 1 && occupiedId !== null ? String(occupiedId) : null,
    obtainedOrder: id,
  };
}

/** Every rune on the account, in the order the prepared import lists them. */
export function readRunes(data: GameRecord | undefined): Rune[] {
  const records = data?.runes;
  if (!Array.isArray(records)) return [];
  const runes: Rune[] = [];
  for (const record of records) {
    const rune = readRune(record);
    if (!rune) throw new Error('This account contains a rune JASWA cannot read.');
    runes.push(rune);
  }
  return runes;
}
