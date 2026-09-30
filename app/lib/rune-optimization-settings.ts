import { isBoolean, isOneOf } from './preference-reading';
import type { FieldChecks } from './preference-reading';
import { craftRollAssumptions, itemGrades } from './rune-craft-items';
import type { CraftRollAssumption } from './rune-craft-items';
import type { ItemGrade } from './types';

/**
 * How Rune Optimization calculates, as opposed to *what for*.
 *
 * What a build must reach — builds, slot mains, targets, the figure to rank by —
 * belongs to the monster and is stated on its profile (`monster-preferences.ts`).
 * These settings belong to the calculation and hold for every monster: which craft
 * items may be counted, where runes may be taken from, and how hard to look.
 *
 * **Deliberately not Rune Clean-up's craft settings.** Clean-up asks what a rune
 * could become if the player chose to invest in it; the optimizer asks what build a
 * monster can wear, and a player who lets Clean-up assume Legend Gems to decide
 * what to keep has not thereby said they will spend them on this monster tonight.
 * One set of switches answering both questions would make each wrong for the other.
 */

/**
 * Which Gems or Grindstones a build may count on.
 *
 * The words are the artifact page's own for its conversion stones, because the
 * question is the same one: nothing, what you hold, or an assumed item of a grade
 * you name.
 */
export type CraftUse = 'none' | 'owned' | 'theoretical';
export const craftUses: readonly CraftUse[] = ['none', 'owned', 'theoretical'];
export const craftUseLabels: Readonly<Record<CraftUse, string>> = {
  none: 'None',
  owned: 'Owned only',
  theoretical: 'Theoretical',
};

/**
 * How many runes per slot and set the search keeps after the exact reductions, and
 * how long it may run — `RUNE-OPTIMIZATION.md` §5.
 *
 * `complete` makes no cut beyond the exact ones. The other three drop runes that
 * contribute least to what this calculation asks for, and say so on the status
 * line: a cut is a defensible shortcut only while the user can see it was taken.
 */
export type RuneOptimizationDepth = 'quick' | 'balanced' | 'thorough' | 'complete';
export const runeOptimizationDepths: readonly RuneOptimizationDepth[] = ['quick', 'balanced', 'thorough', 'complete'];
export const runeOptimizationDepthLabels: Readonly<Record<RuneOptimizationDepth, string>> = {
  quick: 'Quick',
  balanced: 'Balanced',
  thorough: 'Thorough',
  complete: 'Complete',
};

/**
 * What each depth means in runes kept and seconds allowed. One table, read by the
 * preparation and the search alike, so the words on the control and the work done
 * cannot drift apart. `Infinity` keeps every rune the exact reductions leave.
 */
export const runeOptimizationDepthPlans: Readonly<Record<RuneOptimizationDepth, { keep: number; seconds: number }>> = {
  quick: { keep: 6, seconds: 15 },
  balanced: { keep: 12, seconds: 45 },
  thorough: { keep: 24, seconds: 120 },
  complete: { keep: Infinity, seconds: 600 },
};

/** How many builds the table may list. */
export const runeOptimizationResultCounts = [10, 20, 50, 100] as const;
export type RuneOptimizationResultCount = typeof runeOptimizationResultCounts[number];

export type RuneOptimizationSettings = {
  gems: CraftUse;
  /** The grade a theoretical Gem is assumed to be. Held while Gems are off, as `manualTimeZone` is. */
  gemGrade: ItemGrade;
  /** Where in its range any Gem — held or theoretical — is assumed to land. */
  gemRoll: CraftRollAssumption;
  grinds: CraftUse;
  grindGrade: ItemGrade;
  grindRoll: CraftRollAssumption;
  /**
   * Whether a rune another monster wears may be moved onto this one. A locked rune
   * never may, whatever this says: the lock is the user's own word (`rune-holds.ts`).
   */
  runesOnOtherMonsters: boolean;
  /**
   * Whether an unfinished rune's main property is counted at its `+15` value.
   * A main property grows deterministically with the power-up level, so this is a
   * fact about what the rune *will* carry, not a projection of luck — its sub
   * properties are counted as they stand either way.
   */
  unfinishedAtMaximum: boolean;
  depth: RuneOptimizationDepth;
  resultCount: RuneOptimizationResultCount;
};

/*
 * Nothing is spent that the user did not ask to spend: both craft kinds start off.
 * Taking runes from other monsters starts on, because a build limited to the
 * inventory is not the question someone opening an optimizer usually asks, and every
 * row says how many runes it moves.
 */
export const defaultRuneOptimizationSettings: RuneOptimizationSettings = {
  gems: 'none',
  gemGrade: 'Hero',
  gemRoll: 'average',
  grinds: 'none',
  grindGrade: 'Hero',
  grindRoll: 'average',
  runesOnOtherMonsters: true,
  unfinishedAtMaximum: true,
  depth: 'balanced',
  resultCount: 20,
};

export const runeOptimizationSettingChecks: FieldChecks<RuneOptimizationSettings> = {
  gems: isOneOf(craftUses),
  gemGrade: isOneOf<ItemGrade>(itemGrades),
  gemRoll: isOneOf(craftRollAssumptions),
  grinds: isOneOf(craftUses),
  grindGrade: isOneOf<ItemGrade>(itemGrades),
  grindRoll: isOneOf(craftRollAssumptions),
  runesOnOtherMonsters: isBoolean,
  unfinishedAtMaximum: isBoolean,
  depth: isOneOf(runeOptimizationDepths),
  resultCount: isOneOf(runeOptimizationResultCounts),
};
