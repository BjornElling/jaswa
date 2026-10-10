import type { GameRecord } from './game-data';
import { isRecord } from './preference-reading';
import { readRune } from './runes';
import { presetPool } from './presets';
import type { OwnPreset, Preset } from './presets';
import type { ImportedGame } from './types';

/* A rune record's place in Default as the export states it: the monster it is engraved on, or `null`. */
function placeOf(record: GameRecord): string | null {
  return record.occupied_type === 1 ? String(record.occupied_id) : null;
}

/**
 * Where each rune sat in a preset before its first engraving here: the
 * monster's `unit_id`, or `null` where the preset had it on none. A rune
 * already remembered keeps its first entry: the question the record answers is
 * "where did the game have it", not "where was it a moment ago".
 */
function remember(game: ImportedGame, presetId: string, before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>,
  runeIds: readonly string[]): ImportedGame['loadedPlacements'] {
  const loaded = { ...game.loadedPlacements };
  const placements = { ...loaded[presetId] };
  for (const id of new Set([...runeIds, ...before.keys()])) {
    const was = before.get(id) ?? null;
    if (was === (after.get(id) ?? null) || id in placements) continue;
    placements[id] = was;
  }
  loaded[presetId] = placements;
  return loaded;
}

/* Up to six runes, one per slot: a whole build, or a monster's runes with one locked in or excluded (`runesWithLocked`, `runesWithout`). */
function checkBuild(data: GameRecord, unitId: string, runeIds: readonly string[]): void {
  const units = data.unit_list;
  const records = data.runes;
  if (!Array.isArray(units) || !Array.isArray(records) || runeIds.length > 6 || new Set(runeIds).size !== runeIds.length
    || !units.some((unit) => isRecord(unit) && String(unit.unit_id) === unitId)) {
    throw new Error('This build cannot be engraved on the selected monster.');
  }
  const picked = new Set(runeIds);
  const slots = new Set<number>();
  let found = 0;
  for (const record of records) {
    const rune = readRune(record);
    if (!rune) throw new Error('This import contains a rune JASWA cannot read.');
    if (!picked.has(rune.id)) continue;
    found += 1;
    slots.add(rune.slot);
  }
  if (found !== runeIds.length || slots.size !== runeIds.length) throw new Error('A rune in this build is missing or has the wrong slot.');
}

/**
 * The runes a monster carries in a preset once `runeId` is engraved on it: the
 * rune takes its slot, and whatever stood there goes to the inventory. What a
 * lock engraves, through the same route as a whole build. A sold rune the
 * preset still names has no slot to keep and is left out.
 */
export function runesWithLocked(preset: Preset, unitId: string, runeId: string, slotOf: (runeId: string) => number | undefined): string[] {
  const slot = slotOf(runeId);
  return [...(preset.runesOf.get(unitId) ?? []).filter((id) => id !== runeId && slotOf(id) !== undefined && slotOf(id) !== slot), runeId];
}

/** The runes a monster carries in a preset once `runeId` is taken off it, to the inventory: what an exclusion removes. */
export function runesWithout(preset: Preset, unitId: string, runeId: string, slotOf: (runeId: string) => number | undefined): string[] {
  return (preset.runesOf.get(unitId) ?? []).filter((id) => id !== runeId && slotOf(id) !== undefined);
}

/** Move a monster's runes — a build's six, or its own with one locked in or taken off — in Default, then rebuild each monster's runes from
 * the account list so every workspace reads the same placement. */
export function engraveRuneBuild(data: GameRecord, unitId: string, runeIds: readonly string[]): GameRecord {
  checkBuild(data, unitId, runeIds);
  const units = data.unit_list as unknown[];
  const picked = new Set(runeIds);
  const runes = (data.runes as GameRecord[]).map((rune) => {
    const chosen = picked.has(String(rune.rune_id));
    if (!chosen && !(rune.occupied_type === 1 && String(rune.occupied_id) === unitId)) return rune;
    return { ...rune, occupied_type: chosen ? 1 : 2, occupied_id: chosen ? Number(unitId) : 0 };
  });
  const engraved = new Map<string, GameRecord[]>();
  for (const rune of runes) {
    if (rune.occupied_type !== 1) continue;
    const owner = String(rune.occupied_id);
    const list = engraved.get(owner) ?? [];
    list.push(rune);
    engraved.set(owner, list);
  }
  return { ...data, runes, unit_list: units.map((unit) => {
    const monster = unit as GameRecord;
    return { ...monster, runes: engraved.get(String(monster.unit_id)) ?? [] };
  }) };
}

/**
 * A preset's gear with six runes engraved on one of its monsters: those runes
 * leave whichever other member carried them in this preset, and nothing
 * outside the preset — or its pool — changes (`DECK-PRESETS.md` §4). A preset that saved only
 * its monsters takes every member's Default gear first, because a preset holds
 * all of its monsters' gear or none.
 */
function engravedGear(preset: Preset, unitId: string, runeIds: readonly string[]): Map<string, { runeIds: string[]; artifactIds: string[] }> {
  if (!preset.members.includes(unitId)) throw new Error('This monster is not in the selected preset.');
  const picked = new Set(runeIds);
  return new Map(preset.members.map((member) => [member, {
    runeIds: member === unitId ? [...runeIds] : (preset.runesOf.get(member) ?? []).filter((id) => !picked.has(id)),
    artifactIds: [...(preset.artifactsOf.get(member) ?? [])],
  }]));
}

/* The export's own record of a saved deck: `deck_list` for an attack deck, a
   field of its own for each Arena defense. */
function withDeckEquip(data: GameRecord, preset: Preset, equip: GameRecord[]): GameRecord {
  const source = preset.deck?.source;
  if (!source) throw new Error('This preset has no saved deck to engrave in.');
  if (source.kind === 'deck') {
    const decks = Array.isArray(data.deck_list) ? data.deck_list : [];
    return { ...data, deck_list: decks.map((deck) => isRecord(deck) && deck.deck_type === source.deckType && deck.deck_seq === source.deckSequence
      ? { ...deck, equip } : deck) };
  }
  const field = source.kind === 'arena-defense' ? 'defense_deck_info' : 'server_arena_defense_deck_info';
  return { ...data, [field]: { ...(data[field] as GameRecord), equip } };
}

/* The export's `equip` for a preset's gear. */
function equipOf(gear: ReadonlyMap<string, { runeIds: readonly string[]; artifactIds: readonly string[] }>): GameRecord[] {
  return [...gear].map(([member, entry]) => ({
    unit_id: Number(member), rune_id_list: entry.runeIds.map(Number), artifact_id_list: entry.artifactIds.map(Number),
  }));
}

/**
 * Engrave a build in Default or in one of the game's presets, remembering where
 * each rune it moves sat. In a pool (`DECK-PRESETS.md` §1, rules 4 and 5) the
 * build's runes also leave the pool's other decks, as they would in the game,
 * and a deck that saved only its monsters writes down their Default gear first;
 * `presets` is every preset, so the pool can be found.
 */
export function engraveImportedGame(game: ImportedGame, preset: Preset, unitId: string, runeIds: readonly string[],
  presets: readonly Preset[]): ImportedGame {
  if (preset.kind === 'own') throw new Error('A preset built in JASWA is engraved in the preferences.');
  checkBuild(game.data, unitId, runeIds);
  if (preset.kind === 'default') {
    const data = engraveRuneBuild(game.data, unitId, runeIds);
    const owners = (records: unknown) => new Map((records as GameRecord[]).flatMap((record) => {
      const place = placeOf(record);
      return place === null ? [] : [[String(record.rune_id), place] as const];
    }));
    return { ...game, data, loadedPlacements: remember(game, preset.id, owners(game.data.runes), owners(data.runes), runeIds) };
  }
  const picked = new Set(runeIds);
  const others = presetPool(preset, presets).filter((entry) => entry.id !== preset.id);
  /* What the pool's other decks saved stays theirs: a deck writing down its
     Default gear for the first time leaves out what another deck already holds,
     since Default may have moved since that deck was saved. */
  const savedBy = (decks: readonly Preset[]) => new Set(decks.filter((deck) => deck.savesGear)
    .flatMap((deck) => deck.members.flatMap((member) => [...deck.runesOf.get(member) ?? [], ...deck.artifactsOf.get(member) ?? []])));
  const without = (gear: Map<string, { runeIds: string[]; artifactIds: string[] }>, taken: ReadonlySet<string>, keep: string) =>
    new Map([...gear].map(([member, entry]) => [member, member === keep ? entry : {
      runeIds: entry.runeIds.filter((id) => !taken.has(id)), artifactIds: entry.artifactIds.filter((id) => !taken.has(id)),
    }]));
  const ownGear = without(engravedGear(preset, unitId, runeIds), savedBy(others), unitId);
  const held = new Set([...ownGear.values()].flatMap((entry) => [...entry.runeIds, ...entry.artifactIds]));
  const writes: [Preset, Map<string, { runeIds: string[]; artifactIds: string[] }>][] = [[preset, ownGear]];
  for (const deck of others) {
    if (!deck.members.some((member) => (deck.runesOf.get(member) ?? []).some((id) => picked.has(id)))) continue;
    const taken = new Set([...held, ...savedBy(others.filter((entry) => entry.id !== deck.id))]);
    writes.push([deck, new Map(deck.members.map((member) => [member, {
      runeIds: (deck.runesOf.get(member) ?? []).filter((id) => !taken.has(id)),
      artifactIds: (deck.artifactsOf.get(member) ?? []).filter((id) => !taken.has(id)),
    }]))]);
  }
  let next = game;
  for (const [deck, gear] of writes) {
    const after = new Map([...gear].flatMap(([member, entry]) => entry.runeIds.map((id) => [id, member] as const)));
    next = { ...next, data: withDeckEquip(next.data, deck, equipOf(gear)),
      loadedPlacements: remember(next, deck.id, deck.runeOwner, after, deck === preset ? runeIds : []) };
  }
  return next;
}

/** Engrave a build in a preset built in JASWA. */
export function engraveOwnPreset(own: OwnPreset, preset: Preset, unitId: string, runeIds: readonly string[]): OwnPreset {
  return { ...own, gear: Object.fromEntries(engravedGear(preset, unitId, runeIds)) };
}

/**
 * The stored record read back one entry at a time (`AGENTS.md` §6): an entry
 * that is not a rune id against a monster id or `null` is dropped, and the rest
 * kept. A malformed record costs the "Previously" line, never the import.
 */
export function readLoadedPlacements(value: unknown): ImportedGame['loadedPlacements'] {
  if (!isRecord(value)) return undefined;
  const read: Record<string, Record<string, string | null>> = {};
  for (const [presetId, placements] of Object.entries(value)) {
    if (presetId.length === 0 || !isRecord(placements)) continue;
    const entries = Object.entries(placements)
      .filter(([runeId, place]) => runeId.length > 0 && (place === null || (typeof place === 'string' && place.length > 0)));
    if (entries.length > 0) read[presetId] = Object.fromEntries(entries) as Record<string, string | null>;
  }
  return Object.keys(read).length > 0 ? read : undefined;
}
