import type { GameRecord } from './game-data';
import { isRecord } from './preference-reading';
import type { Preset } from './presets';
import type { ImportedGame } from './types';

/*
 * The two changes the Presets page makes to one of the game's presets: taking
 * it away and naming its leader. Both are written into the import, where the
 * game's presets live, as an engrave is — so the next
 * import from the game states the game's own presets again, and live sync,
 * which would put them back at once, refuses both.
 */

function sourceOf(preset: Preset) {
  if (preset.kind !== 'game' || !preset.deck) throw new Error('Only a preset from the game is kept in the import.');
  return preset.deck.source;
}

function sameDeck(entry: unknown, type: number, sequence: number): boolean {
  return isRecord(entry) && entry.deck_type === type && entry.deck_seq === sequence;
}

const defenseField = { 'arena-defense': 'defense_deck_info', 'interserver-defense': 'server_arena_defense_deck_info' } as const;

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
  /* Positions are kept and only the monsters in them traded, whether a position
     is written as a bare id or, for the Interserver defense, as `{pos_id, unit_id}`. */
  const idOf = (entry: unknown) => String(isRecord(entry) ? entry.unit_id : entry);
  const put = (entry: unknown, id: unknown) => (isRecord(entry) ? { ...entry, unit_id: id } : id);
  const list = deck.unit_id_list;
  const first = list.findIndex((entry) => idOf(entry) !== '0');
  const chosen = list.findIndex((entry) => idOf(entry) === unitId);
  if (first < 0 || chosen < 0 || first === chosen) return game;
  const leading = isRecord(list[first]) ? list[first].unit_id : list[first];
  const coming = isRecord(list[chosen]) ? list[chosen].unit_id : list[chosen];
  const unit_id_list = list.map((entry, at) => (at === first ? put(entry, coming) : at === chosen ? put(entry, leading) : entry));
  return { ...game, data: { ...game.data, [field]: { ...deck, unit_id_list } } };
}
