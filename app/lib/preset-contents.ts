/**
 * The contents a Deck Preset belongs to, as the game names them
 * (`docs/DECK-PRESETS.md` §1), and which of them the export's numbers mean.
 *
 * The structure is the game's own and fixed: the tabs of the Attack Deck
 * screen, and under each tab the contents of its menu. Every content is listed
 * whether or not the account has a preset in it, so the menus read the same
 * on every account and never rearrange as presets come and go.
 *
 * The export numbers a saved deck by `deck_type` and `deck_seq` and says
 * nothing about what either means (§3). A number the game's screen has
 * confirmed is matched outright; the rest are matched to the content they
 * most likely are and marked as assumed, so every preset stands in the
 * structure rather than outside it.
 */
import type { SpeedContentId } from './speed-contents';

/** Where Speed Tuning lists a content: the page's three columns. */
export type PresetColumn = 'dungeons' | 'arena' | 'other';

/**
 * The tabs of the game's Attack Deck screen, in its order. A tab holds one
 * content or several — Cairos its six dungeons, Dimension Hole its six
 * dungeons and the Dimension Raid phases — picked from a menu under the tab.
 */
export const presetTabs = ['Arena', 'Guild', 'Cairos', 'Trial of Ascension', 'Temple of Chaos', 'Rift of Worlds', 'Dimension Hole'] as const;

export type PresetTab = typeof presetTabs[number];

export type PresetContentId =
  | 'arena-attack' | 'arena-defense' | 'interserver-defense'
  | 'siege' | 'siege-defense' | 'world-guild' | 'world-guild-defense'
  | 'labyrinth-normal' | 'labyrinth-rescue' | 'labyrinth-explode' | 'labyrinth-cooldown' | 'labyrinth-speed-limit' | 'labyrinth-time-limit' | 'labyrinth-boss'
  | 'subjugation-water' | 'subjugation-fire' | 'subjugation-wind' | 'subjugation-boss'
  | 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher'
  | 'trial-of-ascension' | 'tower-fire' | 'tower-water' | 'tower-wind' | 'tower-light' | 'tower-dark' | 'spires'
  | 'temple-of-chaos'
  | 'ice-beast' | 'fire-beast' | 'wind-beast' | 'light-beast' | 'dark-beast' | 'rift-raid'
  | 'roaring-beasts' | 'dreaming-fairies' | 'tough-beast-men' | 'silent-death' | 'forgotten-heroes' | 'raging-fires'
  | 'dimension-raid-1' | 'dimension-raid-2' | 'dimension-raid-3';

export type PresetContent = {
  id: PresetContentId;
  name: string;
  tab: PresetTab;
  column: PresetColumn;
  /** How many monsters a deck of this content holds. */
  teamSize: number;
  /** What Speed Tuning reads a team against: its enemies where they are known, else its area alone. */
  speed: SpeedContentId;
  /**
   * Whether the game's decks of the content draw from one pool, so a rune or
   * artifact is engraved at most once across all of them, and whether a monster
   * may stand in only one of them as well; `null` where each deck is a placement
   * of its own (`DECK-PRESETS.md` §1, rules 4–6).
   */
  sharedPool: SharedPool | null;
  /**
   * The game's decks, by number, that always fight one battle together, each
   * leader leading all of them; `null` where a deck fights alone under its own
   * leader. Only Rift Raid's: Rift Raid 1, 2 and 3 take part in every battle,
   * and each one's leader skill reaches all three (the developer, October 20,
   * 2026).
   */
  battleDecks: readonly number[] | null;
};

/**
 * Which saved teams reserve gear or monsters against one another. `id` names
 * the pool rather than the content, because one battle can span several
 * contents: Dimension Raid's three phases are three contents and one pool.
 * Every deck that can stand in the same battle reserves against the others:
 * in a team pool every team, in a phase pool every deck of another phase.
 */
export type SharedPool = {
  id: string;
  monsters: boolean;
  /**
   * Whether the battle places one deck of each content, so two decks of the
   * same content are alternatives that never stand together and may hold the
   * same gear. Only decks of different contents of the pool then exclude each
   * other: a phase pool. Off, every deck excludes every other: a team pool.
   */
  oneDeckPerContent: boolean;
};

/* Rift Raid, Dimension Raid and World Guild Battle (and Guild Rival Battle,
   which uses its presets) fight with several decks in one battle. That their
   decks draw on one rune set rests on the user's in-game observation — a rune
   cannot be used in the decks of two Dimension Raid phases at once — and not on
   a notice: v9.2.4 only added a rune-search filter. Nothing says their monsters
   may not repeat, so only the gear is shared. A Dimension Raid battle places one
   deck per phase, so a phase's own presets are alternatives and may reuse a rune
   among themselves (the same observation). */
const dimensionRaid: SharedPool = { id: 'dimension-raid', monsters: false, oneDeckPerContent: true };

function content(id: PresetContentId, name: string, tab: PresetTab, column: PresetColumn, teamSize: number,
  speed: SpeedContentId, sharedPool: SharedPool | null = null, battleDecks: readonly number[] | null = null): PresetContent {
  return { id, name, tab, column, teamSize, speed, sharedPool, battleDecks };
}

/* In the order of the game's tabs, and inside a tab in the order its menu
   reads, row by row; every preset list follows it. */
const contents: readonly PresetContent[] = [
  content('arena-attack', 'Arena Attack', 'Arena', 'arena', 4, 'arena'),
  content('arena-defense', 'Arena Defense', 'Arena', 'arena', 4, 'arena'),
  content('interserver-defense', 'Arena Interserver Defense', 'Arena', 'arena', 4, 'arena'),
  /* The Guild tab's menu has not been read off the screen; these are the guild
     contents of the capacity table, in its order. */
  content('siege', 'Siege Battle', 'Guild', 'other', 3, 'siege'),
  /* v9.2.0 names the runes and artifacts of the Siege Battle defense decks as
     one pool and says nothing of their monsters, so only the gear is shared. */
  content('siege-defense', 'Siege Battle Defense', 'Guild', 'other', 3, 'guild', { id: 'siege-defense', monsters: false, oneDeckPerContent: false }),
  content('world-guild', 'World Guild Battle', 'Guild', 'other', 3, 'guild', { id: 'world-guild', monsters: false, oneDeckPerContent: false }),
  /* The World Guild Battle defense decks stand at once, as Siege Battle's do.
     **Modelled, unsourced:** no notice or observation states this pool; it
     follows Siege Battle's by analogy. */
  content('world-guild-defense', 'World Guild Battle Defense', 'Guild', 'other', 3, 'guild', { id: 'world-guild-defense', monsters: false, oneDeckPerContent: false }),
  content('labyrinth-normal', 'Labyrinth Normal', 'Guild', 'other', 5, 'guild'),
  /* Rescue's deck rows hold four monsters on the game's screen (October 30, 2026). */
  content('labyrinth-rescue', 'Labyrinth Rescue', 'Guild', 'other', 4, 'guild'),
  content('labyrinth-explode', 'Labyrinth Explode', 'Guild', 'other', 5, 'guild'),
  content('labyrinth-cooldown', 'Labyrinth Cooldown Time Up', 'Guild', 'other', 5, 'guild'),
  content('labyrinth-speed-limit', 'Labyrinth Speed Limit', 'Guild', 'other', 5, 'guild'),
  content('labyrinth-time-limit', 'Labyrinth Time Limit', 'Guild', 'other', 5, 'guild'),
  content('labyrinth-boss', 'Labyrinth Boss', 'Guild', 'other', 5, 'guild'),
  content('subjugation-water', 'Monster Subjugation Water', 'Guild', 'other', 5, 'guild'),
  content('subjugation-fire', 'Monster Subjugation Fire', 'Guild', 'other', 5, 'guild'),
  content('subjugation-wind', 'Monster Subjugation Wind', 'Guild', 'other', 5, 'guild'),
  content('subjugation-boss', 'Monster Subjugation Boss', 'Guild', 'other', 5, 'guild'),
  content('giants', "Giant's Keep", 'Cairos', 'dungeons', 5, 'giants'),
  content('dragons', "Dragon's Lair", 'Cairos', 'dungeons', 5, 'dragons'),
  content('necropolis', 'Necropolis', 'Cairos', 'dungeons', 5, 'necropolis'),
  content('spiritual', 'Spiritual Realm', 'Cairos', 'dungeons', 5, 'spiritual'),
  content('steel', 'Steel Fortress', 'Cairos', 'dungeons', 5, 'steel'),
  content('punisher', "Punisher's Crypt", 'Cairos', 'dungeons', 5, 'punisher'),
  content('trial-of-ascension', 'Trial of Ascension', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('tower-fire', 'Tower of Fire', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('tower-water', 'Tower of Water', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('tower-wind', 'Tower of Wind', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('tower-light', 'Tower of Light', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('tower-dark', 'Tower of Dark', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  content('spires', 'Spires of Ascension', 'Trial of Ascension', 'other', 5, 'other-dungeon'),
  /* Temple of Chaos fights with three decks at once, and no monster, rune or
     artifact may stand in more than one of them (v9.0.0). */
  content('temple-of-chaos', 'Temple of Chaos', 'Temple of Chaos', 'other', 5, 'other-dungeon', { id: 'temple-of-chaos', monsters: true, oneDeckPerContent: false }),
  content('ice-beast', 'Ice Beast', 'Rift of Worlds', 'dungeons', 6, 'other-dungeon'),
  content('fire-beast', 'Fire Beast', 'Rift of Worlds', 'dungeons', 6, 'other-dungeon'),
  content('wind-beast', 'Wind Beast', 'Rift of Worlds', 'dungeons', 6, 'other-dungeon'),
  content('light-beast', 'Light Beast', 'Rift of Worlds', 'dungeons', 6, 'other-dungeon'),
  content('dark-beast', 'Dark Beast', 'Rift of Worlds', 'dungeons', 6, 'other-dungeon'),
  content('rift-raid', 'Rift Raid', 'Rift of Worlds', 'dungeons', 6, 'raid', { id: 'rift-raid', monsters: false, oneDeckPerContent: false }, [1, 2, 3]),
  content('roaring-beasts', 'Forest of Roaring Beasts', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  content('dreaming-fairies', 'Sanctuary of Dreaming Fairies', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  content('tough-beast-men', 'Cliff of Tough Beast Men', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  content('silent-death', 'Ruin of Silent Death', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  content('forgotten-heroes', 'Castle of Forgotten Heroes', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  content('raging-fires', 'Hellground of Raging Fires', 'Dimension Hole', 'dungeons', 4, 'other-dungeon'),
  /* The raids tick at 4.5 % and count no Dungeon lead (`speed-tick.ts`
     `tickPercentOf`, `SpeedArea`), so they are read as the raid they are. */
  content('dimension-raid-1', 'Dimension Raid Phase 1', 'Dimension Hole', 'dungeons', 5, 'raid', dimensionRaid),
  content('dimension-raid-2', 'Dimension Raid Phase 2', 'Dimension Hole', 'dungeons', 5, 'raid', dimensionRaid),
  content('dimension-raid-3', 'Dimension Raid Phase 3', 'Dimension Hole', 'dungeons', 5, 'raid', dimensionRaid),
];

/** Every content JASWA can name, tab by tab in the game's order. */
export const presetContents: readonly PresetContent[] = contents;

/** The contents under one tab, in its menu's order. */
export function tabContents(tab: PresetTab): PresetContent[] {
  return contents.filter((entry) => entry.tab === tab);
}

/** Where a content stands among them, which is where its presets stand in every list. */
export function presetContentRank(id: PresetContentId): number {
  return contents.findIndex((entry) => entry.id === id);
}

export function presetContent(id: PresetContentId): PresetContent {
  const found = contents.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown preset content ${id}.`);
  return found;
}

export function isPresetContentId(value: unknown): value is PresetContentId {
  return contents.some((entry) => entry.id === value);
}

/*
 * Confirmed against the Deck Building screen on October 7, 2026:
 * - `deck_type` 1 holds the Arena attack decks, numbered by `deck_seq`.
 * - `deck_type` 3 holds the Rift Raid decks, numbered by `deck_seq`.
 * - `deck_type` 6 holds the Trial of Ascension decks, numbered by `deck_seq`.
 * - `deck_type` 19, 20 and 21 hold Dimension Raid phases 1, 2 and 3.
 * - `deck_type` 23 holds the Temple of Chaos decks, numbered by `deck_seq`
 *   (confirmed by the player on October 10, 2026, for three saved teams).
 * - `deck_type` 24 holds the Cairos Dungeon decks; the hundreds of `deck_seq`
 *   name the dungeon and the rest is the preset's number within it: 1 Giant's
 *   Keep, 2 Dragon's Lair, 3 Necropolis, 4 Spiritual Realm, 5 Steel Fortress,
 *   6 Punisher's Crypt — the capacity table's own order. 1, 2, 3 and 5 were
 *   confirmed on saved decks; 4 and 6 by the same order in the account's recent
 *   decks, whose Cairos sub-types 19–24 the screen confirmed for all six.
 * - `deck_type` 27 holds the Monster Subjugation decks, split by hundreds the
 *   same way: 1 Water, 2 Fire, 3 Wind, 10 Boss. 201 was confirmed by the player
 *   on October 27, 2026; 1001, 1xx and 3xx on October 28, 2026. The Boss sits
 *   at 10, not 4, so the hundreds are not the Guild tab's order.
 * - `deck_type` 25 holds the Rift of Worlds beast decks, split by hundreds the
 *   same way. 5 Dark Beast was captured as the player saved Dark Beast's decks
 *   1 and 2 on October 29, 2026. 1 Ice, 2 Fire, 3 Wind and 4 Light are assumed:
 *   that is the tab's menu order and the element order type 27 numbers by.
 */
type ByHundreds = Readonly<Record<number, { id: PresetContentId; assumed: boolean }>>;

const byHundreds: Readonly<Record<number, ByHundreds>> = {
  24: {
    1: { id: 'giants', assumed: false }, 2: { id: 'dragons', assumed: false }, 3: { id: 'necropolis', assumed: false },
    4: { id: 'spiritual', assumed: false }, 5: { id: 'steel', assumed: false }, 6: { id: 'punisher', assumed: false },
  },
  25: {
    1: { id: 'ice-beast', assumed: true }, 2: { id: 'fire-beast', assumed: true }, 3: { id: 'wind-beast', assumed: true },
    4: { id: 'light-beast', assumed: true }, 5: { id: 'dark-beast', assumed: false },
  },
  27: {
    1: { id: 'subjugation-water', assumed: false }, 2: { id: 'subjugation-fire', assumed: false },
    3: { id: 'subjugation-wind', assumed: false }, 10: { id: 'subjugation-boss', assumed: false },
  },
};

/* `deck_type` 2, World Guild Battle, was confirmed by the player on October 28,
   2026: its presets 1 and 2 on the game's screen are JASWA's decks 2-1 and 2-2.
   The seven Labyrinth types were captured as the player saved one deck in each
   on October 30, 2026, each save matched to a screenshot of that menu entry.
   They do not follow the menu's order, so none of them is read from another.
   `deck_type` 22, Siege Battle, was confirmed by the player on November 4,
   2026: the account's ten three-monster decks of that type are its Siege
   Battle attacks. */
const confirmed: Readonly<Record<number, PresetContentId>> = {
  1: 'arena-attack', 2: 'world-guild', 3: 'rift-raid', 6: 'trial-of-ascension', 22: 'siege',
  4: 'labyrinth-normal', 5: 'labyrinth-rescue', 7: 'labyrinth-speed-limit', 8: 'labyrinth-time-limit',
  9: 'labyrinth-cooldown', 10: 'labyrinth-explode', 11: 'labyrinth-boss',
  19: 'dimension-raid-1', 20: 'dimension-raid-2', 21: 'dimension-raid-3',
  23: 'temple-of-chaos',
};

/**
 * What a saved deck's two numbers mean, and whether the screen confirmed it.
 * `null` only for a number no reading covers, which still stands with the
 * presets not yet named rather than being dropped.
 */
export function deckContent(deckType: number, deckSequence: number): { content: PresetContent; number: number; assumed: boolean } | null {
  const areas = byHundreds[deckType];
  if (areas) {
    const area = areas[Math.floor(deckSequence / 100)];
    return area ? { content: presetContent(area.id), number: deckSequence % 100, assumed: area.assumed } : null;
  }
  const sure = confirmed[deckType];
  return sure ? { content: presetContent(sure), number: deckSequence, assumed: false } : null;
}
