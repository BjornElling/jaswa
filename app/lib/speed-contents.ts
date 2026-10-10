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
import type { SpeedArea } from './speed-tick';

export type DungeonId = 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic';
/** A content without enemy data, by area: the other dungeons, guild content, and a preset not yet named. */
export type OpenContentId = 'other-dungeon' | 'guild' | 'unnamed';
export type SpeedContentId = 'arena' | DungeonId | OpenContentId;

/** One stage of a dungeon floor: its enemies' dungeon speeds, resistance percents and game monster ids, in one order. */
export type DungeonStage = { fastest: number; speeds: readonly number[]; resists: readonly number[]; monsters: readonly number[] };

/* The game never lets a resistance fall below 15 per cent, however much
   accuracy meets it, so accuracy past the highest resistance less 15 buys
   nothing. */
const resistanceFloor = 15;

export type SpeedContent = {
  id: SpeedContentId;
  name: string;
  area: SpeedArea;
  /** The team the enemy data was read for, `null` where there is none: the preset's content then decides. */
  teamSize: number | null;
  /** The floor the stages come from, as Swarfarm names it; `null` for arena. */
  floor: string | null;
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
    teamSize: snapshot.teamSize,
    floor: `${snapshot.swarfarmDungeon} · floor ${snapshot.floor}`,
    stages: snapshot.stages,
  };
}

export const speedContents: readonly SpeedContent[] = [
  { id: 'arena', name: 'Arena', area: 'arena', teamSize: arenaTeamSize, floor: null, stages: [] },
  ...dungeonIds.map(dungeonContent),
  { id: 'other-dungeon', name: 'Dungeon', area: 'dungeon', teamSize: null, floor: null, stages: [] },
  { id: 'guild', name: 'Guild', area: 'guild', teamSize: null, floor: null, stages: [] },
  { id: 'unnamed', name: 'Not yet named', area: 'unnamed', teamSize: null, floor: null, stages: [] },
];

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

/** The most accuracy, in per cent, any monster can put to use on a dungeon floor. */
export function usefulAccuracy(id: DungeonId): number {
  const highest = Math.max(...speedContent(id).stages.flatMap((stage) => stage.resists));
  return Math.max(0, highest - resistanceFloor);
}
