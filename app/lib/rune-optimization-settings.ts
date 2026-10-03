import { isBoolean, isOneOf } from './preference-reading';
import type { FieldChecks } from './preference-reading';
import { craftRollAssumptions, defaultCraftRollAssumption, itemGrades } from './rune-craft-items';
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

/** What each depth looks through, in words that need no knowledge of the cut. */
export const runeOptimizationDepthReach: Readonly<Record<RuneOptimizationDepth, string>> = {
  quick: 'Only your strongest runes',
  balanced: 'A wide pick of your strongest runes',
  thorough: 'Most runes worth trying',
  complete: 'Every rune that could matter',
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
  /**
   * Where in its range any Gem — held or theoretical — is assumed to land. Named for
   * the five-choice vocabulary with two thirds as its default; a value stored under an
   * earlier name is not read, so every saved choice starts again from two thirds.
   */
  gemRollAssumption: CraftRollAssumption;
  grinds: CraftUse;
  grindGrade: ItemGrade;
  grindRollAssumption: CraftRollAssumption;
  /**
   * Whether a rune another monster wears may be moved onto this one. A locked rune
   * never may, whatever this says: the lock is the user's own word (`rune-holds.ts`).
   * The page asks it the other way round — *Only use runes from inventory* — so both
   * switches beside it start off and each says what ticking it does.
   */
  runesOnOtherMonsters: boolean;
  /**
   * Whether a monster may also take the runes worn by monsters above it on the
   * priority list (`monster-priority.ts`) — and, when it is not on the list, those
   * of every monster that is. Off, the list is respected. It means nothing while
   * runes come from the inventory only, and stays a choice of its own regardless.
   */
  includeHigherPriority: boolean;
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
  gemRollAssumption: defaultCraftRollAssumption,
  grinds: 'none',
  grindGrade: 'Hero',
  grindRollAssumption: defaultCraftRollAssumption,
  runesOnOtherMonsters: true,
  includeHigherPriority: false,
  unfinishedAtMaximum: true,
  depth: 'balanced',
  resultCount: 20,
};

export const runeOptimizationSettingChecks: FieldChecks<RuneOptimizationSettings> = {
  gems: isOneOf(craftUses),
  gemGrade: isOneOf<ItemGrade>(itemGrades),
  gemRollAssumption: isOneOf(craftRollAssumptions),
  grinds: isOneOf(craftUses),
  grindGrade: isOneOf<ItemGrade>(itemGrades),
  grindRollAssumption: isOneOf(craftRollAssumptions),
  runesOnOtherMonsters: isBoolean,
  includeHigherPriority: isBoolean,
  unfinishedAtMaximum: isBoolean,
  depth: isOneOf(runeOptimizationDepths),
  resultCount: isOneOf(runeOptimizationResultCounts),
};
