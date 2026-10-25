import type { CraftCalculation } from '../rune-craft-recommendations';

/** One complete answer for both craft views, retained across workspace navigation. */
let latest: CraftCalculation | null = null;
const listeners = new Set<() => void>();
export const craftResultMemory = {
  getSnapshot: () => latest,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  remember(value: CraftCalculation | null) { latest = value; listeners.forEach((listener) => listener()); },
};
