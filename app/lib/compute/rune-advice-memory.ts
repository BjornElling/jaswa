/**
 * The newest Rune Clean-up answers, kept so a rune overlay can read one rather
 * than ask again.
 *
 * A rune's advice depends on nothing but the rune, the roles, the settings and
 * the import's reference monsters, so an answer the table already holds *is* the
 * overlay's answer — and asking again costs about a second of the worker per rune.
 * Inputs are compared by the same mathematical content as the table and Statistics,
 * so an unchanged import or a protection toggle cannot discard a useful answer.
 */
import { runeCalculationKey } from '../rune-calculation-inputs';
import { referenceLines } from '../rune-reference-stats';
import { runeAdviceKey } from '../rune-cleanup-refresh';
import type { GameRecord } from '../game-data';
import type { RuneAdvice } from '../rune-cleanup-advice';
import { withRuneSellProtection } from '../rune-cleanup-advice';
import type { RuneRole } from '../rune-roles';
import type { Rune } from '../runes';
import type { RunePotentialSettings } from '../types';

export type RuneAdviceInputs = {
  data: GameRecord;
  settings: RunePotentialSettings;
  roles: readonly RuneRole[];
};

let remembered: { key: string; entries: Map<string, { rune: Rune; advice: RuneAdvice }> } | null = null;

function inputsKey(inputs: RuneAdviceInputs): string {
  const lines = referenceLines(inputs.data);
  const base = lines ? new Map([...lines].map(([type, line]) => [type, line.stats])) : null;
  return runeCalculationKey({ ...inputs, base });
}

const sameRune = (left: Rune, right: Rune) => left === right || runeAdviceKey(left) === runeAdviceKey(right);

/** Keep these answers. Answers for other inputs are dropped: only the newest can be asked for. */
export function rememberRuneAdvice(
  inputs: RuneAdviceInputs, runes: readonly Rune[], advice: ReadonlyMap<string, RuneAdvice>,
): void {
  const key = inputsKey(inputs);
  if (remembered === null || remembered.key !== key) remembered = { key, entries: new Map() };
  for (const rune of runes) {
    const found = advice.get(rune.id);
    if (found) remembered.entries.set(rune.id, { rune, advice: found });
  }
}

export function rememberedRuneAdvice(inputs: RuneAdviceInputs, rune: Rune): RuneAdvice | undefined {
  if (remembered === null || remembered.key !== inputsKey(inputs)) return undefined;
  const entry = remembered.entries.get(rune.id);
  return entry && sameRune(entry.rune, rune) ? withRuneSellProtection(rune, entry.advice, inputs.settings) : undefined;
}
