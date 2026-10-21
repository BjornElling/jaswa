/**
 * The PvE database: what the game sets against a team, area by area, floor by
 * floor, wave by wave, enemy by enemy — the one place JASWA looks up an enemy.
 * Speed Tuning's floors, the Accuracy goals and the fastest enemy on the
 * profile all read it, and so will any later figure that needs an enemy's HP
 * or DEF.
 *
 * Two sources, never mixed within one floor:
 * - **Swarfarm**, through `app/data/swarfarm-pve-stages.json`, which
 *   `scripts/refresh-swarfarm-pve-stages.mjs` writes: every Cairos, Abyss and
 *   Dimension Hole floor Swarfarm files enemies for, every figure filled.
 * - **Stated floors**, below: an area Swarfarm files without enemies, entered
 *   by hand from a named source. A figure the source does not give is `null`
 *   and reads as unknown; it is never filled in from a neighbouring floor.
 *
 * An area neither covers has no floor, and every reader says so rather than
 * borrow another area's enemies.
 */
import stagesData from '../data/swarfarm-pve-stages.json';

/** An area JASWA can look enemies up for: the Cairos dungeons Speed Tuning reads, the Dimension Hole areas, and Rift Raid. */
export type PveAreaId =
  | 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic'
  | 'roaring-beasts' | 'dreaming-fairies' | 'tough-beast-men' | 'silent-death' | 'forgotten-heroes' | 'raging-fires'
  | 'rift-raid';

/** One enemy. Swarfarm fills every figure; a stated floor leaves `null` where its source is silent. */
export type PveEnemy = {
  /** The game's monster id, or `null` for an enemy no catalogue entry is known for. */
  monster: number | null;
  /** The name a stated enemy goes by; a catalogued one is named by the catalogue. */
  name: string | null;
  level: number | null;
  stars: number | null;
  /** Combat speed: an enemy fights under no lead, so this is the figure the clock runs on. */
  speed: number;
  /** Resistance, in percent. */
  resistance: number;
  /** Accuracy, in percent. */
  accuracy: number | null;
  hp: number | null;
  attack: number | null;
  defense: number | null;
  /** CRI Rate, in percent. */
  criRate: number | null;
  /** CRI damage reduction, in percent. */
  criDamageReduction: number | null;
};

export type PveSource = { name: string; url: string; read: string };

export type PveFloor = {
  area: PveAreaId;
  /** The floor as the game names it: `B12`, `Abyss Hard`, `Level 5`, `R5`. */
  name: string;
  /** How many monsters the player brings, or `null` where the source does not say. */
  teamSize: number | null;
  waves: readonly (readonly PveEnemy[])[];
  source: PveSource;
};

type SnapshotFloor = { floor: number; swarfarmLevel: number; teamSize: number; waves: number[][][] };
type SnapshotDungeon = { name: string; category: string; swarfarmDungeon: number; floors: SnapshotFloor[] };

/* Which of Swarfarm's dungeons are an area's. Swarfarm files each Abyss as a
   dungeon of its own, "Giant's Keep (Abyss)", with Normal and Hard as floors 1
   and 2. */
const swarfarmNames: Readonly<Partial<Record<PveAreaId, readonly string[]>>> = {
  giants: ["Giant's Keep", "Giant's Keep (Abyss)"],
  dragons: ["Dragon's Lair", "Dragon's Lair (Abyss)"],
  necropolis: ['Necropolis', 'Necropolis (Abyss)'],
  spiritual: ['Spiritual Realm', 'Spiritual Realm (Abyss)'],
  steel: ['Steel Fortress', 'Steel Fortress (Abyss)'],
  punisher: ["Punisher's Crypt"],
  magic: ['Hall of Magic'],
  'roaring-beasts': ['Forest of Roaring Beasts'],
  'dreaming-fairies': ['Sanctuary of Dreaming Fairies'],
  'tough-beast-men': ['Cliff of Tough Beast Men'],
  'silent-death': ['Ruin of Silent Death'],
  'forgotten-heroes': ['Castle of Forgotten Heroes'],
  'raging-fires': ['Hellground of Raging Fires'],
};

const swarfarmSource: PveSource = {
  name: 'Swarfarm',
  url: stagesData.source,
  read: stagesData.retrievedAt.slice(0, 10),
};

const snapshot = stagesData.dungeons as SnapshotDungeon[];

/* The snapshot's row order, checked once: a column moved by the refresh would
   otherwise read every enemy's speed as its stars. */
const columns = ['monster', 'level', 'stars', 'speed', 'resistance', 'accuracy', 'hp', 'attack', 'defense', 'criRate', 'criDamageReduction'] as const;
if (stagesData.enemyColumns.join() !== columns.join()) {
  throw new Error(`The PvE database's enemy columns are ${stagesData.enemyColumns.join(', ')}, not ${columns.join(', ')}.`);
}

function swarfarmEnemy(row: readonly number[]): PveEnemy {
  const [monster, level, stars, speed, resistance, accuracy, hp, attack, defense, criRate, criDamageReduction] = row;
  return { monster, name: null, level, stars, speed, resistance, accuracy, hp, attack, defense, criRate, criDamageReduction };
}

function swarfarmFloorName(dungeon: SnapshotDungeon, floor: number): string {
  if (dungeon.name.endsWith('(Abyss)')) return `Abyss ${floor === 1 ? 'Normal' : 'Hard'}`;
  return dungeon.category === 'Dimensional Hole' ? `Level ${floor}` : `B${floor}`;
}

/* Easiest first: an area's own floors in order, then its Abyss, which is
   harder than the dungeon's last floor whatever the levels say — B12's
   monsters are levelled above Abyss Hard's. */
function swarfarmFloors(area: PveAreaId, names: readonly string[]): PveFloor[] {
  return names.flatMap((name) => {
    const dungeon = snapshot.find((entry) => entry.name === name);
    return (dungeon?.floors ?? []).map((floor) => ({
      area,
      name: swarfarmFloorName(dungeon!, floor.floor),
      teamSize: floor.teamSize,
      waves: floor.waves.map((wave) => wave.map(swarfarmEnemy)),
      source: swarfarmSource,
    }));
  });
}

/*
 * Rift Raid's fifth stage. Swarfarm files the raid with no enemies. Theria
 * Games, *Summoners War Chaos Beast Guide* (Nel B, April 13, 2025), tabulates
 * the boss "per head": level 90, 863,400 HP, 3996 ATK, 2670 DEF, 192 SPD, 30 %
 * Resistance, 0 % Accuracy, 0 % CRI Rate. The three heads share one HP pool and
 * one attack gauge (its *Ruler of Chaos*), and each of the three decks faces
 * one head, so the stage is one wave of one enemy. Stars and CRI damage
 * reduction are not given.
 */
const statedFloors: readonly PveFloor[] = [{
  area: 'rift-raid',
  name: 'R5',
  teamSize: 6,
  waves: [[{
    monster: null, name: 'Chaos Beast', level: 90, stars: null, speed: 192, resistance: 30, accuracy: 0,
    hp: 863_400, attack: 3_996, defense: 2_670, criRate: 0, criDamageReduction: null,
  }]],
  source: { name: 'Theria Games, Summoners War Chaos Beast Guide', url: 'https://theriagames.com/guide/summoners-war-chaos-beast-guide/', read: '2026-10-21' },
}];

const floorsByArea = new Map<PveAreaId, readonly PveFloor[]>();
for (const [area, names] of Object.entries(swarfarmNames) as [PveAreaId, readonly string[]][]) {
  floorsByArea.set(area, swarfarmFloors(area, names));
}
for (const floor of statedFloors) {
  if (floorsByArea.get(floor.area)?.length) throw new Error(`The PvE database states a floor for ${floor.area}, which Swarfarm already covers.`);
  floorsByArea.set(floor.area, [...(floorsByArea.get(floor.area) ?? []), floor]);
}
/* A floor or wave with no enemy would read as a floor nothing stands on, and
   every figure below would fall back to nothing; it is a defect in the data. */
for (const floor of [...floorsByArea.values()].flat()) {
  if (floor.waves.length === 0 || floor.waves.some((wave) => wave.length === 0)) {
    throw new Error(`The PvE database's ${floor.area} ${floor.name} has a wave without enemies.`);
  }
}

/** The area a preset content is, where the database knows the area at all; its ids are the contents' own. */
export function pveAreaOf(content: string | undefined): PveAreaId | undefined {
  return content !== undefined && floorsByArea.has(content as PveAreaId) ? content as PveAreaId : undefined;
}

/** Every floor the database has for an area, easiest first; none where no source covers it. */
export function pveFloors(area: PveAreaId): readonly PveFloor[] {
  return floorsByArea.get(area) ?? [];
}

/** The hardest floor the database has for an area: what a team built for the area must face. */
export function hardestPveFloor(area: PveAreaId): PveFloor | undefined {
  return pveFloors(area).at(-1);
}

/** The fastest enemy anywhere on a floor, in combat speed. */
export function fastestEnemyOn(floor: PveFloor): number {
  return Math.max(...floor.waves.flat().map((enemy) => enemy.speed));
}

/** The most resistant enemy anywhere on a floor, in percent. */
export function highestResistanceOn(floor: PveFloor): number {
  return Math.max(...floor.waves.flat().map((enemy) => enemy.resistance));
}
