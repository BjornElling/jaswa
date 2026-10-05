import type { GameRecord } from './game-data';
import { readRune } from './runes';

export type DeckPreset = {
  /** The game identifies a saved deck by both fields. Neither identifies a content name alone. */
  deckType: number;
  deckSequence: number;
  /** An absent equipment list is a saved monster deck without saved engravings. */
  hasEquipment: boolean;
  runeOwnerById: ReadonlyMap<string, string>;
  artifactOwnerById: ReadonlyMap<string, string>;
  /** A saved deck can refer to a rune the account no longer owns. Keep that fact visible. */
  missingRuneIds: readonly string[];
  missingArtifactIds: readonly string[];
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

/**
 * A physical rune is shared across decks. Its owner is therefore a property of
 * a particular saved deck, never a property of the rune itself. Missing rune
 * references remain visible because the game can retain an old saved deck after
 * the player sells one of its runes.
 */
export function readDeckPresets(data: GameRecord): DeckPreset[] {
  if (data.deck_list === undefined) return [];
  if (!Array.isArray(data.deck_list)) throw new Error('This account contains an invalid Deck Preset list.');

  const ownedRunes = new Map<string, number>();
  for (const source of runeRecords(data)) {
    const rune = readRune(source);
    if (!rune) throw new Error('This account contains a rune JASWA cannot read.');
    ownedRunes.set(rune.id, rune.slot);
  }
  const ownedArtifacts = new Set(
    [...(Array.isArray(data.artifacts) ? data.artifacts : []),
      ...(Array.isArray(data.unit_list) ? data.unit_list : []).flatMap((unit) => record(unit) && Array.isArray(unit.artifacts) ? unit.artifacts : [])]
      .filter(record).map((artifact) => positiveId(artifact.rid)).filter((id): id is string => id !== null),
  );
  const ownedUnits = new Set(
    [...(Array.isArray(data.unit_list) ? data.unit_list : []),
      ...(Array.isArray(data.unit_storage_normal_list) ? data.unit_storage_normal_list : [])]
      .filter(record).map((unit) => positiveId(unit.unit_id)).filter((id): id is string => id !== null),
  );
  const keys = new Set<string>();
  return data.deck_list.map((source): DeckPreset => {
    if (!record(source)) throw new Error('This account contains an invalid Deck Preset.');
    const deckType = source.deck_type;
    const deckSequence = source.deck_seq;
    if (typeof deckType !== 'number' || !Number.isSafeInteger(deckType) || deckType <= 0
      || typeof deckSequence !== 'number' || !Number.isSafeInteger(deckSequence) || deckSequence <= 0) {
      throw new Error('This account contains an invalid Deck Preset identity.');
    }
    const key = `${deckType}:${deckSequence}`;
    if (keys.has(key)) throw new Error('This account contains duplicate Deck Preset identities.');
    keys.add(key);
    if (source.equip !== null && source.equip !== undefined && !Array.isArray(source.equip)) {
      throw new Error('This account contains an invalid Deck Preset equipment list.');
    }
    const equipment = Array.isArray(source.equip) ? source.equip : null;
    const runeOwnerById = new Map<string, string>();
    const artifactOwnerById = new Map<string, string>();
    const missingRuneIds: string[] = [];
    const missingArtifactIds: string[] = [];
    const slotsByUnit = new Map<string, Set<number>>();
    for (const entry of equipment ?? []) {
      if (!record(entry) || !Array.isArray(entry.rune_id_list)
        || entry.artifact_id_list !== undefined && !Array.isArray(entry.artifact_id_list)) {
        throw new Error('This account contains invalid Deck Preset equipment.');
      }
      const unitId = positiveId(entry.unit_id);
      if (unitId === null || !ownedUnits.has(unitId)) {
        throw new Error('This Deck Preset names a monster JASWA cannot find.');
      }
      const slots = slotsByUnit.get(unitId) ?? new Set<number>();
      for (const value of entry.rune_id_list) {
        const runeId = positiveId(value);
        if (runeId === null || runeOwnerById.has(runeId)) {
          throw new Error('This Deck Preset assigns a rune more than once or has an invalid rune ID.');
        }
        runeOwnerById.set(runeId, unitId);
        const slot = ownedRunes.get(runeId);
        if (slot === undefined) {
          missingRuneIds.push(runeId);
        } else if (slots.has(slot)) {
          throw new Error('This Deck Preset assigns two runes to one monster slot.');
        } else {
          slots.add(slot);
        }
      }
      for (const value of Array.isArray(entry.artifact_id_list) ? entry.artifact_id_list : []) {
        const artifactId = positiveId(value);
        if (artifactId === null || artifactOwnerById.has(artifactId)) {
          throw new Error('This Deck Preset assigns an artifact more than once or has an invalid artifact ID.');
        }
        artifactOwnerById.set(artifactId, unitId);
        if (!ownedArtifacts.has(artifactId)) missingArtifactIds.push(artifactId);
      }
      slotsByUnit.set(unitId, slots);
    }
    return { deckType, deckSequence, hasEquipment: equipment !== null,
      runeOwnerById, artifactOwnerById, missingRuneIds, missingArtifactIds };
  });
}
