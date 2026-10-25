import { accuracyCeilings, facesPlayers } from './accuracy-ceiling';
import { formatNumber } from './formatting';
import { monsterProfileAreaName } from './monster-profile-scope';
import type { Preset } from './presets';
import { fastestEnemyOn, hardestPveFloor, pveAreaOf } from './pve-stages';
import { combatThresholdsForMonster, type CombatThreshold } from './rune-combat-thresholds';
import type { GeneralSettings } from './types';

export type AreaFacts = { heading: string; lines: { label: string; value: string }[]; thresholds: readonly CombatThreshold[] };

/**
 * What the area sets against the team: the most Accuracy that still does
 * anything, and its fastest enemy. The area names the block, with the part a
 * single ceiling holds for — `Rift Raid (R5)` — and an area of two ceilings
 * names both on the Accuracy line instead. Scenario spans every content, so both
 * vary with the fight. Both come from the area's hardest floor in the PvE
 * database (`pve-stages.ts`), the floor that names the block; enemies no source
 * covers say so rather than borrow another area's figure, and players' are
 * whatever their runes give.
 */
export function areaFacts(preset: Pick<Preset, 'kind' | 'content'> | undefined, general: GeneralSettings, masterId?: string): AreaFacts {
  const areaName = monsterProfileAreaName(preset ?? { kind: 'scenario', content: null });
  const scenario = !preset || preset.kind === 'scenario';
  const content = scenario ? undefined : preset.content ?? undefined;
  const ceilings = accuracyCeilings(content?.id);
  const only = ceilings.length === 1 ? ceilings[0] : undefined;
  const heading = only?.part === undefined ? areaName : `${areaName} (${only.part})`;
  /* Two ceilings share one line, parts and figures in one order, so every area
     takes the same two lines and the profile still fits one screen. */
  const accuracy = ceilings.length === 0
    ? { label: 'Accuracy goal', value: scenario ? 'Variable' : 'Unknown' }
    : only ? { label: 'Accuracy goal', value: `${only.percent}%` }
    : { label: `Accuracy goal (${ceilings.map((ceiling) => ceiling.part).join(', ')})`, value: `${ceilings.map((ceiling) => ceiling.percent).join('/')}%` };
  const area = pveAreaOf(content?.id);
  const floor = area === undefined ? undefined : hardestPveFloor(area);
  const fastestEnemy = floor === undefined ? undefined : fastestEnemyOn(floor);
  const fastest = scenario || (content && facesPlayers(content.id)) ? 'Variable'
    : fastestEnemy === undefined ? 'Unknown' : formatNumber(fastestEnemy, general);
  return {
    heading,
    lines: [accuracy, { label: 'Fastest enemy (combat speed)', value: fastest }],
    thresholds: combatThresholdsForMonster(masterId, floor).map((row) => row.reference === undefined
      ? row : { ...row, reference: `${areaName} (${row.reference})` }),
  };
}
