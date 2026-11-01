import { isRecord } from './preference-reading';
import type { CraftKind } from './rune-craft-items';
import { runeStatIds } from './runes';

/**
 * **The craft suggestions the user has waved away**, shared by every
 * Gems & Grinds view so one decision follows the user through the workspace.
 *
 * An entry is a rune, an item kind and the stat the item gives: ignoring a SPD
 * Grind on a rune hides every SPD Grind on that rune, of any grade or set, and
 * nothing else — an ATK Grind or a SPD Gem on the same rune is still suggested.
 * The rune is named by `rune_id`, the game's own persistent identifier, so the
 * choice survives every later import and live sync.
 */
export type CraftIgnore = { runeId: string; kind: CraftKind; statId: number };

export type CraftIgnores = CraftIgnore[];

export const blankCraftIgnores = (): CraftIgnores => [];

/** One text per entry, for a `Set` lookup and a duplicate check. */
export const craftIgnoreKey = ({ runeId, kind, statId }: CraftIgnore): string => `${runeId}:${kind}:${statId}`;

export function withCraftIgnore(ignores: CraftIgnores, entry: CraftIgnore): CraftIgnores {
  const key = craftIgnoreKey(entry);
  if (ignores.some((held) => craftIgnoreKey(held) === key)) return ignores;
  return [...ignores, entry];
}

const isCraftIgnore = (value: unknown): value is CraftIgnore => isRecord(value)
  && typeof value.runeId === 'string' && value.runeId.length > 0
  && (value.kind === 'gem' || value.kind === 'grindstone')
  && typeof value.statId === 'number' && runeStatIds.includes(value.statId);

/**
 * The stored choices, entry by entry (`preference-reading.ts`): an entry the
 * contract cannot read, or one already listed, is dropped alone.
 */
export function readCraftIgnores(value: unknown): CraftIgnores {
  let read = blankCraftIgnores();
  // The developer's saved choices survive the removal of per-view lists (§0).
  // Their entries already satisfy this contract; no field is repaired or guessed.
  const stored = Array.isArray(value) ? value : isRecord(value)
    ? [value.selected, value.missing].flatMap((entries) => Array.isArray(entries) ? entries : []) : [];
  for (const entry of stored) {
    if (isCraftIgnore(entry)) read = withCraftIgnore(read, { runeId: entry.runeId, kind: entry.kind, statId: entry.statId });
  }
  return read;
}
