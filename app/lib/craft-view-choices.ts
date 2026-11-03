import { isBoolean, isOneOf, isRecord, readSettings } from './preference-reading';
import { craftRollAssumptions, itemGrades, missingCraftGrades, missingCraftLineages } from './rune-craft-items';
import type { CraftKind, CraftLineage, CraftRollAssumption } from './rune-craft-items';
import { runeStatIds } from './runes';
import type { ItemGrade } from './types';

/**
 * The three questions Gems & Grinds asks of one engine:
 * - `recommendations`: where the box's items do the most good;
 * - `selected`: where one chosen stack does the most good;
 * - `missing`: which items the box lacks would beat the best it can already do.
 */
export type CraftViewMode = 'recommendations' | 'selected' | 'missing';
export const craftViewModes: readonly CraftViewMode[] = ['recommendations', 'selected', 'missing'];

export const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
export const craftChangeOptions = ['yes', 'no'] as const;

/* Each step roughly doubles or more: the difference between one and five runes
   is worth a stop, the one between 60 and 65 is not. */
export const craftSuggestionCounts = [1, 5, 10, 25, 50, 100] as const;
export type CraftSuggestionCount = typeof craftSuggestionCounts[number];

/* What's missing names an item by its set, never Immemorial, and asks only
   about the grades worth chasing (`missingCraftItems`), so its two groups offer
   only those choices. */
export const craftViewOffers: Record<CraftViewMode, { lineages: readonly CraftLineage[]; grades: readonly ItemGrade[] }> = {
  recommendations: { lineages: craftLineages, grades: itemGrades },
  selected: { lineages: craftLineages, grades: itemGrades },
  missing: { lineages: missingCraftLineages, grades: missingCraftGrades },
};

/** One view's question and filters, as the user last left them. */
export type CraftViewChoice = {
  kind: CraftKind;
  lineages: CraftLineage[];
  grades: ItemGrade[];
  statId: string;
  /** Best use only: the chosen stack. */
  selectedItemId: string;
  set: string;
  roll: CraftRollAssumption;
  grindAfter: boolean;
  grindGrade: ItemGrade;
  showEngraved: boolean;
  showInventory: boolean;
  count: CraftSuggestionCount;
  /** Grindstones only: *Stat already grinded*, an inclusive filter. */
  already: Array<typeof craftChangeOptions[number]>;
  /**
   * Gems only: *Can change gem'ed stat?*. A permission rather than an inclusive
   * filter, so exactly one answer always stands: "neither" would read as "yes"
   * and "both" as "yes" too, leaving No the only choice that meant anything.
   */
  gemChange: typeof craftChangeOptions[number];
  /** Best use only: the runes Rune Clean-up's calculation itself keeps. */
  keepOnly: boolean;
};

/* The middle of the roll and a Hero stone after a Gem: what a player can
   count on landing rather than what they would hope for. Neither Location
   chosen means every rune, the inclusive filters' one rule. */
export const defaultCraftViewChoice: CraftViewChoice = {
  kind: 'grindstone', lineages: [], grades: [], statId: '', selectedItemId: '', set: '',
  roll: 'average', grindAfter: true, grindGrade: 'Hero', showEngraved: false, showInventory: false,
  count: 5, already: [], gemChange: 'yes', keepOnly: false,
};

/** Reset filters returns these and only these: the item kind, the chosen stack and the assumptions are the question, not a filter. */
export const craftFilterFields = ['lineages', 'grades', 'statId', 'set', 'showEngraved', 'showInventory', 'count', 'already', 'gemChange', 'keepOnly'] as const;

export type CraftViewChoices = Record<CraftViewMode, CraftViewChoice>;

export const blankCraftViewChoices = (): CraftViewChoices =>
  Object.fromEntries(craftViewModes.map((mode) => [mode, defaultCraftViewChoice])) as CraftViewChoices;

const isString = (value: unknown) => typeof value === 'string';
const isListOf = <T,>(choices: readonly T[]) => (value: unknown) => Array.isArray(value) && value.every(isOneOf(choices));

/** Each view, and each choice within it, is read on its own: one unreadable choice resets only itself. */
export function readCraftViewChoices(value: unknown): CraftViewChoices {
  const stored = isRecord(value) ? value : {};
  return Object.fromEntries(craftViewModes.map((mode) => [mode, readSettings(stored[mode], defaultCraftViewChoice, {
    kind: isOneOf(craftKinds),
    lineages: isListOf(craftViewOffers[mode].lineages), grades: isListOf(craftViewOffers[mode].grades),
    statId: (value) => value === '' || runeStatIds.some((id) => String(id) === value),
    selectedItemId: isString, set: isString, roll: isOneOf(craftRollAssumptions), grindAfter: isBoolean,
    grindGrade: isOneOf(itemGrades), showEngraved: isBoolean, showInventory: isBoolean, count: isOneOf(craftSuggestionCounts),
    already: isListOf(craftChangeOptions), gemChange: isOneOf(craftChangeOptions), keepOnly: isBoolean,
  })])) as CraftViewChoices;
}
