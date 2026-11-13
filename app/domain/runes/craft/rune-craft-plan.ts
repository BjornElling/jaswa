/** Inventory reach reads the same legality as the optimization engine. */
import { craftBlockOrder, craftItemFit } from './rune-craft-end-state';
import type { CraftBlock } from './rune-craft-end-state';
export { craftItemFit, lineageFits } from './rune-craft-end-state';
import type { CraftItem } from './rune-craft-items';
import { gemMinimumLevel } from '../runes';
import type { Rune } from '../runes';

/* -------------------------------------------------------------- inventory */

/** How many runes one item can improve, and why none can be improved. */
export type CraftReach = {
  /** Runes on which the item can raise the value of its own stat. */
  improves: number;
  /** The nearest miss across every rune, where nothing fits at all. */
  block: CraftBlock | null;
};

/**
 * How many of the account's runes each item can improve.
 *
 * Always every rune, whatever the table above is filtered to. A filter narrows
 * what a page shows and never what it computes (`AGENTS.md` §6), and this
 * figure is the one that says whether a stack is worth keeping — it cannot mean
 * two different things depending on which chip is pressed.
 *
 * Runes are indexed by set first, because every item but the Immemorial one
 * names a set and can never reach past it, and scanning the whole box for each
 * of several hundred stacks is work with a known answer.
 */
export function craftReach(items: readonly CraftItem[], runes: readonly Rune[]): Map<string, CraftReach> {
  const bySet = new Map<number, Rune[]>();
  const ordinary: Rune[] = [];
  for (const rune of runes) {
    const set = bySet.get(rune.setId);
    if (set) set.push(rune); else bySet.set(rune.setId, [rune]);
    if (!rune.ancient) ordinary.push(rune);
  }

  const reach = new Map<string, CraftReach>();
  for (const item of items) {
    const scope = item.setId === null ? ordinary : bySet.get(item.setId) ?? [];
    let improves = 0;
    let nearest = -1;
    for (const rune of scope) {
      const fit = craftItemFit(item, rune);
      if (!fit.fits) {
        nearest = Math.max(nearest, craftBlockOrder.indexOf(fit.block));
        continue;
      }
      improves += 1;
    }
    reach.set(item.id, {
      improves,
      block: improves > 0 ? null : craftBlockOrder[nearest] ?? 'set',
    });
  }
  return reach;
}

/** What the item's own reach is measured over, said in the fewest words. */
export function craftScopeWord(item: CraftItem): string {
  if (item.lineage === 'ancient') return `Ancient ${item.setName ?? ''}`.trim();
  return item.setName ?? '';
}

/** One line saying why an item has nowhere to go. */
export function craftBlockReason(item: CraftItem, block: CraftBlock): string {
  const scope = craftScopeWord(item);
  const runes = scope ? `${scope} rune` : 'rune';
  switch (block) {
    case 'set': return `You own no ${runes}`;
    case 'level': return `No ${runes} has reached +${gemMinimumLevel}`;
    case 'slot': return `No ${runes} at +${gemMinimumLevel} or higher has a slot that allows ${item.statName} as a sub property`;
    case 'duplicate': return `No ${runes} at +${gemMinimumLevel} or higher can gain ${item.statName} from this Gem`;
    case 'stat': return `No ${runes} has ${item.statName}`;
    case 'target': return item.kind === 'gem'
      ? `No ${runes} at +${gemMinimumLevel} or higher has a sub property this Gem can improve`
      : `No ${runes} has any ${item.statName} line this Grindstone can improve`;
    case 'potential': return `This Gem cannot improve ${item.statName} on any ${runes} at +${gemMinimumLevel} or higher`;
  }
}
