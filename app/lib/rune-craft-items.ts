/**
 * Enchanted Gems and Grindstones — the account's `rune_craft_item_list`.
 *
 * `ARTIFACT-CANONICAL.md` §15.12 already names this collection from the other
 * side: it is *not* where engraved conversion stones live, and reading its
 * records as artifact properties invents ids such as −487. This module is the
 * positive statement of what they are instead, and `docs/RUNE-CRAFT-ITEMS.md`
 * records the evidence behind every line of it.
 *
 * The 5- or 6-digit `craft_type_id` reads `SS TT GG`:
 *
 * ```text
 *   1 04 04   Hero Energy ATK % item        (set 1, stat 4, grade 4)
 *  13 08 05   Legend Violent SPD item
 *  99 11 05   Legend Immemorial Resistance item
 *   5 11 14   Hero Ancient Rage Resistance item (grade 14 = Ancient Hero)
 * ```
 *
 * and `craft_type` says which of the six items it is. Gems and Grindstones
 * alternate, and the pair repeats for each of the three lineages: a Grindstone
 * may only ever carry one of the seven grindable stats (§8), which is what
 * separates the two halves of each pair in the data itself.
 */
import type { GameRecord } from './game-data';
import type { ItemGrade } from './types';
import { withAncientMark } from './ancient-mark';
import { qualityTiers } from './quality-tiers';
import { runeStatIds, runeStatName } from './runes';
import { runeSetName } from './rune-sets';

/** The five item grades of `docs/RUNE-CANONICAL.md` §8, weakest first: the game's one tier list. */
export const itemGrades: readonly ItemGrade[] = qualityTiers;

/** What the item does to a rune: replace one sub property, or add to one. */
export type CraftKind = 'gem' | 'grindstone';

/**
 * Which runes an item may be spent on (`RUNE-CANONICAL.md` §7, §8, §10).
 *
 * - `standard` must match the rune's own set.
 * - `immemorial` matches every set, Intangible included.
 * - `ancient` may only be spent on an Ancient rune, and an Ancient rune takes
 *   nothing else — an ordinary item is explicitly not a fallback.
 */
export type CraftLineage = 'standard' | 'immemorial' | 'ancient';

/** What one use of an item can roll, both ends included. */
export type CraftValueRange = { minimum: number; maximum: number };

export type CraftItem = {
  /** `craft_item_id`; unique across the collection, which the import enforces. */
  id: string;
  kind: CraftKind;
  lineage: CraftLineage;
  /** `null` on an Immemorial item, which belongs to no set. */
  setId: number | null;
  setName: string | null;
  statId: number;
  statName: string;
  grade: ItemGrade;
  /** The stack's own total. The game groups identical items onto one record. */
  amount: number;
  /**
   * What this item can roll, or `undefined` where no verified range exists.
   *
   * The possible result of one use. Ancient uses its own table — it is not an
   * ordinary item with an optimistic multiplier.
   */
  range: CraftValueRange | undefined;
};

/** The seven stats a Grindstone can carry (`RUNE-CANONICAL.md` §8). */
export const grindableStatIds: readonly number[] = [1, 2, 3, 4, 5, 6, 8];

export const isGrindableStat = (statId: number): boolean => grindableStatIds.includes(statId);

/** The set marker an Immemorial item carries in place of a real rune set. */
const immemorialSetId = 99;

/** Ancient items number their grades ten above the ordinary ranks. */
const ancientGradeOffset = 10;

const craftTypes: Readonly<Record<number, { kind: CraftKind; lineage: CraftLineage }>> = {
  1: { kind: 'gem', lineage: 'standard' },
  2: { kind: 'grindstone', lineage: 'standard' },
  3: { kind: 'gem', lineage: 'immemorial' },
  4: { kind: 'grindstone', lineage: 'immemorial' },
  5: { kind: 'gem', lineage: 'ancient' },
  6: { kind: 'grindstone', lineage: 'ancient' },
};

/* The §8 tables, one row per stat group. A group is the set of stats the game
   gives one row of its own table, so a range is never restated per stat and the
   two tables below can be checked against the document line for line. */
const statGroups: ReadonlyArray<{ key: string; statIds: readonly number[] }> = [
  { key: 'hpFlat', statIds: [1] },
  { key: 'percent', statIds: [2, 4, 6] },
  { key: 'flat', statIds: [3, 5] },
  { key: 'spd', statIds: [8] },
  { key: 'criRate', statIds: [9] },
  { key: 'criDmg', statIds: [10] },
  { key: 'resAcc', statIds: [11, 12] },
];

/** Normal, Magic, Rare, Hero, Legend — in the order of `itemGrades`. */
type GradeRow = readonly [CraftValueRange, CraftValueRange, CraftValueRange, CraftValueRange, CraftValueRange];

const range = (minimum: number, maximum: number): CraftValueRange => ({ minimum, maximum });

const gemRanges: Readonly<Record<string, GradeRow>> = {
  hpFlat: [range(100, 150), range(130, 220), range(200, 310), range(290, 420), range(400, 580)],
  percent: [range(2, 4), range(3, 7), range(5, 9), range(7, 11), range(9, 13)],
  flat: [range(8, 12), range(10, 16), range(15, 23), range(20, 30), range(28, 40)],
  spd: [range(1, 3), range(2, 4), range(3, 6), range(5, 8), range(7, 10)],
  criRate: [range(1, 3), range(2, 4), range(3, 5), range(4, 7), range(6, 9)],
  criDmg: [range(1, 3), range(3, 5), range(4, 6), range(5, 8), range(7, 10)],
  resAcc: [range(2, 4), range(3, 6), range(5, 8), range(6, 9), range(8, 11)],
};

const grindstoneRanges: Readonly<Record<string, GradeRow>> = {
  hpFlat: [range(80, 120), range(100, 200), range(180, 250), range(230, 450), range(430, 550)],
  percent: [range(1, 3), range(2, 5), range(3, 6), range(4, 7), range(5, 10)],
  flat: [range(4, 8), range(6, 12), range(10, 18), range(12, 22), range(18, 30)],
  spd: [range(1, 2), range(1, 2), range(2, 3), range(3, 4), range(4, 5)],
};

/* Ancient items are a separate, measured table rather than normal values plus an
   arbitrary bonus. The ungrindable groups are intentionally absent from the stone
   table: a malformed CRI Rate Grindstone must have no range even if it slipped past
   an importer. `RUNE-CANONICAL.md` §8 holds the source table. */
const ancientGemRanges: Readonly<Record<string, GradeRow>> = {
  hpFlat: [range(100, 210), range(130, 280), range(200, 370), range(290, 480), range(400, 640)],
  percent: [range(2, 6), range(3, 9), range(5, 11), range(7, 13), range(9, 15)],
  flat: [range(8, 16), range(10, 20), range(15, 27), range(20, 34), range(28, 44)],
  spd: [range(1, 4), range(2, 5), range(3, 7), range(5, 9), range(7, 11)],
  criRate: [range(1, 4), range(2, 5), range(3, 6), range(4, 8), range(6, 10)],
  criDmg: [range(2, 6), range(3, 7), range(4, 8), range(5, 10), range(7, 12)],
  resAcc: [range(2, 6), range(3, 8), range(5, 10), range(6, 11), range(8, 13)],
};

const ancientGrindstoneRanges: Readonly<Record<string, GradeRow>> = {
  hpFlat: [range(80, 180), range(100, 260), range(180, 310), range(230, 510), range(430, 610)],
  percent: [range(1, 5), range(2, 7), range(3, 8), range(4, 9), range(5, 12)],
  flat: [range(4, 12), range(6, 16), range(10, 22), range(12, 26), range(18, 34)],
  spd: [range(1, 3), range(1, 3), range(2, 4), range(3, 5), range(4, 6)],
};

function statGroupKey(statId: number): string | undefined {
  return statGroups.find((group) => group.statIds.includes(statId))?.key;
}

/**
 * What an item of this kind, grade and stat can roll — the only place the §8
 * tables are read. `undefined` means the kind/stat pair does not exist (for
 * example a CRI Rate Grindstone), never that an Ancient table was omitted.
 */
export function craftValueRange(
  kind: CraftKind, lineage: CraftLineage, statId: number, grade: ItemGrade,
): CraftValueRange | undefined {
  const key = statGroupKey(statId);
  if (key === undefined) return undefined;
  const table = lineage === 'ancient'
    ? (kind === 'gem' ? ancientGemRanges : ancientGrindstoneRanges)
    : (kind === 'gem' ? gemRanges : grindstoneRanges);
  return table[key]?.[itemGrades.indexOf(grade)];
}

/**
 * Where in an item's range a projection should assume the roll lands. The
 * wording matches the artifact workspace's conversion slider, because the
 * question is the same one: how lucky may a figure on screen assume you got.
 */
export type CraftRollAssumption = 'minimum' | 'one-third' | 'average' | 'two-thirds' | 'three-quarters' | 'maximum';

export const craftRollAssumptions: readonly CraftRollAssumption[] = [
  'minimum', 'one-third', 'average', 'two-thirds', 'three-quarters', 'maximum',
];

/**
 * What a Gem or Grindstone is assumed to roll where nobody has said otherwise:
 * two thirds of the way up, a little luckier than the middle and short of the
 * three quarters a player who is counting on it would hope for.
 */
export const defaultCraftRollAssumption: CraftRollAssumption = 'two-thirds';

export const craftRollLabels: Readonly<Record<CraftRollAssumption, string>> = {
  minimum: 'Worst',
  'one-third': '⅓',
  average: 'Average',
  'two-thirds': '⅔',
  'three-quarters': '¾',
  maximum: 'Best',
};

export const craftRollDescriptions: Readonly<Record<CraftRollAssumption, string>> = {
  minimum: 'the floor of its range',
  'one-third': 'one third of the way up its range',
  average: 'the midpoint of its range',
  'two-thirds': 'two thirds of the way up its range',
  'three-quarters': 'three quarters of the way up its range',
  maximum: 'the best its grade allows',
};

/**
 * The Rune Clean-up stops, in the order used by its sliders. `null` is no item at
 * all. The setting stores the assumption rather than the stop's position, so a
 * stop added to the ladder cannot quietly change what a saved choice means.
 */
export const craftSettingAssumptions: readonly (CraftRollAssumption | null)[] = [
  null, 'one-third', 'average', 'two-thirds', 'three-quarters', 'maximum',
];

/** Round a craft value to a whole number without biasing negative halves inward. */
export function roundAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

const craftRollFractions: Readonly<Record<CraftRollAssumption, number>> = {
  minimum: 0, 'one-third': 1 / 3, average: 0.5, 'two-thirds': 2 / 3, 'three-quarters': 0.75, maximum: 1,
};

/** The value a roll is assumed to land on. Whole, as every rune value is. */
export function craftRollValue(bounds: CraftValueRange, assumption: CraftRollAssumption): number {
  const span = bounds.maximum - bounds.minimum;
  if (assumption === 'minimum') return bounds.minimum;
  if (assumption === 'maximum') return bounds.maximum;
  const fraction = craftRollFractions[assumption];
  return roundAwayFromZero(bounds.minimum + span * fraction);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One craft item from the export, or `null` when the record does not satisfy
 * the current contract.
 *
 * A stack whose `amount` is zero is rejected rather than shown as an item the
 * user does not have: the game leaves emptied stacks behind, and a row saying
 * "×0" is a row nobody can act on.
 */
export function readCraftItem(record: unknown): CraftItem | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const source = record as GameRecord;

  const id = numberOrNull(source.craft_item_id);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;

  const amount = numberOrNull(source.amount);
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) return null;

  const type = craftTypes[numberOrNull(source.craft_type) ?? -1];
  if (!type) return null;

  const code = numberOrNull(source.craft_type_id);
  if (code === null || !Number.isSafeInteger(code) || code <= 0) return null;
  const setCode = Math.floor(code / 10_000);
  const statId = Math.floor(code / 100) % 100;
  const gradeCode = code % 100;

  const statName = runeStatName(statId);
  if (!statName) return null;
  /* A Grindstone may only ever carry a grindable stat. This is the check that
     keeps the two halves of a craft-type pair honest: a record claiming to be a
     Grindstone for CRI Dmg means the type table has been misread, not that the
     game has a stone this app has not heard of. */
  if (type.kind === 'grindstone' && !isGrindableStat(statId)) return null;

  const gradeIndex = (type.lineage === 'ancient' ? gradeCode - ancientGradeOffset : gradeCode) - 1;
  const grade = itemGrades[gradeIndex];
  if (!grade) return null;

  if (type.lineage === 'immemorial') {
    if (setCode !== immemorialSetId) return null;
  } else if (setCode === immemorialSetId || !runeSetName(setCode)) return null;

  const setId = type.lineage === 'immemorial' ? null : setCode;
  return {
    id: String(id),
    kind: type.kind,
    lineage: type.lineage,
    setId,
    setName: setId === null ? null : runeSetName(setId) ?? null,
    statId,
    statName,
    grade,
    amount,
    range: craftValueRange(type.kind, type.lineage, statId, grade),
  };
}

/**
 * Every gem and grindstone on the account, as the export lists them.
 *
 * A record this cannot read throws, as `readRunes` does (`AGENTS.md` §0.1). The
 * import has already refused such an account, so skipping one here could only
 * ever hide a contract the two readers had come to disagree about.
 */
export function readCraftItems(data: GameRecord | undefined): CraftItem[] {
  const records = data?.rune_craft_item_list;
  if (!Array.isArray(records)) return [];
  const items: CraftItem[] = [];
  for (const record of records) {
    const item = readCraftItem(record);
    if (!item) throw new Error('This account contains a gem or grindstone JASWA cannot read.');
    items.push(item);
  }
  return items;
}

/**
 * The grades What's missing asks about. Hero and Legend are the items worth
 * chasing: a lower grade of the same item rolls less and could only ever
 * appear as a worse copy of the Legend one beside it.
 */
export const missingCraftGrades: readonly ItemGrade[] = ['Hero', 'Legend'];

/** What's missing names items by set or Ancient set, never Immemorial (see below). */
export const missingCraftLineages: readonly CraftLineage[] = ['standard', 'ancient'];

/**
 * Every item the game makes for the runes on this account that the box does
 * not already hold, each with `amount: 0`.
 *
 * Only sets the account has runes of are asked about, and only the lineage
 * those runes take: an Ancient Violent stone is missing only where an Ancient
 * Violent rune could use it. An Immemorial item rolls exactly what the set's own
 * item of that grade rolls, so it is never listed as a third choice; instead an
 * Immemorial item in the box counts as holding the set's item for every
 * ordinary set, which is where it fits.
 */
export function missingCraftItems(
  held: readonly CraftItem[], runes: readonly { setId: number; ancient: boolean }[],
): CraftItem[] {
  const key = (kind: CraftKind, lineage: CraftLineage, setId: number | null, statId: number, grade: ItemGrade) =>
    [kind, lineage, setId ?? '', statId, grade].join(':');
  const owned = new Set(held.map((item) => key(item.kind, item.lineage, item.setId, item.statId, item.grade)));
  const sets = new Map<string, { setId: number; lineage: CraftLineage }>();
  for (const rune of runes) {
    const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
    sets.set(`${lineage}:${rune.setId}`, { setId: rune.setId, lineage });
  }
  const missing: CraftItem[] = [];
  for (const { setId, lineage } of [...sets.values()].sort((a, b) => a.setId - b.setId || a.lineage.localeCompare(b.lineage))) {
    const setName = runeSetName(setId) ?? null;
    for (const kind of ['gem', 'grindstone'] as const) {
      for (const statId of kind === 'gem' ? runeStatIds : grindableStatIds) {
        for (const grade of missingCraftGrades) {
          const id = key(kind, lineage, setId, statId, grade);
          if (owned.has(id) || (lineage === 'standard' && owned.has(key(kind, 'immemorial', null, statId, grade)))) continue;
          missing.push({
            id: `missing:${id}`, kind, lineage, setId, setName, statId, statName: runeStatName(statId) ?? '',
            grade, amount: 0, range: craftValueRange(kind, lineage, statId, grade),
          });
        }
      }
    }
  }
  return missing;
}

export const craftKindLabels: Readonly<Record<CraftKind, string>> = {
  gem: 'Gem',
  grindstone: 'Grind',
};

export const craftLineageLabels: Readonly<Record<CraftLineage, string>> = {
  standard: 'Standard',
  immemorial: 'Immemorial',
  ancient: 'Ancient',
};

/** What the item's lineage means for where it can go, for a control's title. */
export const craftLineageNotes: Readonly<Record<CraftLineage, string>> = {
  standard: 'Goes on runes of its own set only',
  immemorial: 'Goes on a rune of any set',
  ancient: 'Goes on Ancient runes only, and they take nothing else',
};

/**
 * The set column's reading: a real set, or the family name of the items that
 * belong to none.
 *
 * It used to say `Any set`, which was true and said nothing an account could
 * act on — the box list carried a Family column beside it that named the three
 * families in full. That column is gone: Ancient is now the mark after a set
 * name, and Immemorial has no set name to mark, so this column carries the
 * game's own word for it instead. Both halves of the old Family column survive
 * here, and the rule each family plays by stays on the cell's title.
 */
export const craftSetName = (item: CraftItem): string => item.setName ?? craftLineageLabels.immemorial;

/** The same reading with the mark spelled out, for a sort key or a search index. */
export const craftSetLabel = (item: CraftItem): string =>
  withAncientMark(craftSetName(item), item.lineage === 'ancient');

/**
 * `Legend Violent SPD Gem` — the item said in one breath, for a dropdown.
 *
 * An `<option>` and an `<optgroup>` hold text and nothing else, so the Ancient
 * mark is written out here rather than rendered: `Legend Violent A SPD Gem`.
 * The letter is the same one the tables draw, which is the point — a player
 * who has read one has read the other.
 */
export function craftItemLabel(item: CraftItem): string {
  return [item.grade, craftSetLabel(item), item.statName, craftKindLabels[item.kind]].join(' ');
}

/** Everything a search box should match on one item. */
export function craftItemSearchText(item: CraftItem): string {
  return `${craftItemLabel(item)} ${craftLineageLabels[item.lineage]}`.toLowerCase();
}
