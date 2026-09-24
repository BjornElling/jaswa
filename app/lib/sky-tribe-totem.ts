/**
 * The account's Sky Tribe Totem, read from the export's `deco_list`.
 *
 * The totem is decoration `master_id` 6 — the id RuneManager and every optimizer
 * reading the same export key their speed shrine on. Its level is the whole
 * story: the bonus is a percentage of base speed fixed by level
 * (`totemPercentByLevel`), applied in arena and dungeons alike.
 */
import type { GameRecord } from './game-data';
import { totemMaximumLevel, totemPercentByLevel } from './speed-tick';

export const skyTribeTotemMasterId = 6;

export type SkyTribeTotem =
  | { state: 'built'; level: number; percent: number }
  /** The export lists the island's decorations and the totem is not among them. */
  | { state: 'not-built' }
  /** The export carries no decoration list at all, so the totem cannot be known. */
  | { state: 'unknown' };

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTotemLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= totemMaximumLevel;
}

/**
 * Why a decoration list cannot be read, or `undefined` when it can. The import
 * rejects on this rather than guessing a level, because a totem the page read
 * as absent would shift every arena and dungeon speed on it without a word.
 */
export function skyTribeTotemProblem(data: GameRecord): string | undefined {
  if (data.deco_list === undefined) return undefined;
  if (!Array.isArray(data.deco_list) || !data.deco_list.every(isRecord)) {
    return 'This file contains a building list JASWA cannot read.';
  }
  const totems = data.deco_list.filter((deco) => deco.master_id === skyTribeTotemMasterId);
  if (totems.length > 1) return 'This file lists more than one Sky Tribe Totem.';
  if (totems.length === 1 && !isTotemLevel(totems[0].level)) return 'This file contains a Sky Tribe Totem JASWA cannot read.';
  return undefined;
}

export function readSkyTribeTotem(data: GameRecord | undefined): SkyTribeTotem {
  if (!data || !Array.isArray(data.deco_list)) return { state: 'unknown' };
  const totem = data.deco_list.find((deco) => isRecord(deco) && deco.master_id === skyTribeTotemMasterId);
  if (!isRecord(totem) || !isTotemLevel(totem.level)) return { state: 'not-built' };
  return { state: 'built', level: totem.level, percent: totemPercentByLevel[totem.level] };
}

/** The totem's percentage of base speed, where the page must count something. */
export function totemPercent(totem: SkyTribeTotem): number {
  return totem.state === 'built' ? totem.percent : 0;
}
