/**
 * Which element has advantage over which, and the areas where that is settled
 * before the fight: an area whose every enemy is one element.
 *
 * Water beats Fire, Fire beats Wind and Wind beats Water; Light and Dark each
 * beat the other. The CRI Rate advantage adds is `monster-stats.ts`
 * `elementAdvantageLift`.
 */
import type { PresetContent } from './preset-contents';
import { pveAreaElement, pveAreaOf } from './pve-stages';
import type { PveElement } from './pve-stages';
import { elementName } from './rune-sets';

type Element = Exclude<PveElement, 'Pure'>;

const beats: Readonly<Record<Element, Element>> = {
  Water: 'Fire', Fire: 'Wind', Wind: 'Water', Light: 'Dark', Dark: 'Light',
};

/** Why a copy always has element advantage in an area, where it does. */
export type AreaElementAdvantage = { area: string; enemy: Element };

/** Why the switch is held, for its title; none where the profile decides it. */
export function elementAdvantageHeld(team: { elementAdvantage: AreaElementAdvantage | null }): string | undefined {
  const held = team.elementAdvantage;
  return held ? `Every monster in ${held.area} is ${held.enemy}` : undefined;
}

/**
 * Whether a monster of `attribute` always has element advantage in a content:
 * only where the PvE database finds one element in every enemy of every floor
 * there (`pve-stages.ts` `pveAreaElement`), and the monster's element beats it.
 */
export function areaElementAdvantage(content: PresetContent | null, attribute: unknown): AreaElementAdvantage | null {
  const area = pveAreaOf(content?.id);
  if (content === null || area === undefined) return null;
  const enemy = pveAreaElement(area);
  const own = elementName(attribute) as Element | undefined;
  return enemy !== undefined && own !== undefined && beats[own] === enemy ? { area: content.name, enemy } : null;
}
