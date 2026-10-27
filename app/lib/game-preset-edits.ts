import type { GameRecord } from './game-data';
import { isRecord } from './preference-reading';
import type { Preset } from './presets';
import type { ImportedGame } from './types';

/*
 * The changes the Presets page makes to one of the game's presets: taking it
 * away, naming its leader, and taking a monster in or out. All are written into
 * the import, where the game's presets live, as an engrave is — so the next
 * import from the game states the game's own presets again, and live sync,
 * which would put them back at once, refuses them all.
 */

function sourceOf(preset: Preset) {
  if (preset.kind !== 'game' || !preset.deck) throw new Error('Only a preset from the game is kept in the import.');
  return preset.deck.source;
}

function sameDeck(entry: unknown, type: number, sequence: number): boolean {
  return isRecord(entry) && entry.deck_type === type && entry.deck_seq === sequence;
}

const defenseField = { 'arena-defense': 'defense_deck_info', 'interserver-defense': 'server_arena_defense_deck_info' } as const;

/* Positions are written as a bare id or, for the Interserver defense, as `{pos_id, unit_id}`. */
const idOf = (entry: unknown) => String(isRecord(entry) ? entry.unit_id : entry);
const put = (entry: unknown, id: unknown) => (isRecord(entry) ? { ...entry, unit_id: id } : id);

/* The export's record of the deck behind a game preset. */
function deckOf(game: ImportedGame, preset: Preset): GameRecord {
  const source = sourceOf(preset);
  const deck = source.kind === 'deck'
    ? (Array.isArray(game.data.deck_list) ? game.data.deck_list : []).find((entry) => sameDeck(entry, source.deckType, source.deckSequence))
    : game.data[defenseField[source.kind]];
  if (!isRecord(deck)) throw new Error('This preset is not in the import.');
  return deck;
}

/* The import with the deck behind a game preset rewritten by `change`. */
function withDeck(game: ImportedGame, preset: Preset, change: (deck: GameRecord) => GameRecord): ImportedGame {
  const source = sourceOf(preset);
  if (source.kind === 'deck') {
    const decks = Array.isArray(game.data.deck_list) ? game.data.deck_list : [];
    return { ...game, data: { ...game.data, deck_list: decks.map((entry) => sameDeck(entry, source.deckType, source.deckSequence)
      ? change(entry as GameRecord) : entry) } };
  }
  return { ...game, data: { ...game.data, [defenseField[source.kind]]: change(deckOf(game, preset)) } };
}

function positionsOf(deck: GameRecord): unknown[] {
  if (!Array.isArray(deck.unit_id_list)) throw new Error('This preset has no monster list.');
  return deck.unit_id_list;
}

/**
 * Whether a game preset has a place for one more monster: an empty position in
 * its list, or a list shorter than its content's team. A deck whose content is
 * not yet named is as large as the list the game saved.
 */
export function gamePresetHasRoom(game: ImportedGame, preset: Preset): boolean {
  if (preset.kind !== 'game' || !preset.deck) return false;
  const positions = positionsOf(deckOf(game, preset));
  return positions.some((entry) => idOf(entry) === '0')
    || (preset.content !== null && positions.length < preset.content.teamSize);
}

/**
 * The game's preset with `unitId` in its first empty position. A preset that
 * saved its monsters' gear gives the newcomer its Scenario gear, less whatever
 * this preset — or another deck of its pool — already engraves: one rune, one
 * monster, inside a preset or a pool. The game saves a deck's gear for all of
 * its monsters or none. A monster another deck of a pool sharing its monsters
 * holds cannot come in at all.
 */
export function addToGamePreset(game: ImportedGame, preset: Preset, fallback: Preset, unitId: string): ImportedGame {
  if (preset.members.includes(unitId)) return game;
  if (!gamePresetHasRoom(game, preset)) throw new Error('This preset is full.');
  if (preset.poolTakenUnitIds.has(unitId)) throw new Error('This monster already stands in another team of this content.');
  const unit = Number(unitId);
  return withDeck(game, preset, (deck) => {
    const positions = positionsOf(deck);
    const empty = positions.findIndex((entry) => idOf(entry) === '0');
    const nextPosition = Math.max(0, ...positions.map((entry) => (isRecord(entry) && typeof entry.pos_id === 'number' ? entry.pos_id : 0))) + 1;
    const unit_id_list = empty >= 0 ? positions.map((entry, at) => (at === empty ? put(entry, unit) : entry))
      : [...positions, positions.some(isRecord) ? { pos_id: nextPosition, unit_id: unit } : unit];
    if (!preset.savesGear) return { ...deck, unit_id_list };
    const taken = new Set([...preset.runeOwner.keys(), ...preset.artifactOwner.keys(), ...preset.poolRunes.keys(),...preset.poolArtifactIds]);
    const runeIds = (fallback.runesOf.get(unitId) ?? []).filter((id) => !taken.has(id));
    const artifactIds = (fallback.artifactsOf.get(unitId) ?? []).filter((id) => !taken.has(id));
    const equip = [...(Array.isArray(deck.equip) ? deck.equip : []),
      { unit_id: unit, rune_id_list: runeIds.map(Number), artifact_id_list: artifactIds.map(Number) }];
    return { ...deck, unit_id_list, equip };
  });
}

/**
 * The game's preset with `unitId` taken out: its position emptied, as the game
 * writes an empty one, and its gear in this preset gone with it. A leader taken
 * out leaves an attack deck without one; a defense is led by whoever now stands
 * first.
 */
export function removeFromGamePreset(game: ImportedGame, preset: Preset, unitId: string): ImportedGame {
  if (!preset.members.includes(unitId)) return game;
  return withDeck(game, preset, (deck) => {
    const unit_id_list = positionsOf(deck).map((entry) => (idOf(entry) === unitId ? put(entry, 0) : entry));
    const equip = Array.isArray(deck.equip) ? deck.equip.filter((entry) => !isRecord(entry) || String(entry.unit_id) !== unitId) : deck.equip;
    const leader = 'leader_unit_id' in deck && String(deck.leader_unit_id) === unitId ? { leader_unit_id: 0 } : {};
    return { ...deck, unit_id_list, equip, ...leader };
  });
}

/** The game's preset gone from this import, with what JASWA remembered of it. */
export function deleteGamePreset(game: ImportedGame, preset: Preset): ImportedGame {
  const source = sourceOf(preset);
  const data: GameRecord = { ...game.data };
  if (source.kind === 'deck') {
    data.deck_list = (Array.isArray(data.deck_list) ? data.deck_list : [])
      .filter((entry) => !sameDeck(entry, source.deckType, source.deckSequence));
  } else {
    delete data[defenseField[source.kind]];
  }
  const loadedPlacements = Object.fromEntries(Object.entries(game.loadedPlacements ?? {}).filter(([id]) => id !== preset.id));
  return { ...game, data, loadedPlacements: Object.keys(loadedPlacements).length > 0 ? loadedPlacements : undefined };
}

/**
 * The game's preset led by `unitId`, or by nobody for `null`.
 *
 * An attack deck names its leader in a field of its own. A defense deck has
 * none: the game leads with whoever stands first, so a new leader trades places
 * with the old one, and a defense always has one.
 */
export function leadGamePreset(game: ImportedGame, preset: Preset, unitId: string | null): ImportedGame {
  const source = sourceOf(preset);
  if (unitId !== null && !preset.members.includes(unitId)) throw new Error('A leader has to be one of the preset\'s monsters.');
  if (source.kind === 'deck') {
    const decks = Array.isArray(game.data.deck_list) ? game.data.deck_list : [];
    return { ...game, data: { ...game.data, deck_list: decks.map((entry) => sameDeck(entry, source.deckType, source.deckSequence)
      ? { ...(entry as GameRecord), leader_unit_id: unitId === null ? 0 : Number(unitId) } : entry) } };
  }
  if (unitId === null) throw new Error('A defense is always led by its first monster.');
  const field = defenseField[source.kind];
  const deck = game.data[field];
  if (!isRecord(deck) || !Array.isArray(deck.unit_id_list)) throw new Error('This defense has no monster list.');
  /* Positions are kept and only the monsters in them traded. */
  const list = deck.unit_id_list;
  const first = list.findIndex((entry) => idOf(entry) !== '0');
  const chosen = list.findIndex((entry) => idOf(entry) === unitId);
  if (first < 0 || chosen < 0 || first === chosen) return game;
  const leading = isRecord(list[first]) ? list[first].unit_id : list[first];
  const coming = isRecord(list[chosen]) ? list[chosen].unit_id : list[chosen];
  const unit_id_list = list.map((entry, at) => (at === first ? put(entry, coming) : at === chosen ? put(entry, leading) : entry));
  return { ...game, data: { ...game.data, [field]: { ...deck, unit_id_list } } };
}
