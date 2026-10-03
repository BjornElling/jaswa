import { monsterPresentation } from './monster-catalog';
import type { RuneSlotKey } from './monster-defaults';
import { runeSlotKeys } from './monster-defaults';
import type { MonsterCopyPreferences } from './monster-preferences';
import { monsterStatTargetKeys } from './monster-preferences';
import { resolveMonsterPreferences } from './monster-preference-resolution';
import type { PreferenceSource } from './monster-preference-resolution';
import { defaultRankFigure } from './rune-optimization-problem';
import type { RankFigure, RuneOptimizationRequirements } from './rune-optimization-problem';

/**
 * Where a calculation's requirements start: the monster's profile
 * (`RUNE-OPTIMIZATION.md` §2).
 *
 * The profile is read *resolved*, so a slot its owner never answered carries the
 * community's answer, exactly as every other page that reads a profile does — and
 * the page is told which, because "you asked for SPD" and "most players wear SPD"
 * are different reasons for the same pill.
 */
export type RequirementSources = {
  slots: Record<RuneSlotKey, PreferenceSource>;
  /** `profile` where the owner named a figure to rank by; `archetype` where JASWA chose one. */
  rankBy: 'profile' | 'archetype';
};

export function profileRequirements(
  unitId: string, masterId: unknown, stated: MonsterCopyPreferences | undefined,
): { requirements: RuneOptimizationRequirements; sources: RequirementSources } {
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
  const slotSources = {} as Record<RuneSlotKey, PreferenceSource>;
  for (const key of runeSlotKeys) {
    (slotMains as Record<RuneSlotKey, unknown>)[key] = [...resolved.runes.slots[key].chosen];
    slotSources[key] = resolved.runes.slots[key].source;
  }
  const named = resolved.runeSuggestionStat;
  return {
    requirements: {
      builds: [...resolved.runes.sets.chosen],
      slotMains,
      allowBroken: resolved.runes.allowBroken,
      allowIntangible: resolved.runes.allowIntangible,
      allowImmemorial: resolved.runes.allowImmemorial,
      alwaysCrits: resolved.alwaysCrits,
      targets,
      ceilings,
      rankBy: named ?? defaultRankFigure(monsterPresentation(masterId).archetype),
    },
    sources: { slots: slotSources, rankBy: named === undefined ? 'archetype' : 'profile' },
  };
}

/** Whether two requirement sets ask the same question, for the page's "changed here" marks. */
export function sameList<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}
