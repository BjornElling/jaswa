import type { GameRecord } from './game-data';
import { readRune } from './runes';

/** Move six physical runes in the prepared import, then rebuild each monster's
 * equipment from the account list so every workspace reads the same placement. */
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
    const equipped = picked.has(id);
    if (!equipped && !(rune.occupied_type === 1 && String(rune.occupied_id) === unitId)) return rune;
    return { ...rune, occupied_type: equipped ? 1 : 2, occupied_id: equipped ? Number(unitId) : 0 };
  });
  const worn = new Map<string, GameRecord[]>();
  for (const rune of runes) {
    if ((rune as GameRecord).occupied_type !== 1) continue;
    const owner = String((rune as GameRecord).occupied_id);
    const list = worn.get(owner) ?? [];
    list.push(rune as GameRecord);
    worn.set(owner, list);
  }
  return { ...data, runes, unit_list: units.map((unit) => {
    const monster = unit as GameRecord;
    return { ...monster, runes: worn.get(String(monster.unit_id)) ?? [] };
  }) };
}
