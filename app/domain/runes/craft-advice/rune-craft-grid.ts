/**
 * The gem and grindstone table's rows, ordering and search text — everything
 * the box list needs that is not a React component.
 *
 * It sits beside `relic-grid.ts` and `artifact-grid.ts` for the same reason
 * those do: the component decides how a cell looks, and this decides what the
 * cell says and how two of them compare.
 */
import { itemGrades, craftKindLabels, craftItemSearchText, craftSetName } from '../craft/rune-craft-items';
import type { CraftItem } from '../craft/rune-craft-items';
import { craftScopeWord } from '../craft/rune-craft-plan';
import type { CraftReach } from '../craft/rune-craft-plan';
import { gemMinimumLevel, runeLineValue } from '../runes';
import { monsterNameCollator } from '../../monsters/monster-grid';

export type CraftRow = {
  item: CraftItem;
  /** Position in the import, so equal rows keep one stated order. */
  index: number;
  reach: CraftReach;
};

export type CraftSortKey = 'item' | 'set' | 'stat' | 'grade' | 'range' | 'quantity' | 'improves';

/**
 * Which way a column opens. A quantity opens at its largest, because that is
 * the end a reader came for; a name opens at A.
 */
export const defaultCraftSortDirections: Readonly<Record<CraftSortKey, boolean>> = {
  item: true, set: true, stat: true, grade: false,
  range: false, quantity: false, improves: false,
};

type CraftTieBreakKey = CraftSortKey | 'ancient';

const craftTieBreakOrder: readonly { key: CraftTieBreakKey; direction: 1 | -1 }[] = [
  { key: 'item', direction: 1 },
  { key: 'set', direction: 1 },
  { key: 'ancient', direction: 1 },
  { key: 'stat', direction: 1 },
  { key: 'grade', direction: -1 },
];

/** What an item is looking for, for the title on the count that reports it. */
export function craftRequirementText(item: CraftItem): string {
  const scope = craftScopeWord(item);
  const runes = scope ? `${scope} runes` : 'Non-Ancient runes';
  return item.kind === 'gem'
    ? `${runes} at +${gemMinimumLevel} or higher where this Gem's best roll raises ${item.statName}`
    : `${runes} where this Grindstone's best grind raises ${item.statName}`;
}

/** `7–10`, or the em dash where no verified range exists (Ancient items). */
export function craftRangeText(item: CraftItem, format: (value: number) => string): string {
  if (!item.range) return '—';
  return `${format(item.range.minimum)}–${runeLineValue(item.statId, item.range.maximum, format)}`;
}

export function craftRowSearchText(row: CraftRow): string {
  return `${craftItemSearchText(row.item)} ${craftRequirementText(row.item).toLowerCase()}`;
}

export function compareCraftRows(left: CraftRow, right: CraftRow, key: CraftSortKey): number {
  switch (key) {
    case 'item':
      return monsterNameCollator.compare(craftKindLabels[left.item.kind], craftKindLabels[right.item.kind]);
    /* The mark has its own tiebreak, leaving the set name alphabetic and letting
       Ancient stacks sort before the ordinary copies of the same set. */
    case 'set':
      return monsterNameCollator.compare(craftSetName(left.item), craftSetName(right.item));
    case 'stat':
      return monsterNameCollator.compare(left.item.statName, right.item.statName);
    case 'grade':
      return itemGrades.indexOf(left.item.grade) - itemGrades.indexOf(right.item.grade);
    /* An Ancient item has no verified range and sorts below every item that has
       one, whichever way the column points: absent is unknown, not zero. */
    case 'range':
      return (left.item.range?.maximum ?? -1) - (right.item.range?.maximum ?? -1);
    case 'quantity':
      return left.item.amount - right.item.amount;
    case 'improves':
      return left.reach.improves - right.reach.improves;
  }
}

/**
 * When a reader picks another column, its own direction leads. These fields
 * settle ties in the box's stated order: names stay alphabetical, Ancient
 * stacks come first, and quality stays high-to-low.
 */
export function compareCraftRowTieBreaks(
  left: CraftRow,
  right: CraftRow,
  primaryKey: CraftSortKey,
): number {
  for (const entry of craftTieBreakOrder) {
    if (entry.key === primaryKey) continue;
    const comparison = entry.key === 'ancient'
      ? Number(right.item.lineage === 'ancient') - Number(left.item.lineage === 'ancient')
      : compareCraftRows(left, right, entry.key);
    if (comparison !== 0) return comparison * entry.direction;
  }
  return 0;
}
