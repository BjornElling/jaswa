import { swExporterMonsterNames } from './sw-exporter-monster-names';
import swarfarmMonsterData from './swarfarm-monsters.json';
import { localMonsterImageFilenames } from './local-monster-images';

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

export function monsterPresentation(masterId: unknown): MonsterPresentation {
  const key = String(masterId ?? 'unknown');
  const renamed = renamedMonsters[key];
  const swarfarmMonster = swarfarmByCom2usId[key];
  const upstreamName = swExporterMonsterNames[key];
  const baseName = renamed?.currentName || swarfarmMonster?.name || upstreamName || `Monster ${key}`;
  const name = isSecondAwakened(key) && !baseName.includes('(2A)') ? `${baseName} (2A)` : baseName;
  const imageFilename = swarfarmMonster?.image_filename;
  return {
    name,
    secondaryName: renamed?.formerName,
    shortName: name.slice(0, 1).toUpperCase(),
    imageFilename: imageFilename && localMonsterImageFilenames.has(imageFilename) ? imageFilename : undefined,
    archetype: monsterArchetype(swarfarmMonster?.archetype),
  };
}

export function hasMonsterCatalogEntry(masterId: unknown): boolean {
  const key = String(masterId ?? 'unknown');
  return Boolean(swarfarmByCom2usId[key] || swExporterMonsterNames[key]);
}
