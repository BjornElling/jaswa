import type { CraftCalculation } from '../../domain/runes/craft-advice/rune-craft-recommendations';
import { registerAccountJobReset } from './account-job-memory';

function resultMemory() {
  let latest: CraftCalculation | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => latest,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    remember(value: CraftCalculation | null) { latest = value; listeners.forEach((listener) => listener()); },
  };
}

/** One complete answer for the box's two views, retained across workspace navigation. */
export const craftResultMemory = resultMemory();

/**
 * What's missing asks a larger question — the box and everything it lacks — so
 * it keeps its own answer rather than overwriting the one the box's views share.
 */
export const missingCraftResultMemory = resultMemory();
registerAccountJobReset(() => { craftResultMemory.remember(null); missingCraftResultMemory.remember(null); });
