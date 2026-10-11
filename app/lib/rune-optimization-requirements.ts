import type { RuneSlotKey } from './monster-defaults';
import { runeSlotKeys } from './monster-defaults';
import type { MonsterCopyPreferences } from './monster-preferences';
import { monsterStatTargetKeys } from './monster-preferences';
import { resolveMonsterPreferences } from './monster-preference-resolution';
import type { RankFigure, RuneOptimizationRequirements } from './rune-optimization-problem';

/**
 * The question as the page holds it, before it can be asked. The figure to rank by
 * is the one part with no answer to fall back on: the order of the table is the
 * user's decision, so where neither the profile nor the page names a figure it
 * stays unnamed and *Find builds* waits for one (§2.3).
 */
export type RequirementsDraft = Omit<RuneOptimizationRequirements, 'rankBy'> & { rankBy: RankFigure | undefined };

/** The draft as a question the search can answer, once a figure is named. */
export function askable(draft: RequirementsDraft): RuneOptimizationRequirements | undefined {
  const { rankBy } = draft;
  return rankBy === undefined ? undefined : { ...draft, rankBy };
}

/**
 * Only the owner's choices constrain a slot (`RUNE-OPTIMIZATION.md` §2).
 * Community statistics belong beside the field as reference; turning them into
 * requirements would silently exclude builds the owner never ruled out.
 */
export function profileRequirements(
  unitId: string, masterId: unknown, stated: MonsterCopyPreferences | undefined,
): { requirements: RequirementsDraft } {
  const resolved = resolveMonsterPreferences(unitId, masterId, stated);
  const targets: Partial<Record<RankFigure, number>> = {};
  const ceilings: Partial<Record<RankFigure, number>> = {};
  for (const key of monsterStatTargetKeys) {
    const target = resolved.statTargets[key];
    if (target !== undefined) targets[key] = target.value;
    const ceiling = resolved.statCeilings[key];
    if (ceiling !== undefined) ceilings[key] = ceiling.value;
  }
  const slotMains = {} as RuneOptimizationRequirements['slotMains'];
  for (const key of runeSlotKeys) {
    (slotMains as Record<RuneSlotKey, unknown>)[key] = resolved.runes.slots[key].source === 'user'
      ? [...resolved.runes.slots[key].chosen] : [];
  }
  return {
    requirements: {
      builds: [...resolved.runes.sets.chosen],
      slotMains,
      allowBroken: resolved.runes.allowBroken,
      allowIntangible: resolved.runes.allowIntangible,
      alwaysCrits: resolved.alwaysCrits,
      alwaysElementAdvantage: resolved.alwaysElementAdvantage,
      leads: resolved.leads,
      targets,
      ceilings,
      rankBy: resolved.runeSuggestionStat,
    },
  };
}

/** Whether two requirement sets ask the same question, for the page's "changed here" marks. */
export function sameList<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}
