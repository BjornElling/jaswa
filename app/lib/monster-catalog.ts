import swarfarmMonsterData from '../data/swarfarm-monsters.json';
import swarfarmMonsterDetails from '../data/swarfarm-monster-details.json';
import { localMonsterImageFilenames } from '../data/local-monster-images';
import { isCollaborationSpecies, monsterSpeciesId, monsterSpeciesMemberIds } from './monster-species';
import { elementName } from './rune-sets';

export const monsterArchetypes = ['Attack', 'Defense', 'HP', 'Support', 'Material', 'none'] as const;
export type MonsterArchetype = typeof monsterArchetypes[number];

type MonsterPresentation = { name: string; searchAliases: string[]; shortName: string; imageFilename?: string; archetype?: MonsterArchetype };

type SwarfarmMonster = { com2us_id: number; name: string; image_filename?: string; archetype?: unknown };
type SwarfarmMonsterDetail = [com2usId: number, familyId: number, skillUpsToMax: number | null];

const swarfarmDetailsByCom2usId = new Map(
  (swarfarmMonsterDetails.monsters as SwarfarmMonsterDetail[]).map(([com2usId, familyId, skillUpsToMax]) => [
    String(com2usId), { familyId, skillUpsToMax },
  ]),
);

const swarfarmByCom2usId = Object.fromEntries((swarfarmMonsterData.monsters as SwarfarmMonster[])
  .map((monster) => [String(monster.com2us_id), monster]));

/* The penultimate digit distinguishes a monster's awakening tier. Preferences
   belong to the finished form: an unawakened copy does not make the community's
   2A artifact choices less relevant to its lineage.

   The lineage keeps the element digit, so it names one monster's own chain of
   forms — Poison Master (Water) → Kyle — and not its Fire sibling's. */
function awakeningLineage(masterId: string): string {
  return masterId.length < 3 ? masterId : `${masterId.slice(0, -2)}_${masterId.at(-1)}`;
}

function awakeningTier(masterId: string): number {
  return masterId.length < 3 ? -1 : Number(masterId.at(-2));
}

function isAwakeningTier(tier: number): boolean {
  return tier === 0 || tier === 1 || tier === 3;
}

/**
 * The chain of forms one monster passes through, as the game numbers them:
 * 0 unawakened, 1 awakened, 3 second awakened. The values are the catalogue's
 * own digits rather than 0/1/2, so a tier read off a master id can be compared
 * against these without a translation step in between.
 */
export const monsterAwakeningTiers = [0, 1, 3] as const;
export type MonsterAwakeningTier = typeof monsterAwakeningTiers[number];

/**
 * Which awakening step this master id is, or `undefined` where the id is not one
 * of the three the game awakens through (a material or a fusion piece, whose
 * penultimate digit means something else entirely).
 */
export function monsterAwakeningTier(masterId: unknown): MonsterAwakeningTier | undefined {
  const tier = awakeningTier(String(masterId ?? ''));
  return isAwakeningTier(tier) ? tier as MonsterAwakeningTier : undefined;
}

/**
 * The key naming this monster's own awakening chain: every form of one monster
 * in one element shares it, and no other monster does. Two ids with the same
 * lineage are the same monster at different stages of awakening.
 */
export function monsterAwakeningLineageId(masterId: unknown): string {
  return awakeningLineage(String(masterId ?? ''));
}

const highestAwakeningByMasterId = (() => {
  const highestByLineage = new Map<string, string>();
  for (const monster of swarfarmMonsterData.monsters as SwarfarmMonster[]) {
    const masterId = String(monster.com2us_id);
    const tier = awakeningTier(masterId);
    if (tier !== 1 && tier !== 3) continue;
    const lineage = awakeningLineage(masterId);
    const current = highestByLineage.get(lineage);
    if (!current || tier > awakeningTier(current)) highestByLineage.set(lineage, masterId);
  }
  return new Map((swarfarmMonsterData.monsters as SwarfarmMonster[]).flatMap((monster) => {
    const masterId = String(monster.com2us_id);
    return isAwakeningTier(awakeningTier(masterId))
      ? [[masterId, highestByLineage.get(awakeningLineage(masterId)) ?? masterId]]
      : [];
  }));
})();

/** The catalogue's highest awakening for this monster's own lineage. */
export function highestAwakeningMasterId(masterId: unknown): string {
  const key = String(masterId ?? '');
  return highestAwakeningByMasterId.get(key) ?? key;
}

/**
 * The raw family id from the source catalogue.
 *
 * This is not the public skill-up family key: a collaboration re-release can
 * have a different raw family id. Callers comparing monsters must use
 * `monsterSkillFamilyId` from `monster-identity.ts` instead.
 */
export function monsterCatalogueFamilyId(masterId: unknown): number | undefined {
  return swarfarmDetailsByCom2usId.get(String(masterId ?? ''))?.familyId;
}

/** How many skill-ups the game says this master id needs to reach max. */
export function monsterSkillUpsToMax(masterId: unknown): number | undefined {
  const value = swarfarmDetailsByCom2usId.get(String(masterId ?? ''))?.skillUpsToMax;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

// These entries are intentionally separate from the imported source mapping.
// When a game monster is renamed, retain its former name here for searching and
// recognition while showing its current name and current artwork in the app.
const renamedMonsters: Record<string, { currentName: string; formerName: string }> = {};

// In the game's master IDs, the fourth digit marks the evolution tier. A 3 is
// used for a second awakened monster, independently of its element. Keeping
// this rule here means newly imported 2A monsters receive the correct label
// without needing a separate name entry first.
function isSecondAwakened(masterId: string): boolean {
  return /^\d{3}3\d$/.test(masterId);
}

function monsterArchetype(value: unknown): MonsterArchetype | undefined {
  return monsterArchetypes.includes(value as MonsterArchetype) ? value as MonsterArchetype : undefined;
}

// The name the same monster carries under its other release. Read straight from
// the catalogue rather than through `monsterPresentation`, which calls this.
//
// This is a search alias only, never shown: a copy is displayed under the name
// the game gives *it*, so a roster holding both releases reads "Praline" and
// "Madeleine Cookie" — each row naming the copy the player actually owns.
//
// Compared against the caller's *unqualified* catalogue name, because a player
// looking for a collaboration copy types "Geralt", not the element the
// interface appends to it.
function twinName(masterId: string, ownCatalogueName: string): string | undefined {
  const speciesId = monsterSpeciesId(masterId);
  const members = monsterSpeciesMemberIds(speciesId);
  if (members.length < 2) return undefined;
  return members
    .filter((memberId) => memberId !== masterId)
    .map((memberId) => swarfarmByCom2usId[memberId]?.name)
    .find((name): name is string => Boolean(name) && name !== ownCatalogueName);
}

// BINDING RULE — an ambiguous name is always qualified by its element.
//
// See `docs/MONSTER-NAME-ELEMENT-DECISION.md`, which is binding for this rule
// and explains why it exists. `npm run verify:element-qualified-names` enforces
// it. Do not remove the qualifier to "clean up" a name: without it these
// monsters are genuinely indistinguishable on screen.
//
// Collaboration units ship five elemental copies under one licensed name, so a
// roster holding Water and Fire DHALSIM shows "DHALSIM" twice with nothing to
// tell them apart — and element decides which artifacts a monster may even wear.
// The qualifier is therefore part of the name, not decoration.
//
// The trigger is the ambiguity itself, not a list of monsters: a name shared by
// two elements is qualified, a unique one is left alone. So `Elucia` stays
// `Elucia`, and the next collaboration is covered the day the catalogue lands,
// with nobody having to remember to add it.
/* The key below joins a name to a catalogue id, and the name is read back off
   the front of it, so the join needs a character no monster name contains. A
   space will not do: names have spaces in them, and "Poison Master" would be
   read back as "Poison".

   Written as an escape rather than as the character itself. A literal NUL in
   the source makes git treat this whole file as binary — no reviewable diff, no
   `git blame`, and grep reports a match without showing it — and it is
   invisible in an editor, so the template above reads as a concatenation with
   nothing between the two halves. */
const nameKeySeparator = '\0';

const ambiguousNames: Set<string> = (() => {
  const elementsByName = new Map<string, Set<string>>();
  for (const monster of swarfarmMonsterData.monsters as SwarfarmMonster[]) {
    const id = String(monster.com2us_id);
    const element = elementName(Number(id.at(-1)));
    if (!element) continue;
    /* Keyed on name plus everything but the element digit, so two unrelated
       monsters that happen to share a name — the Ifrit at 171xx and the one at
       192xx — are not mistaken for one monster's elemental family. */
    const key = `${monster.name}${nameKeySeparator}${id.slice(0, -1)}`;
    const seen = elementsByName.get(key) ?? new Set<string>();
    seen.add(element);
    elementsByName.set(key, seen);
  }
  const ambiguous = new Set<string>();
  for (const [key, elements] of elementsByName) {
    if (elements.size > 1) ambiguous.add(key.split(nameKeySeparator)[0]);
  }
  return ambiguous;
})();

/**
 * The element in parentheses, where the bare name would not identify the
 * monster. Applied to the catalogue name before any other suffix, so a 2A of an
 * ambiguous name reads `Nezuko Kamado (Fire) (2A)` — element with the name it
 * disambiguates, awakening last.
 */
function elementQualifiedName(masterId: string, name: string): string {
  if (!ambiguousNames.has(name)) return name;
  const element = elementName(Number(masterId.at(-1)));
  /* A few catalogue rows are named with their element already — `Dimensional
     Minion (Water)`. That is the game's own naming and needs no second copy. */
  if (!element || name.includes(`(${element})`)) return name;
  return `${name} (${element})`;
}

export function monsterPresentation(masterId: unknown): MonsterPresentation {
  const key = String(masterId ?? 'unknown');
  const renamed = renamedMonsters[key];
  const swarfarmMonster = swarfarmByCom2usId[key];
  const catalogueName = renamed?.currentName || swarfarmMonster?.name || `Monster ${key}`;
  const baseName = elementQualifiedName(key, catalogueName);
  const name = isSecondAwakened(key) && !baseName.includes('(2A)') ? `${baseName} (2A)` : baseName;
  const imageFilename = swarfarmMonster?.image_filename;
  return {
    name,
    // A collaboration monster answers to its twin's name in search, so a player
    // who thinks of the unit by the name the game now advertises still finds
    // the copy they summoned under the licensed one — without that other name
    // appearing beside a copy the game does not call by it.
    searchAliases: [renamed?.formerName, twinName(key, catalogueName)].filter((alias): alias is string => Boolean(alias)),
    shortName: name.slice(0, 1).toUpperCase(),
    imageFilename: imageFilename && localMonsterImageFilenames.has(imageFilename) ? imageFilename : undefined,
    archetype: monsterArchetype(swarfarmMonster?.archetype),
  };
}

export function hasMonsterCatalogEntry(masterId: unknown): boolean {
  const key = String(masterId ?? 'unknown');
  return Boolean(swarfarmByCom2usId[key]);
}

// Unawakened collaboration monsters carry Korean placeholder names in the
// catalogue, which read as noise beside their English counterpart. Where a name
// is not usable, the species falls back to the generic name alone rather than
// pairing a readable name with an unreadable one.
function isReadableName(name: string): boolean {
  return /^[\x20-\x7EÀ-ɏ]+$/.test(name);
}

// How a monster is named where the subject is the monster itself rather than a
// copy of it — statistics, rankings, recommendations. A collaboration pair is
// one monster with two names, so it is shown once, as "collab / generic".
export function monsterSpeciesPresentation(speciesId: unknown): MonsterPresentation {
  const key = monsterSpeciesId(speciesId);
  const generic = monsterPresentation(key);
  if (!isCollaborationSpecies(key)) return generic;

  /* Composed from the unqualified catalogue names, with the element qualifier
     above applied once to the finished pair. Every member of a species shares an
     element — `verify:collaboration-species` holds them to it — so qualifying
     each half would repeat one fact: `Geralt (Fire) / Werner (Fire)`. */
  const genericCatalogueName = swarfarmByCom2usId[key]?.name ?? generic.name;
  const collabNames = monsterSpeciesMemberIds(key)
    .slice(1)
    .map((memberId) => swarfarmByCom2usId[memberId]?.name)
    .filter((name): name is string => Boolean(name) && isReadableName(name) && name !== genericCatalogueName);
  const uniqueCollabNames = [...new Set(collabNames)];
  if (uniqueCollabNames.length === 0) return generic;

  const paired = `${uniqueCollabNames.join(' / ')} / ${genericCatalogueName}`;
  /* Ambiguous if *either* half is: the licensed name is the one released in five
     elements (`RYU`), while the generic it re-released as is usually unique per
     element (`Moore`). Qualifying on the generic alone would leave the pairing
     that actually needs it — `RYU / Moore` — unqualified. */
  const element = elementName(Number(key.at(-1)));
  const anyAmbiguous = [genericCatalogueName, ...uniqueCollabNames].some((each) => ambiguousNames.has(each));
  const qualified = element && anyAmbiguous ? `${paired} (${element})` : paired;
  const name = isSecondAwakened(key) && !qualified.includes('(2A)') ? `${qualified} (2A)` : qualified;
  /* The pairing already states both names, so nothing is left to alias. */
  return { ...generic, name, searchAliases: [], shortName: generic.shortName };
}
