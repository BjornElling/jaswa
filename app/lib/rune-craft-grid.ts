/**
 * The gem and grindstone table's rows, ordering and search text — everything
 * the box list needs that is not a React component.
 *
 * It sits beside `relic-grid.ts` and `artifact-grid.ts` for the same reason
 * those do: the component decides how a cell looks, and this decides what the
 * cell says and how two of them compare.
 */
import { itemGrades, craftKindLabels, craftItemSearchText, craftSetLabel } from './rune-craft-items';
import type { CraftItem } from './rune-craft-items';
import { craftBlockReason, craftScopeWord } from './rune-craft-plan';
import type { CraftReach } from './rune-craft-plan';
import { gemMinimumLevel, runeLineValue, runeStatIds } from './runes';
import { monsterNameCollator } from './monster-grid';

export type CraftRow = {
  item: CraftItem;
  /** Position in the import, so equal rows keep one stated order. */
  index: number;
  reach: CraftReach;
};

export type CraftSortKey = 'item' | 'set' | 'stat' | 'grade' | 'range' | 'held' | 'fits' | 'scope';

/**
 * Which way a column opens. A quantity opens at its largest, because that is
 * the end a reader came for; a name opens at A.
 */
export const defaultCraftSortDirections: Readonly<Record<CraftSortKey, boolean>> = {
  item: true, set: true, stat: true, grade: false,
  range: false, held: false, fits: false, scope: true,
};

/** The stats in the game's own order, for the columns that sort by stat. */
const statOrder = (statId: number) => runeStatIds.indexOf(statId);

/**
 * Where a stack can actually go, said in the one thing that varies per row.
 *
 * An earlier version wrote out the rule — "Violent runes at +12 or higher" —
 * on all eight hundred rows. It is true, it is derivable from the three columns
 * to its left, and repeated that many times it reads as wallpaper. What a
 * reader cannot get anywhere else is the split: an item with spare runes to
 * land on can be spent tonight, while one whose every target is engraved costs
 * a monster its build first. A zero in `Fits` keeps the explanation, because
 * that is the row where the rule *is* the news.
 */
export function craftScopeText(item: CraftItem, reach: CraftReach): string {
  if (reach.block !== null) return craftBlockReason(item, reach.block);
  const engraved = reach.fits - reach.spare;
  /* The half that is zero is left out rather than written as a zero: "0
     engraved" is a fact nobody needs, and the two halves read as one sentence
     whichever of them survives. */
  return [
    reach.spare ? `${reach.spare} in inventory` : '',
    engraved ? `${engraved} engraved` : '',
  ].filter(Boolean).join(' · ');
}

/** What an item is looking for, for the title on the count that reports it. */
export function craftRequirementText(item: CraftItem): string {
  const scope = craftScopeWord(item);
  const runes = scope ? `${scope} runes` : 'Runes of any set';
  return item.kind === 'gem'
    ? `${runes} at +${gemMinimumLevel} or higher with a replaceable sub property; a same-stat Gem needs a higher possible roll`
    : `${runes} with a ${item.statName} sub property whose current grind this stone could raise`;
}

/** `7–10`, or the em dash where no verified range exists (Ancient items). */
export function craftRangeText(item: CraftItem, format: (value: number) => string): string {
  if (!item.range) return '—';
  return `${format(item.range.minimum)}–${runeLineValue(item.statId, item.range.maximum, format)}`;
}

export function craftRowSearchText(row: CraftRow): string {
  return `${craftItemSearchText(row.item)} ${craftScopeText(row.item, row.reach).toLowerCase()}`
    + ` ${craftRequirementText(row.item).toLowerCase()}`;
}

export function compareCraftRows(left: CraftRow, right: CraftRow, key: CraftSortKey): number {
  switch (key) {
    case 'item':
      return monsterNameCollator.compare(craftKindLabels[left.item.kind], craftKindLabels[right.item.kind]);
    /* The Ancient mark is part of the sort key, so a set's Ancient stacks land
       beside its ordinary ones rather than under A at the top of the box. */
    case 'set':
      return monsterNameCollator.compare(craftSetLabel(left.item), craftSetLabel(right.item));
    case 'stat':
      return statOrder(left.item.statId) - statOrder(right.item.statId);
    case 'grade':
      return itemGrades.indexOf(left.item.grade) - itemGrades.indexOf(right.item.grade);
    /* An Ancient item has no verified range and sorts below every item that has
       one, whichever way the column points: absent is unknown, not zero. */
    case 'range':
      return (left.item.range?.maximum ?? -1) - (right.item.range?.maximum ?? -1);
    case 'held':
      return left.item.amount - right.item.amount;
    /* Spare runes break a tie on the total, because two stacks that reach the
       same number of runes are not equally spendable. */
    case 'fits':
      return left.reach.fits - right.reach.fits || left.reach.spare - right.reach.spare;
    case 'scope':
      return monsterNameCollator.compare(
        craftScopeText(left.item, left.reach), craftScopeText(right.item, right.reach),
      );
  }
}
