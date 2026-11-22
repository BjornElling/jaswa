import { isOneOf, isRecord, readSettings } from './preference-reading';
import type { FieldChecks } from './preference-reading';
import { craftRollAssumptions, craftRoundings, itemGrades } from '../runes/craft/rune-craft-items';
import { defaultCraftCredit } from '../runes/craft/rune-craft-end-state';
import type { CraftAssumption, CraftCredit, CraftCreditGrade } from '../runes/craft/rune-craft-end-state';

/** `none` first, as Settings offers it: the one grade that turns the kind off. */
export const craftCreditGrades: readonly CraftCreditGrade[] = ['none', ...itemGrades];

const assumptionChecks: FieldChecks<CraftAssumption> = {
  grade: isOneOf(craftCreditGrades),
  roll: isOneOf(craftRollAssumptions),
  rounding: isOneOf(craftRoundings),
};

/**
 * The Gem and the Grindstone are read apart, and each of their three choices on its
 * own (`AGENTS.md` §0): a stored grade the contract no longer offers resets that
 * grade and leaves the roll, the rounding and the other kind as they were chosen.
 */
export function readCraftCredit(value: unknown): CraftCredit {
  const stored = isRecord(value) ? value : {};
  return {
    gem: readSettings(stored.gem, defaultCraftCredit.gem, assumptionChecks),
    grind: readSettings(stored.grind, defaultCraftCredit.grind, assumptionChecks),
  };
}
