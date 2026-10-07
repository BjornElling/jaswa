import type { GameRecord } from './game-data';
import { readRune } from './runes';
import type { ImportedGame } from './types';

/* A rune record's place as the export states it: the monster it is engraved on, or `null`. */
function placeOf(record: GameRecord): string | null {
  return record.occupied_type === 1 ? String(record.occupied_id) : null;
}

/**
 * Engrave a build on a whole import, remembering where each rune it moves sat
 * when the import was loaded. A rune already remembered keeps its first entry:
 * the question the record answers is "where did the game have it", not "where
 * was it a moment ago".
 */
export function engraveImportedGame(game: ImportedGame, unitId: string, runeIds: readonly string[]): ImportedGame {
  const data = engraveRuneBuild(game.data, unitId, runeIds);
  const before = new Map((game.data.runes as GameRecord[]).map((record) => [String(record.rune_id), placeOf(record)]));
  const loaded = { ...game.loadedRuneLocations };
  for (const record of data.runes as GameRecord[]) {
    const id = String(record.rune_id);
    const was = before.get(id);
    if (was === undefined || was === placeOf(record) || id in loaded) continue;
    loaded[id] = was;
  }
  return { ...game, data, loadedRuneLocations: loaded };
}

/**
 * The stored record read back one rune at a time (`AGENTS.md` §6): an entry
 * that is not a rune id against a monster id or `null` is dropped, and the rest
 * kept. A malformed record costs the "Previously" line, never the import.
 */
export function readLoadedRuneLocations(value: unknown): Record<string, string | null> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const read: Record<string, string | null> = {};
  for (const [runeId, place] of Object.entries(value)) {
    if (runeId.length > 0 && (place === null || (typeof place === 'string' && place.length > 0))) read[runeId] = place;
  }
  return Object.keys(read).length > 0 ? read : undefined;
}

/** Move six physical runes in the prepared import, then rebuild each monster's
 * gear from the account list so every workspace reads the same placement. */
export function engraveRuneBuild(data: GameRecord, unitId: string, runeIds: readonly string[]): GameRecord {
  const units = data.unit_list;
  const records = data.runes;
  if (!Array.isArray(units) || !Array.isArray(records) || runeIds.length !== 6 || new Set(runeIds).size !== 6
    || !units.some((unit) => unit && typeof unit === 'object' && String((unit as GameRecord).unit_id) === unitId)) {
    throw new Error('This build cannot be engraved on the selected monster.');
  }
  const picked = new Set(runeIds);
  const slots = new Set<number>();
  const available = new Set<string>();
  for (const record of records) {
    const rune = readRune(record);
    if (!rune) throw new Error('This import contains a rune JASWA cannot read.');
    if (!picked.has(rune.id)) continue;
    available.add(rune.id);
    slots.add(rune.slot);
  }
  if (available.size !== 6 || slots.size !== 6) throw new Error('A rune in this build is missing or has the wrong slot.');

  const runes = records.map((record) => {
    const rune = record as GameRecord;
    const id = String(rune.rune_id);
    const chosen = picked.has(id);
    if (!chosen && !(rune.occupied_type === 1 && String(rune.occupied_id) === unitId)) return rune;
    return { ...rune, occupied_type: chosen ? 1 : 2, occupied_id: chosen ? Number(unitId) : 0 };
  });
  const engraved = new Map<string, GameRecord[]>();
  for (const rune of runes) {
    if ((rune as GameRecord).occupied_type !== 1) continue;
    const owner = String((rune as GameRecord).occupied_id);
    const list = engraved.get(owner) ?? [];
    list.push(rune as GameRecord);
    engraved.set(owner, list);
  }
  return { ...data, runes, unit_list: units.map((unit) => {
    const monster = unit as GameRecord;
    return { ...monster, runes: engraved.get(String(monster.unit_id)) ?? [] };
  }) };
}
