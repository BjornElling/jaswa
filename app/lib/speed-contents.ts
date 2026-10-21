/**
 * The places a team can be tuned for, and what the game puts against it there.
 *
 * Arena is tuned against a hypothetical enemy the page derives from the team
 * itself; a Cairos dungeon against the enemies of its hardest floor, read from
 * the Swarfarm snapshot `scripts/refresh-swarfarm-speed-data.mjs` writes.
 *
 * Every other content is tuned for its own turn order alone: the snapshot has
 * no enemies for it, and inventing some would judge a team by a guess. Its area
 * still decides which leader skills count, so its combat speeds are the game's.
 */
import speedData from '../data/swarfarm-speed-dungeons.json';
import type { SpeedArea, TickRule } from './speed-tick';

export type DungeonId = 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic';
/** A content without enemy data, by area: the other dungeons, guild content, the raids, and a preset not yet named. */
export type OpenContentId = 'other-dungeon' | 'guild' | 'raid' | 'unnamed';
export type SpeedContentId = 'arena' | DungeonId | OpenContentId;

/** One stage of a dungeon floor: its enemies' dungeon speeds, resistance percents and game monster ids, in one order. */
export type DungeonStage = { fastest: number; speeds: readonly number[]; resists: readonly number[]; monsters: readonly number[] };

export type SpeedContent = {
  id: SpeedContentId;
  name: string;
  area: SpeedArea;
  /** How big a tick is there (`tickPercentOf`). */
  tick: TickRule;
  /** The team the enemy data was read for, `null` where there is none: the preset's content then decides. */
  teamSize: number | null;
  /**
   * Whether anything is set against the team: arena's worst case, or a Cairos
   * floor's stages. A team the user says is not speed tuned is read as facing
   * nothing, wherever it fights.
   */
  facesEnemies: boolean;
  /** The floor the stages come from, as Swarfarm names it; `null` for arena. */
  floor: string | null;
  /** The same floor as the game names it — `Abyss Hard`, `B10` — or `null` for arena. */
  floorName: string | null;
  stages: readonly DungeonStage[];
};

type SnapshotDungeon = {
  id: string;
  swarfarmDungeon: string;
  floor: number;
  teamSize: number;
  stages: DungeonStage[];
};

/* Arena offence: four monsters, in every arena the game runs. */
const arenaTeamSize = 4;

const dungeonNames: Record<DungeonId, string> = {
  giants: "Giant's Keep",
  dragons: "Dragon's Lair",
  necropolis: 'Necropolis',
  spiritual: 'Spiritual Realm',
  steel: 'Steel Fortress',
  punisher: "Punisher's Crypt",
  magic: 'Hall of Magic',
};

export const dungeonIds = Object.keys(dungeonNames) as DungeonId[];

function dungeonContent(id: DungeonId): SpeedContent {
  const snapshot = (speedData.dungeons as SnapshotDungeon[]).find((entry) => entry.id === id);
  /* A dungeon the snapshot does not cover is a defect in the snapshot, not a
     dungeon to tune against nothing: the page would report every team as
     uninterruptible. Failing here fails the build's verification instead. */
  if (!snapshot) throw new Error(`The speed snapshot has no ${dungeonNames[id]} floor.`);
  if (snapshot.stages.length === 0 || snapshot.stages.some((stage) => stage.speeds.length === 0
    || stage.resists.length !== stage.speeds.length || stage.monsters?.length !== stage.speeds.length)) {
    throw new Error(`The speed snapshot's ${dungeonNames[id]} floor has a stage without a speed, a resistance and a monster for every enemy.`);
  }
  return {
    id,
    name: dungeonNames[id],
    area: 'dungeon',
    tick: 'standard',
    teamSize: snapshot.teamSize,
    facesEnemies: true,
    floor: `${snapshot.swarfarmDungeon} · floor ${snapshot.floor}`,
    /* Swarfarm files an Abyss as a dungeon of its own, Normal and Hard as floors 1 and 2. */
    floorName: snapshot.swarfarmDungeon.endsWith('(Abyss)') ? `Abyss ${snapshot.floor === 1 ? 'Normal' : 'Hard'}` : `B${snapshot.floor}`,
    stages: snapshot.stages,
  };
}

export const speedContents: readonly SpeedContent[] = [
  { id: 'arena', name: 'Arena', area: 'arena', tick: 'standard', teamSize: arenaTeamSize, facesEnemies: true, floor: null, floorName: null, stages: [] },
  ...dungeonIds.map(dungeonContent),
  { id: 'other-dungeon', name: 'Dungeon', area: 'dungeon', tick: 'standard', teamSize: null, facesEnemies: false, floor: null, floorName: null, stages: [] },
  { id: 'guild', name: 'Guild', area: 'guild', tick: 'standard', teamSize: null, facesEnemies: false, floor: null, floorName: null, stages: [] },
  /* Rift Raid and the Dimension Raid phases: a raid's tick and a raid's leads. */
  { id: 'raid', name: 'Raid', area: 'raid', tick: 'raid', teamSize: null, facesEnemies: false, floor: null, floorName: null, stages: [] },
  { id: 'unnamed', name: 'Not yet named', area: 'unnamed', tick: 'standard', teamSize: null, facesEnemies: false, floor: null, floorName: null, stages: [] },
];

/* Each area's combat speed by name. A content not yet named has no area to
   name it by, so its figure is the combat speed with General leads alone. */
const combatSpeedNames: Readonly<Record<SpeedArea, string>> = {
  arena: 'arena speed', dungeon: 'dungeon speed', guild: 'guild speed', raid: 'raid speed', unnamed: 'combat speed',
};

/** "arena speed", "dungeon speed" and so on — every page says which combat speed a figure is. */
export function combatSpeedNameOf(area: SpeedArea): string {
  return combatSpeedNames[area];
}

export function speedContent(id: SpeedContentId): SpeedContent {
  const content = speedContents.find((entry) => entry.id === id);
  if (!content) throw new Error(`Unknown speed content ${id}.`);
  return content;
}

export function isDungeonId(id: SpeedContentId): id is DungeonId {
  return (dungeonIds as readonly string[]).includes(id);
}

/** The fastest enemy anywhere on a dungeon floor, in dungeon speed. */
export function fastestEnemySpeed(id: DungeonId): number {
  return Math.max(...speedContent(id).stages.map((stage) => stage.fastest));
}
