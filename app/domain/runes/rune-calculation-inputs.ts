import type { ReferenceStats } from '../reference/rune-reference-stats';
import type { RuneRole } from '../profiles/rune-roles';
import type { RunePotentialSettings } from '../model';
import type { Rune } from './runes';
import { isIntangibleRuneSet } from './rune-sets';
import { creditKey } from './craft/rune-craft-end-state';

export type RuneCalculationInputs = {
  roles: readonly RuneRole[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats> | null;
};

/** Protection and presentation are applied to the answer, never counted into it. */
export function runeCalculationSettingsKey(settings: RunePotentialSettings): string {
  return JSON.stringify([
    creditKey(settings.craftCredit), settings.powerUpPolicy, settings.runeQuality,
    settings.acceptedRunes, settings.brokenRunes, settings.intangibleRunes,
  ]);
}

/** Any role can contribute to the union, including one that was never named Best.
 * Only reference families used by those roles can affect the answer. */
export function runeCalculationKey({ roles, settings, base }: RuneCalculationInputs): string {
  const types = [...new Set(roles.map((role) => role.type))].sort();
  return JSON.stringify([roles, runeCalculationSettingsKey(settings),
    base === null ? null : types.map((type) => [type, base.get(type) ?? null])]);
}

/** The Intangible preference affects only Intangible runes. */
export function runeCalculationKeyForRune(inputs: RuneCalculationInputs, rune: Rune): string {
  return runeCalculationKey({ ...inputs, settings: {
    ...inputs.settings,
    intangibleRunes: isIntangibleRuneSet(rune.setName) ? inputs.settings.intangibleRunes : 1,
  } });
}
