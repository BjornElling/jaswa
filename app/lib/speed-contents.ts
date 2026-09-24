/**
 * The places a team can be tuned for, and what the game puts against it there.
 *
 * Arena is tuned against a hypothetical enemy the page derives from the team
 * itself; a dungeon against the enemies of its hardest floor, read from the
 * Swarfarm snapshot `scripts/refresh-swarfarm-speed-data.mjs` writes.
 */
import speedData from '../data/swarfarm-speed-dungeons.json';
import type { SpeedArea } from './speed-tick';

export type DungeonId = 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic';
export type SpeedContentId = 'arena' | DungeonId;

/** One stage of a dungeon floor, by its fastest enemy's dungeon speed. */
export type DungeonStage = { fastest: number; speeds: readonly number[] };

export type SpeedContent = {
  id: SpeedContentId;
  name: string;
  area: SpeedArea;
  teamSize: number;
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
];

export function speedContent(id: SpeedContentId): SpeedContent {
  const content = speedContents.find((entry) => entry.id === id);
  if (!content) throw new Error(`Unknown speed content ${id}.`);
  return content;
}

export function speedContentTeamSize(id: SpeedContentId): number {
  return speedContent(id).teamSize;
}
