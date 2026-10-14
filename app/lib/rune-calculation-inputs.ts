import type { ReferenceStats } from './rune-reference-stats';
import type { RuneRole } from './rune-roles';
import type { RunePotentialSettings } from './types';
import type { Rune } from './runes';
import { runeSetPieceCount } from './rune-sets';

export type RuneCalculationInputs = {
  roles: readonly RuneRole[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats> | null;
};

/** Protection and presentation are applied to the answer, never counted into it. */
export function runeCalculationSettingsKey(settings: RunePotentialSettings): string {
  return JSON.stringify([
    settings.powerUpPolicy, settings.runeQuality, settings.gemRoll,
    settings.gemRoll === null ? null : settings.gemGrade,
    settings.grindstoneRoll, settings.grindstoneRoll === null ? null : settings.grindstoneGrade,
    settings.acceptedRunes, settings.brokenRunes, settings.intangibleRunes,
    settings.keepMoreForLargerSets,
  ]);
}

/** Role order breaks ties; only reference families used by those roles can matter.
 * All those roles and references also shape the shared slot calibration, so a
 * change to one cannot safely be limited to runes that name it as their winner. */
export function runeCalculationKey({ roles, settings, base }: RuneCalculationInputs): string {
  const types = [...new Set(roles.map((role) => role.type))].sort();
  return JSON.stringify([roles, runeCalculationSettingsKey(settings),
    base === null ? null : types.map((type) => [type, base.get(type) ?? null])]);
}

/** These two preferences affect only their own sets, including Intangible's four pieces. */
export function runeCalculationKeyForRune(inputs: RuneCalculationInputs, rune: Rune): string {
  return runeCalculationKey({ ...inputs, settings: {
    ...inputs.settings,
    intangibleRunes: rune.setName === 'Intangible' ? inputs.settings.intangibleRunes : 1,
    keepMoreForLargerSets: runeSetPieceCount[rune.setName] === 4 && inputs.settings.keepMoreForLargerSets,
  } });
}
