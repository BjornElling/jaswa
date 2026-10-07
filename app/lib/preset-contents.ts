/**
 * The contents a Deck Preset belongs to, as the game names them
 * (`docs/DECK-PRESETS.md` §1), and which of them the export's numbers are
 * known to mean.
 *
 * The export numbers a saved deck by `deck_type` and `deck_seq` and says
 * nothing about what either means. A number is matched to a content only once
 * the game's own Deck Building screen has confirmed it (§3); until then the
 * preset keeps its number on screen and is still read in full, because a
 * preset hidden for want of a name would be an import parity break.
 */
import type { SpeedContentId } from './speed-contents';

/** Where Speed Tuning lists a content: the page's three columns. */
export type PresetColumn = 'dungeons' | 'arena' | 'other';

export type PresetContentId =
  | 'arena-attack' | 'arena-defense' | 'interserver-defense'
  | 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher'
  | 'trial-of-ascension' | 'rift-raid' | 'guild-unconfirmed'
  | 'dimension-raid-1' | 'dimension-raid-2' | 'dimension-raid-3';

export type PresetContent = {
  id: PresetContentId;
  name: string;
  column: PresetColumn;
  /** How many monsters a deck of this content holds. */
  teamSize: number;
  /** The content Speed Tuning judges a team against, `null` where it has no enemy data. */
  speed: SpeedContentId | null;
  /**
   * Whether every preset of the content draws from one pool, so a rune is
   * engraved at most once across all of them. Only the Siege Battle defense
   * presets do (`DECK-PRESETS.md` §1, rule 4).
   */
  sharedPool: boolean;
};

const contents: readonly PresetContent[] = [
  { id: 'arena-attack', name: 'Arena Attack', column: 'arena', teamSize: 4, speed: 'arena', sharedPool: false },
  { id: 'arena-defense', name: 'Arena Defense', column: 'arena', teamSize: 4, speed: 'arena', sharedPool: false },
  { id: 'interserver-defense', name: 'Arena Interserver Defense', column: 'arena', teamSize: 4, speed: 'arena', sharedPool: false },
  { id: 'giants', name: "Giant's Keep", column: 'dungeons', teamSize: 5, speed: 'giants', sharedPool: false },
  { id: 'dragons', name: "Dragon's Lair", column: 'dungeons', teamSize: 5, speed: 'dragons', sharedPool: false },
  { id: 'necropolis', name: 'Necropolis', column: 'dungeons', teamSize: 5, speed: 'necropolis', sharedPool: false },
  { id: 'spiritual', name: 'Spiritual Realm', column: 'dungeons', teamSize: 5, speed: 'spiritual', sharedPool: false },
  { id: 'steel', name: 'Steel Fortress', column: 'dungeons', teamSize: 5, speed: 'steel', sharedPool: false },
  { id: 'punisher', name: "Punisher's Crypt", column: 'dungeons', teamSize: 5, speed: 'punisher', sharedPool: false },
  { id: 'trial-of-ascension', name: 'Trial of Ascension', column: 'other', teamSize: 5, speed: null, sharedPool: false },
  { id: 'rift-raid', name: 'Rift Raid', column: 'other', teamSize: 6, speed: null, sharedPool: false },
  { id: 'dimension-raid-1', name: 'Dimension Raid Phase 1', column: 'other', teamSize: 5, speed: null, sharedPool: false },
  { id: 'dimension-raid-2', name: 'Dimension Raid Phase 2', column: 'other', teamSize: 5, speed: null, sharedPool: false },
  { id: 'dimension-raid-3', name: 'Dimension Raid Phase 3', column: 'other', teamSize: 5, speed: null, sharedPool: false },
  /* Siege Battle or World Guild Battle / Guild Rival Battle attack — three
     monsters and more decks than Siege defense allows, so not its shared pool;
     which of the two is open (`DECK-PRESETS.md` §7). */
  { id: 'guild-unconfirmed', name: 'Guild Battle (unconfirmed)', column: 'other', teamSize: 3, speed: null, sharedPool: false },
];

/** Every content JASWA can name, in the order the game's capacity table lists them. */
export const presetContents: readonly PresetContent[] = contents;

export function presetContent(id: PresetContentId): PresetContent {
  const content = contents.find((entry) => entry.id === id);
  if (!content) throw new Error(`Unknown preset content ${id}.`);
  return content;
}

export function isPresetContentId(value: unknown): value is PresetContentId {
  return contents.some((entry) => entry.id === value);
}

/*
 * Confirmed against the Deck Building screen on October 7, 2026:
 * - `deck_type` 1 holds the Arena attack decks, numbered by `deck_seq`.
 * - `deck_type` 2 holds three-monster guild decks. Which guild content is not
 *   confirmed (`DECK-PRESETS.md` §7); its 14 decks rule out the ten Siege
 *   defense presets and their shared pool.
 * - `deck_type` 3 holds the Rift Raid decks, numbered by `deck_seq`.
 * - `deck_type` 6 holds the Trial of Ascension decks, numbered by `deck_seq`.
 * - `deck_type` 19, 20 and 21 hold Dimension Raid phases 1, 2 and 3.
 * - `deck_type` 24 holds the Cairos Dungeon decks; the hundreds of `deck_seq`
 *   name the dungeon and the rest is the preset's number within it: 1 Giant's
 *   Keep, 2 Dragon's Lair, 3 Necropolis, 4 Spiritual Realm, 5 Steel Fortress,
 *   6 Punisher's Crypt — the capacity table's own order. 1, 2, 3 and 5 were
 *   confirmed on saved decks; 4 and 6 by the same order in the account's recent
 *   decks, whose Cairos sub-types 19–24 the screen confirmed for all six.
 * Every other number is unconfirmed.
 */
const cairosByHundreds: Readonly<Record<number, PresetContentId>> = { 1: 'giants', 2: 'dragons', 3: 'necropolis', 4: 'spiritual', 5: 'steel', 6: 'punisher' };

const dimensionRaidPhases: Readonly<Record<number, PresetContentId>> = { 19: 'dimension-raid-1', 20: 'dimension-raid-2', 21: 'dimension-raid-3' };

/** What a saved deck's two numbers mean, where that is confirmed. */
export function deckContent(deckType: number, deckSequence: number): { content: PresetContent; number: number } | null {
  if (deckType === 1) return { content: presetContent('arena-attack'), number: deckSequence };
  if (deckType === 2) return { content: presetContent('guild-unconfirmed'), number: deckSequence };
  if (deckType === 3) return { content: presetContent('rift-raid'), number: deckSequence };
  if (deckType === 6) return { content: presetContent('trial-of-ascension'), number: deckSequence };
  const phase = dimensionRaidPhases[deckType];
  if (phase) return { content: presetContent(phase), number: deckSequence };
  if (deckType === 24) {
    const id = cairosByHundreds[Math.floor(deckSequence / 100)];
    return id ? { content: presetContent(id), number: deckSequence % 100 } : null;
  }
  return null;
}
