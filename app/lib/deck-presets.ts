import type { GameRecord } from './game-data';
import { readRune } from './runes';

/**
 * Where the export keeps a saved deck. Attack decks live in `deck_list`, named
 * by two numbers; the Arena defense and the Arena Interserver defense each
 * have a field of their own (`DECK-PRESETS.md` §3).
 */
export type DeckSource =
  | { kind: 'deck'; deckType: number; deckSequence: number }
  | { kind: 'arena-defense' }
  | { kind: 'interserver-defense' };

/** What one monster of a deck carries in that deck. */
export type DeckGear = { runeIds: readonly string[]; artifactIds: readonly string[] };

export type DeckPreset = {
  /** Unique across the account: `deck-<type>-<seq>`, `arena-defense` or `interserver-defense`. */
  key: string;
  source: DeckSource;
  /** The deck's monsters in the order the game lists them. */
  members: readonly string[];
  /** Whose leader skill the deck runs, `null` for none. Always a member. */
  leaderUnitId: string | null;
  /**
   * Whether the deck saved its monsters' runes and artifacts, or only the
   * monsters. A deck that did not runs each monster on its Scenario gear.
   */
  savesGear: boolean;
  gear: ReadonlyMap<string, DeckGear>;
  runeOwnerById: ReadonlyMap<string, string>;
  artifactOwnerById: ReadonlyMap<string, string>;
  /** A saved deck can name a rune, artifact or monster the account no longer owns. Keep that fact visible. */
  missingRuneIds: readonly string[];
  missingArtifactIds: readonly string[];
  missingUnitIds: readonly string[];
};

function record(value: unknown): value is GameRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveId(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value) : null;
}

function runeRecords(data: GameRecord): GameRecord[] {
  const units = Array.isArray(data.unit_list) ? data.unit_list : [];
  return [
    ...(Array.isArray(data.runes) ? data.runes : []),
    ...units.flatMap((unit) => record(unit) && Array.isArray(unit.runes) ? unit.runes : []),
  ].filter(record);
}

type Owned = { runes: ReadonlyMap<string, number>; artifacts: ReadonlySet<string>; units: ReadonlySet<string> };

function ownedItems(data: GameRecord): Owned {
  const runes = new Map<string, number>();
  for (const source of runeRecords(data)) {
    const rune = readRune(source);
    if (!rune) throw new Error('This account contains a rune JASWA cannot read.');
    runes.set(rune.id, rune.slot);
  }
  const artifacts = new Set(
    [...(Array.isArray(data.artifacts) ? data.artifacts : []),
      ...(Array.isArray(data.unit_list) ? data.unit_list : []).flatMap((unit) => record(unit) && Array.isArray(unit.artifacts) ? unit.artifacts : [])]
      .filter(record).map((artifact) => positiveId(artifact.rid)).filter((id): id is string => id !== null),
  );
  /* Only the roster: a monster in the Normal Sealed Shrine can stand in a saved
     deck (v9.2.0 replaced the shrine's own temporary engravings with presets),
     but no page reads its stats or gear from there, so counting it as owned
     made it a member every figure skipped in silence. It is missing here as it
     is from a preset built in JASWA, and the Presets page names it. */
  const units = new Set((Array.isArray(data.unit_list) ? data.unit_list : [])
    .filter(record).map((unit) => positiveId(unit.unit_id)).filter((id): id is string => id !== null));
  return { runes, artifacts, units };
}

/* A deck lists its monsters in fixed positions and writes `0` for an empty
   one. The Interserver defense writes each position as `{pos_id, unit_id}`. */
function readMembers(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('This account contains a Deck Preset without a monster list.');
  const members: string[] = [];
  for (const entry of value) {
    const raw = record(entry) ? entry.unit_id : entry;
    if (raw === 0) continue;
    const unitId = positiveId(raw);
    if (unitId === null || members.includes(unitId)) {
      throw new Error('This account contains a Deck Preset with an invalid or repeated monster.');
    }
    members.push(unitId);
  }
  return members;
}

/**
 * One saved deck. Its runes and artifacts belong to the deck, never to the
 * item itself: one rune may sit on different monsters in different decks
 * (`DECK-PRESETS.md` §1, rule 3), but only once within this one.
 */
function readDeck(source: GameRecord, deckSource: DeckSource, key: string, leader: unknown, owned: Owned): DeckPreset {
  const members = readMembers(source.unit_id_list);
  const leaderUnitId = leader === undefined || leader === 0 ? null : positiveId(leader);
  if (leader !== undefined && leader !== 0 && (leaderUnitId === null || !members.includes(leaderUnitId))) {
    throw new Error('This account contains a Deck Preset whose leader is not one of its monsters.');
  }
  if (source.equip !== null && source.equip !== undefined && !Array.isArray(source.equip)) {
    throw new Error('This account contains an invalid Deck Preset engravings list.');
  }
  const entries = Array.isArray(source.equip) ? source.equip : [];
  const gear = new Map<string, DeckGear>();
  const runeOwnerById = new Map<string, string>();
  const artifactOwnerById = new Map<string, string>();
  const missingRuneIds: string[] = [];
  const missingArtifactIds: string[] = [];
  for (const entry of entries) {
    if (!record(entry) || !Array.isArray(entry.rune_id_list)
      || entry.artifact_id_list !== undefined && !Array.isArray(entry.artifact_id_list)) {
      throw new Error('This account contains invalid Deck Preset engravings.');
    }
    /* A member the account no longer holds keeps its engravings readable: it
       is one more missing member, named on the Presets page, and never a
       reason to refuse the whole account. */
    const unitId = positiveId(entry.unit_id);
    if (unitId === null) throw new Error('This Deck Preset engraves gear on an invalid monster ID.');
    if (!members.includes(unitId) || gear.has(unitId)) {
      throw new Error('This Deck Preset engraves gear on a monster outside the preset, or twice on one.');
    }
    const slots = new Set<number>();
    const runeIds: string[] = [];
    for (const value of entry.rune_id_list) {
      const runeId = positiveId(value);
      if (runeId === null || runeOwnerById.has(runeId)) {
        throw new Error('This Deck Preset assigns a rune more than once or has an invalid rune ID.');
      }
      runeOwnerById.set(runeId, unitId);
      runeIds.push(runeId);
      const slot = owned.runes.get(runeId);
      if (slot === undefined) {
        missingRuneIds.push(runeId);
      } else if (slots.has(slot)) {
        throw new Error('This Deck Preset assigns two runes to one monster slot.');
      } else {
        slots.add(slot);
      }
    }
    const artifactIds: string[] = [];
    for (const value of Array.isArray(entry.artifact_id_list) ? entry.artifact_id_list : []) {
      const artifactId = positiveId(value);
      if (artifactId === null || artifactOwnerById.has(artifactId)) {
        throw new Error('This Deck Preset assigns an artifact more than once or has an invalid artifact ID.');
      }
      artifactOwnerById.set(artifactId, unitId);
      artifactIds.push(artifactId);
      if (!owned.artifacts.has(artifactId)) missingArtifactIds.push(artifactId);
    }
    gear.set(unitId, { runeIds, artifactIds });
  }
  const missingUnitIds = members.filter((unitId) => !owned.units.has(unitId));
  /* The game saves a deck's gear for all of its monsters or for none. A deck
     that saved some would leave the rest neither on their own gear nor on the
     deck's, and JASWA will not guess which the game means. */
  const savesGear = gear.size > 0;
  if (savesGear && members.some((unitId) => owned.units.has(unitId) && !gear.has(unitId))) {
    throw new Error('This Deck Preset saves engravings for some of its monsters but not all.');
  }
  return { key, source: deckSource, members, leaderUnitId, savesGear, gear,
    runeOwnerById, artifactOwnerById, missingRuneIds, missingArtifactIds, missingUnitIds };
}

/** Every saved deck the account holds, attack and defense alike. */
export function readDeckPresets(data: GameRecord): DeckPreset[] {
  if (data.deck_list !== undefined && !Array.isArray(data.deck_list)) {
    throw new Error('This account contains an invalid Deck Preset list.');
  }
  const owned = ownedItems(data);
  const keys = new Set<string>();
  const decks = (Array.isArray(data.deck_list) ? data.deck_list : []).map((source): DeckPreset => {
    if (!record(source)) throw new Error('This account contains an invalid Deck Preset.');
    const deckType = source.deck_type;
    const deckSequence = source.deck_seq;
    if (typeof deckType !== 'number' || !Number.isSafeInteger(deckType) || deckType <= 0
      || typeof deckSequence !== 'number' || !Number.isSafeInteger(deckSequence) || deckSequence <= 0) {
      throw new Error('This account contains an invalid Deck Preset identity.');
    }
    const key = `deck-${deckType}-${deckSequence}`;
    if (keys.has(key)) throw new Error('This account contains duplicate Deck Preset identities.');
    keys.add(key);
    return readDeck(source, { kind: 'deck', deckType, deckSequence }, key, source.leader_unit_id, owned);
  });
  /* A defense deck carries no leader field. The game's defense screen puts the
     leader in the first position, so the first monster is the leader. */
  for (const [field, kind] of [['defense_deck_info', 'arena-defense'], ['server_arena_defense_deck_info', 'interserver-defense']] as const) {
    const source = data[field];
    if (source === undefined || source === null) continue;
    if (!record(source)) throw new Error('This account contains an invalid Arena defense preset.');
    const members = readMembers(source.unit_id_list);
    decks.push(readDeck(source, { kind }, kind, members.length > 0 ? Number(members[0]) : undefined, owned));
  }
  return decks;
}
