import swarfarmMonsterData from '../data/swarfarm-monsters.json';
import { localMonsterImageFilenames } from '../data/local-monster-images';
import { isCollaborationSpecies, monsterSpeciesId, monsterSpeciesMemberIds } from './monster-species';

export const monsterArchetypes = ['Attack', 'Defense', 'HP', 'Support', 'Material', 'none'] as const;
export type MonsterArchetype = typeof monsterArchetypes[number];

type MonsterPresentation = { name: string; secondaryName?: string; shortName: string; imageFilename?: string; archetype?: MonsterArchetype };

type SwarfarmMonster = { com2us_id: number; name: string; image_filename?: string; archetype?: unknown };

const swarfarmByCom2usId = Object.fromEntries((swarfarmMonsterData.monsters as SwarfarmMonster[])
  .map((monster) => [String(monster.com2us_id), monster]));

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
function twinName(masterId: string, ownName: string): string | undefined {
  const speciesId = monsterSpeciesId(masterId);
  const members = monsterSpeciesMemberIds(speciesId);
  if (members.length < 2) return undefined;
  return members
    .filter((memberId) => memberId !== masterId)
    .map((memberId) => swarfarmByCom2usId[memberId]?.name)
    .find((name): name is string => Boolean(name) && name !== ownName);
}

export function monsterPresentation(masterId: unknown): MonsterPresentation {
  const key = String(masterId ?? 'unknown');
  const renamed = renamedMonsters[key];
  const swarfarmMonster = swarfarmByCom2usId[key];
  const baseName = renamed?.currentName || swarfarmMonster?.name || `Monster ${key}`;
  const name = isSecondAwakened(key) && !baseName.includes('(2A)') ? `${baseName} (2A)` : baseName;
  const imageFilename = swarfarmMonster?.image_filename;
  return {
    name,
    // A collaboration monster is searchable under its twin's name, so a player
    // who thinks of the unit by the name the game now advertises still finds
    // the copy they summoned under the licensed one.
    secondaryName: renamed?.formerName ?? twinName(key, name),
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

  const collabNames = monsterSpeciesMemberIds(key)
    .slice(1)
    .map((memberId) => monsterPresentation(memberId).name)
    .filter((name) => isReadableName(name) && name !== generic.name);
  const uniqueCollabNames = [...new Set(collabNames)];
  if (uniqueCollabNames.length === 0) return generic;

  const name = `${uniqueCollabNames.join(' / ')} / ${generic.name}`;
  return { ...generic, name, secondaryName: undefined, shortName: generic.shortName };
}
