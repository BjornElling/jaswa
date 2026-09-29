/**
 * The newest Rune Clean-up answers, kept so a rune overlay can read one rather
 * than ask again.
 *
 * A rune's advice depends on nothing but the rune, the presets, the settings and
 * the import's reference monsters, so an answer the table already holds *is* the
 * overlay's answer — and asking again costs about a second of the worker per rune.
 * An answer is only handed out for the very same import, settings and presets
 * objects it was calculated with: those are replaced, never edited, whenever the
 * user changes one, so identity is exactly "nothing has changed since". The rune
 * itself is compared by content, because a simulated rune's id is reused by the
 * next simulation.
 */
import type { GameRecord } from '../game-data';
import type { RuneAdvice } from '../rune-cleanup-advice';
import type { RunePotentialPreset } from '../rune-potential-presets';
import type { Rune } from '../runes';
import type { RunePotentialSettings } from '../types';

export type RuneAdviceInputs = {
  data: GameRecord;
  settings: RunePotentialSettings;
  presets: readonly RunePotentialPreset[];
};

let remembered: (RuneAdviceInputs & { entries: Map<string, { rune: Rune; advice: RuneAdvice }> }) | null = null;

const sameInputs = (left: RuneAdviceInputs, right: RuneAdviceInputs) =>
  left.data === right.data && left.settings === right.settings && left.presets === right.presets;

const sameRune = (left: Rune, right: Rune) => left === right || JSON.stringify(left) === JSON.stringify(right);

/** Keep these answers. Answers for other inputs are dropped: only the newest can be asked for. */
export function rememberRuneAdvice(
  inputs: RuneAdviceInputs, runes: readonly Rune[], advice: ReadonlyMap<string, RuneAdvice>,
): void {
  if (remembered === null || !sameInputs(remembered, inputs)) remembered = { ...inputs, entries: new Map() };
  for (const rune of runes) {
    const found = advice.get(rune.id);
    if (found) remembered.entries.set(rune.id, { rune, advice: found });
  }
}

export function rememberedRuneAdvice(inputs: RuneAdviceInputs, rune: Rune): RuneAdvice | undefined {
  if (remembered === null || !sameInputs(remembered, inputs)) return undefined;
  const entry = remembered.entries.get(rune.id);
  return entry && sameRune(entry.rune, rune) ? entry.advice : undefined;
}
