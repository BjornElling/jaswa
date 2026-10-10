/**
 * Default and every preset as one list of placements (`docs/DECK-PRESETS.md` §4).
 *
 * A rune or artifact is engraved at most once per preset and may be engraved in
 * many presets at once, so who carries an item is a question about one preset,
 * never about the item. Everything that reads a monster's runes, artifacts,
 * stats or speed reads them through a preset from here, and the account is
 * resolved into presets once, at the boundary.
 */
import { readDeckPresets } from './deck-presets';
import type { DeckPreset } from './deck-presets';
import type { GameRecord } from './game-data';
import { deckContent, isPresetContentId, presetContent, presetContentRank, presetTabs, tabContents } from './preset-contents';
import type { PresetContent, PresetContentId, PresetTab } from './preset-contents';
import { isRecord } from './preference-reading';

export const defaultPresetId = 'default';

export type PresetKind = 'default' | 'game' | 'own';

/** What one monster carries in a preset JASWA's user built. */
export type OwnPresetGear = { runeIds: string[]; artifactIds: string[] };

/**
 * A preset built in JASWA, kept with the preferences (AGENTS.md §0). `gear`
 * is `null` while the preset saves only its monsters, each then on its Default
 * gear, as a game deck saved without gear is; the first engraving fixes every
 * member's gear, because a preset holds all of its monsters' gear or none.
 */
export type OwnPreset = {
  id: string;
  name: string;
  content: PresetContentId | null;
  members: string[];
  leaderUnitId: string | null;
  gear: Record<string, OwnPresetGear> | null;
};

export type Preset = {
  id: string;
  kind: PresetKind;
  /** `null` for Default and for a game deck whose numbers are not yet matched to a content. */
  content: PresetContent | null;
  /** Whether the content is the likeliest reading of the deck's numbers rather than one the game's screen confirmed. */
  contentAssumed: boolean;
  /** The preset's number within its content, as the game counts it; `null` where there is none. */
  number: number | null;
  name: string;
  /** In the preset's own order. Default holds every monster of the active roster. */
  members: readonly string[];
  leaderUnitId: string | null;
  savesGear: boolean;
  /** Each member's runes and artifacts in this preset, Default's where the preset saves none. */
  runesOf: ReadonlyMap<string, readonly string[]>;
  artifactsOf: ReadonlyMap<string, readonly string[]>;
  runeOwner: ReadonlyMap<string, string>;
  artifactOwner: ReadonlyMap<string, string>;
  /**
   * The pool the preset draws its gear from with the game's other decks of its
   * content (`DECK-PRESETS.md` §1, rules 4 and 5), `pool:<content>`; `null` where
   * the preset is a placement of its own, as every preset built in JASWA is.
   */
  pool: string | null;
  /** Who carries each rune and artifact anywhere in the pool; the preset's own owners where it has none. */
  poolRuneOwner: ReadonlyMap<string, string>;
  poolArtifactOwner: ReadonlyMap<string, string>;
  /** Monsters standing in another deck of a pool that shares its monsters, which this preset may not take in. */
  poolTakenUnitIds: ReadonlySet<string>;
  /**
   * What this preset holds that another deck of its pool holds too: runes and
   * artifacts, and monsters where the pool shares them. The game does not
   * always stop it, so it is read as the account stands and shown as a fault
   * of the preset, never refused at the import.
   */
  poolConflicts: PoolConflicts;
  missingRuneIds: readonly string[];
  missingArtifactIds: readonly string[];
  missingUnitIds: readonly string[];
  /** The game deck behind a game preset. */
  deck: DeckPreset | null;
};

function records(value: unknown): GameRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function ids(list: unknown, key: string): string[] {
  return records(list).map((entry) => String(entry[key]));
}

function owners(gearOf: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const owner = new Map<string, string>();
  for (const [unitId, itemIds] of gearOf) for (const itemId of itemIds) owner.set(itemId, unitId);
  return owner;
}

export type PoolConflicts = { runeIds: readonly string[]; artifactIds: readonly string[]; unitIds: readonly string[] };

const noPoolConflicts: PoolConflicts = { runeIds: [], artifactIds: [], unitIds: [] };

/* A preset's placement fields before pools are joined: each preset alone. */
function placement(runesOf: ReadonlyMap<string, readonly string[]>, artifactsOf: ReadonlyMap<string, readonly string[]>) {
  const runeOwner = owners(runesOf);
  const artifactOwner = owners(artifactsOf);
  return { runesOf, artifactsOf, runeOwner, artifactOwner, pool: null, poolRuneOwner: runeOwner, poolArtifactOwner: artifactOwner,
    poolTakenUnitIds: new Set<string>(), poolConflicts: noPoolConflicts };
}

function readDefault(data: GameRecord): Preset {
  const units = records(data.unit_list);
  const runesOf = new Map(units.map((unit) => [String(unit.unit_id), ids(unit.runes, 'rune_id')]));
  const artifactsOf = new Map(units.map((unit) => [String(unit.unit_id), ids(unit.artifacts, 'rid')]));
  return {
    id: defaultPresetId, kind: 'default', content: null, contentAssumed: false, number: null, name: 'Default',
    members: units.map((unit) => String(unit.unit_id)), leaderUnitId: null, savesGear: true,
    ...placement(runesOf, artifactsOf),
    missingRuneIds: [], missingArtifactIds: [], missingUnitIds: [], deck: null,
  };
}

/* A preset that saves no gear runs each member on its Default gear. */
function effectiveGear(members: readonly string[], savedOf: (unitId: string) => readonly string[] | undefined,
  defaultOf: ReadonlyMap<string, readonly string[]>): Map<string, readonly string[]> {
  return new Map(members.map((unitId) => [unitId, savedOf(unitId) ?? defaultOf.get(unitId) ?? []]));
}

function gamePresetName(deck: DeckPreset, content: PresetContent | null, number: number | null): string {
  if (deck.source.kind !== 'deck') return content?.name ?? deck.key;
  if (content) return `${content.name} ${number}`;
  return `Deck ${deck.source.deckType} · ${deck.source.deckSequence}`;
}

function readGamePreset(deck: DeckPreset, fallback: Preset): Preset {
  const named = deck.source.kind === 'deck' ? deckContent(deck.source.deckType, deck.source.deckSequence)
    : { content: presetContent(deck.source.kind), number: null, assumed: false };
  const content = named?.content ?? null;
  const number = named?.number ?? null;
  const contentAssumed = named?.assumed ?? false;
  const runesOf = effectiveGear(deck.members, (unitId) => deck.savesGear ? deck.gear.get(unitId)?.runeIds : undefined, fallback.runesOf);
  const artifactsOf = effectiveGear(deck.members, (unitId) => deck.savesGear ? deck.gear.get(unitId)?.artifactIds : undefined, fallback.artifactsOf);
  return {
    id: deck.key, kind: 'game', content, contentAssumed, number, name: gamePresetName(deck, content, number),
    members: deck.members, leaderUnitId: deck.leaderUnitId, savesGear: deck.savesGear,
    ...placement(runesOf, artifactsOf),
    missingRuneIds: deck.missingRuneIds, missingArtifactIds: deck.missingArtifactIds,
    missingUnitIds: deck.missingUnitIds, deck,
  };
}

function readOwnPreset(own: OwnPreset, fallback: Preset, ownedRunes: ReadonlySet<string>, ownedArtifacts: ReadonlySet<string>): Preset {
  const runesOf = effectiveGear(own.members, (unitId) => own.gear?.[unitId]?.runeIds, fallback.runesOf);
  const artifactsOf = effectiveGear(own.members, (unitId) => own.gear?.[unitId]?.artifactIds, fallback.artifactsOf);
  const content = own.content ? presetContent(own.content) : null;
  return {
    id: own.id, kind: 'own', content, contentAssumed: false, number: null, name: own.name,
    members: own.members, leaderUnitId: own.leaderUnitId, savesGear: own.gear !== null,
    ...placement(runesOf, artifactsOf),
    missingRuneIds: [...runesOf.values()].flat().filter((id) => !ownedRunes.has(id)),
    missingArtifactIds: [...artifactsOf.values()].flat().filter((id) => !ownedArtifacts.has(id)),
    missingUnitIds: own.members.filter((unitId) => !fallback.runesOf.has(unitId)),
    deck: null,
  };
}

/* By content in the game's own structure, and inside a content the game's
   presets by number before the ones built here, which carry no number. A deck
   whose content is not yet named follows every named one, in the export's order. */
function presetOrder(left: Preset, right: Preset): number {
  const rank = (preset: Preset) => preset.content === null ? Number.MAX_SAFE_INTEGER : presetContentRank(preset.content.id);
  const built = (preset: Preset) => (preset.kind === 'own' ? 1 : 0);
  return rank(left) - rank(right) || built(left) - built(right) || (left.number ?? 0) - (right.number ?? 0);
}

/**
 * Default first, then every preset by content. A preset built in JASWA stands
 * in its content as the game's do, after them; one without a content stands
 * with the decks not yet matched to one.
 */
export function readPresets(data: GameRecord | undefined, own: readonly OwnPreset[]): Preset[] {
  if (!data) return [];
  const fallback = readDefault(data);
  const ownedRunes = new Set(ids(data.runes, 'rune_id'));
  const ownedArtifacts = new Set(ids(data.artifacts, 'rid'));
  const rest = joinPools([
    ...readDeckPresets(data).map((deck) => readGamePreset(deck, fallback)),
    ...own.map((entry) => readOwnPreset(entry, fallback, ownedRunes, ownedArtifacts)),
  ]).map((preset, at) => ({ preset, at }))
    .sort((left, right) => presetOrder(left.preset, right.preset) || left.at - right.at)
    .map((entry) => entry.preset);
  return [fallback, ...rest];
}

/**
 * The game's decks of a content with one pool read as one placement: each knows
 * who carries a rune or artifact in any of them, and which monsters the others
 * hold where the pool shares monsters too. A preset built in JASWA is a draft of
 * one team and never joins the game's pool.
 *
 * What a team holds that another holds too is its own first: a rune its own
 * monster carries is read on that monster, so an overlap the game let through
 * shows as a fault on the preset rather than as gear gone missing from it.
 */
function joinPools(presets: Preset[]): Preset[] {
  const poolKey = (preset: Preset) => (preset.kind === 'game' && preset.content?.sharedPool ? `pool:${preset.content.id}` : null);
  const pools = new Map<string, Preset[]>();
  for (const preset of presets) {
    const key = poolKey(preset);
    if (key) pools.set(key, [...pools.get(key) ?? [], preset]);
  }
  return presets.map((preset) => {
    const key = poolKey(preset);
    if (!key) return preset;
    const others = (pools.get(key) ?? []).filter((entry) => entry !== preset);
    const merged = (pick: (entry: Preset) => ReadonlyMap<string, string>) =>
      new Map([...others.flatMap((entry) => [...pick(entry)]), ...pick(preset)]);
    const sharesMonsters = preset.content?.sharedPool?.monsters ?? false;
    const elsewhere = (pick: (entry: Preset) => Iterable<string>) => new Set(others.flatMap((entry) => [...pick(entry)]));
    const runesElsewhere = elsewhere((entry) => entry.runeOwner.keys());
    const artifactsElsewhere = elsewhere((entry) => entry.artifactOwner.keys());
    const taken = new Set(sharesMonsters ? others.flatMap((entry) => entry.members) : []);
    return { ...preset, pool: key, poolRuneOwner: merged((entry) => entry.runeOwner), poolArtifactOwner: merged((entry) => entry.artifactOwner),
      poolTakenUnitIds: taken,
      poolConflicts: {
        runeIds: [...preset.runeOwner.keys()].filter((id) => runesElsewhere.has(id)),
        artifactIds: [...preset.artifactOwner.keys()].filter((id) => artifactsElsewhere.has(id)),
        unitIds: preset.members.filter((id) => taken.has(id)),
      } };
  });
}

/** The presets drawing on one pool with `preset`, itself included; itself alone where it has none. */
export function presetPool(preset: Preset, presets: readonly Preset[]): Preset[] {
  return preset.pool === null ? [preset] : presets.filter((entry) => entry.pool === preset.pool);
}

/** Every record of the account by id, to put a monster's gear together in a preset. */
export type AccountItems = { runes: ReadonlyMap<string, GameRecord>; artifacts: ReadonlyMap<string, GameRecord> };

export function accountItems(data: GameRecord | undefined): AccountItems {
  return {
    runes: new Map(records(data?.runes).map((rune) => [String(rune.rune_id), rune])),
    artifacts: new Map(records(data?.artifacts).map((artifact) => [String(artifact.rid), artifact])),
  };
}

/**
 * A monster's export record as it stands in a preset: its own base stats and
 * Default relics, with the preset's runes and artifacts. A sold item a preset
 * still names adds nothing. The stat sheet, the sets and the speed all read the
 * record this returns, so none of them has to know which preset it is in.
 */
export function monsterInPreset(monster: GameRecord, preset: Preset, items: AccountItems): GameRecord {
  if (preset.kind === 'default') return monster;
  const unitId = String(monster.unit_id);
  const pick = (itemIds: readonly string[] | undefined, from: ReadonlyMap<string, GameRecord>) =>
    (itemIds ?? []).map((id) => from.get(id)).filter((entry): entry is GameRecord => entry !== undefined);
  return { ...monster, runes: pick(preset.runesOf.get(unitId), items.runes), artifacts: pick(preset.artifactsOf.get(unitId), items.artifacts) };
}

/** One place an item is engraved: a monster in a preset. */
export type Engraving = { presetId: string; unitId: string };

/**
 * Every place each rune and artifact is engraved. A preset that saves no gear
 * engraves nothing of its own — its monsters run on Default, which already
 * lists those items — so it is left out rather than counted twice.
 */
export function engravings(presets: readonly Preset[]): { runes: ReadonlyMap<string, Engraving[]>; artifacts: ReadonlyMap<string, Engraving[]> } {
  const runes = new Map<string, Engraving[]>();
  const artifacts = new Map<string, Engraving[]>();
  const add = (map: Map<string, Engraving[]>, itemId: string, engraving: Engraving) => {
    const list = map.get(itemId);
    if (list) list.push(engraving); else map.set(itemId, [engraving]);
  };
  for (const preset of presets) {
    if (!preset.savesGear) continue;
    for (const [itemId, unitId] of preset.runeOwner) add(runes, itemId, { presetId: preset.id, unitId });
    for (const [itemId, unitId] of preset.artifactOwner) add(artifacts, itemId, { presetId: preset.id, unitId });
  }
  return { runes, artifacts };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isIdentifier) && new Set(value).size === value.length;
}

const presetNameMaximum = 60;

/* A preset's fields bind one another — the leader is a member, gear belongs to
   members, an item is engraved once — so the preset is the smallest choice
   that can be judged, and one that fails is dropped alone. */
function readOwnPresetEntry(value: unknown): OwnPreset | null {
  if (!isRecord(value)) return null;
  const { id, name, members, leaderUnitId, gear } = value;
  if (!isIdentifier(id) || !id.startsWith('own-') || typeof name !== 'string' || name.trim() === '' || name.length > presetNameMaximum) return null;
  if (!isIdList(members)) return null;
  /* The content binds nothing else in the preset, so one the current structure
     does not hold, or whose team the members outnumber, starts from its default
     — no content — and the preset's monsters and gear are kept. */
  const content = isPresetContentId(value.content) && members.length <= presetContent(value.content).teamSize ? value.content : null;
  if (leaderUnitId !== null && !(isIdentifier(leaderUnitId) && members.includes(leaderUnitId))) return null;
  if (gear === null) return { id, name, content, members, leaderUnitId, gear: null };
  if (!isRecord(gear)) return null;
  const read: Record<string, OwnPresetGear> = {};
  const runes = new Set<string>();
  const artifacts = new Set<string>();
  for (const unitId of members) {
    const entry = gear[unitId];
    if (!isRecord(entry) || !isIdList(entry.runeIds) || !isIdList(entry.artifactIds)
      || entry.runeIds.length > 6 || entry.artifactIds.length > 2) return null;
    for (const runeId of entry.runeIds) { if (runes.has(runeId)) return null; runes.add(runeId); }
    for (const artifactId of entry.artifactIds) { if (artifacts.has(artifactId)) return null; artifacts.add(artifactId); }
    read[unitId] = { runeIds: [...entry.runeIds], artifactIds: [...entry.artifactIds] };
  }
  if (Object.keys(gear).some((unitId) => !members.includes(unitId))) return null;
  return { id, name, content, members, leaderUnitId, gear: read };
}

/** The stored presets, one at a time (`preference-reading.ts`). A repeated id keeps its first holder. */
export function readOwnPresets(value: unknown): OwnPreset[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).map(readOwnPresetEntry)
    .filter((entry): entry is OwnPreset => entry !== null && !seen.has(entry.id) && Boolean(seen.add(entry.id)));
}

export function newOwnPresetId(): string {
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The preset the Presets page and Rune Optimization have open, for this tab. */
export const selectedPresetKey = 'jaswa.presets.selected';

/**
 * The account's runes as one preset holds them: each rune's `occupiedId` is
 * the monster carrying it in this preset, or `null` where none of its monsters
 * does. A rune read from the export names its monster in Default; read through
 * here it names its monster in the preset asked about, so a calculation for
 * one preset cannot mistake another preset's placement for its own. In a pool
 * the question is the pool's: a rune on a monster of another of its decks is
 * engraved, and taking it takes it from that monster.
 */
export function runesInPreset<T extends { id: string; occupiedId: string | null }>(runes: readonly T[], preset: Preset): T[] {
  if (preset.kind === 'default') return [...runes];
  return runes.map((rune) => {
    const owner = preset.poolRuneOwner.get(rune.id) ?? null;
    return owner === rune.occupiedId ? rune : { ...rune, occupiedId: owner };
  });
}

/** One content under a tab of the preset menu, and the presets standing in it. */
export type PresetMenuArea = { label: string; content: PresetContent | null; presets: Preset[] };

/** One tab of the preset menu: Default, a tab of the game's, or the presets not yet named. */
export type PresetMenuTab = { label: string; tab: PresetTab | null; areas: PresetMenuArea[] };

export const notYetNamedLabel = 'Not yet named';

/**
 * The preset menu, in the game's own fixed structure: Default alone, then
 * every tab of the Attack Deck screen with every content of its menu — empty
 * or not, so the menu is the same on every account — and last, only while
 * there are any, the presets matched to no content.
 */
export function presetMenu(presets: readonly Preset[]): PresetMenuTab[] {
  const fallback = presets.filter((preset) => preset.kind === 'default');
  const menu: PresetMenuTab[] = [{ label: 'Default', tab: null, areas: [{ label: 'Default', content: null, presets: fallback }] }];
  for (const tab of presetTabs) {
    menu.push({ label: tab, tab, areas: tabContents(tab).map((entry) => ({
      label: entry.name, content: entry, presets: presets.filter((preset) => preset.content?.id === entry.id),
    })) });
  }
  const unnamed = presets.filter((preset) => preset.kind !== 'default' && preset.content === null);
  if (unnamed.length > 0) menu.push({ label: notYetNamedLabel, tab: null, areas: [{ label: notYetNamedLabel, content: null, presets: unnamed }] });
  return menu;
}

/** The content a preset is listed under, whoever built it. */
export function presetGroupLabel(preset: Preset): string {
  return preset.content?.name ?? notYetNamedLabel;
}

/**
 * Where an item is engraved, in words a hover can carry: one line per place,
 * "monster — preset", Default first as the presets list it. Each monster is
 * named in its own place's preset, where its nickname is that preset's.
 */
export function engravingLines(places: readonly Engraving[], presets: readonly Preset[],
  monsterName: (unitId: string, presetId: string) => string): string[] {
  const rank = new Map(presets.map((preset, at) => [preset.id, at]));
  const name = new Map(presets.map((preset) => [preset.id, preset.name]));
  return [...places]
    .sort((left, right) => (rank.get(left.presetId) ?? 0) - (rank.get(right.presetId) ?? 0))
    .map((place) => `${monsterName(place.unitId, place.presetId)} — ${name.get(place.presetId) ?? place.presetId}`);
}
