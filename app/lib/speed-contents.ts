/**
 * The places a team can be tuned for, and what the game puts against it there.
 *
 * The player-versus-player attacks — Arena and Siege Battle — are tuned against
 * a hypothetical enemy the page derives from the team itself; a Cairos dungeon
 * against the enemies of its hardest floor, read from the PvE database
 * (`pve-stages.ts`).
 *
 * Every other content is tuned for its own turn order alone, and its area still
 * decides which leader skills count, so its combat speeds are the game's.
 */
import { fastestEnemyOn, hardestPveFloor } from './pve-stages';
import type { SpeedArea, TickRule } from './speed-tick';

export type DungeonId = 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic';
/** A content without enemy data, by area: the other dungeons, guild content, the raids, and a preset not yet named. */
export type OpenContentId = 'other-dungeon' | 'guild' | 'raid' | 'unnamed';
export type SpeedContentId = 'arena' | 'siege' | DungeonId | OpenContentId;

/**
 * What is set against the team. `worst-case` is another player's team, whose
 * speeds nobody knows in advance, so the page reads the fastest enemy that
 * still cannot take the first turn (`SPEED-TICK-CANONICAL.md` §6); `stages` is
 * a floor's known enemies; `none` is the team's own turn order alone. The one
 * place a reader asks which kind of opponent a content has, so Arena and Siege
 * Battle share every line of the worst-case reading and its wording.
 */
export type SpeedOpponent = 'worst-case' | 'stages' | 'none';

/** One stage of a dungeon floor: its enemies' combat speeds, resistance percents and game monster ids, in one order. */
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
   * What is set against the team (`SpeedOpponent`). A team the user says is
   * not speed tuned is read as facing nothing, wherever it fights.
   */
  opponent: SpeedOpponent;
  /** The floor the stages come from, as the game names it — `Abyss Hard`, `B10` — or `null` without stages. */
  floorName: string | null;
  stages: readonly DungeonStage[];
};

/* Arena offence: four monsters, in every arena the game runs. Siege Battle
   attacks with three. */
const arenaTeamSize = 4;
const siegeTeamSize = 3;

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
  const floor = hardestPveFloor(id);
  /* A dungeon the database does not cover is a defect in the database, not a
     dungeon to tune against nothing: the page would report every team as
     uninterruptible. Failing here fails the build's verification instead. A
     Ticks lane is named by its monster, so an enemy without one fails too. */
  if (!floor) throw new Error(`The PvE database has no ${dungeonNames[id]} floor.`);
  const stages = floor.waves.map((wave) => {
    const monsters = wave.map((enemy) => enemy.monster);
    if (monsters.some((monster) => monster === null)) throw new Error(`The PvE database's ${dungeonNames[id]} ${floor.name} has an enemy without a monster.`);
    if (wave.some((enemy) => enemy.speed === null || enemy.resistance === null)) {
      throw new Error(`The PvE database's ${dungeonNames[id]} ${floor.name} has an enemy without a speed or Resistance.`);
    }
    const speeds = wave.map((enemy) => enemy.speed as number);
    return { fastest: Math.max(...speeds), speeds,
      resists: wave.map((enemy) => enemy.resistance as number), monsters: monsters as number[] };
  });
  return {
    id,
    name: dungeonNames[id],
    area: 'dungeon',
    tick: 'standard',
    teamSize: floor.teamSize,
    opponent: 'stages',
    floorName: floor.name,
    stages,
  };
}

function openContent(id: OpenContentId, name: string, area: SpeedArea, tick: TickRule = 'standard'): SpeedContent {
  return { id, name, area, tick, teamSize: null, opponent: 'none', floorName: null, stages: [] };
}

export const speedContents: readonly SpeedContent[] = [
  { id: 'arena', name: 'Arena', area: 'arena', tick: 'standard', teamSize: arenaTeamSize, opponent: 'worst-case', floorName: null, stages: [] },
  /* A Siege Battle attack meets another guild's defense deck, as an arena
     attack meets another player's: the same worst case, read in the guild
     area, where Guild leads count and Arena leads do not. */
  { id: 'siege', name: 'Siege Battle', area: 'guild', tick: 'standard', teamSize: siegeTeamSize, opponent: 'worst-case', floorName: null, stages: [] },
  ...dungeonIds.map(dungeonContent),
  openContent('other-dungeon', 'Dungeon', 'dungeon'),
  openContent('guild', 'Guild', 'guild'),
  /* Rift Raid and the Dimension Raid phases: a raid's tick and a raid's leads. */
  openContent('raid', 'Raid', 'raid', 'raid'),
  openContent('unnamed', 'Not yet named', 'unnamed'),
];

export function speedContent(id: SpeedContentId): SpeedContent {
  const content = speedContents.find((entry) => entry.id === id);
  if (!content) throw new Error(`Unknown speed content ${id}.`);
  return content;
}

export function isDungeonId(id: SpeedContentId): id is DungeonId {
  return (dungeonIds as readonly string[]).includes(id);
}

/** The fastest enemy on the floor a dungeon is tuned for, in combat speed. */
export function fastestEnemySpeed(id: DungeonId): number {
  const floor = hardestPveFloor(id);
  const fastest = floor === undefined ? undefined : fastestEnemyOn(floor);
  if (fastest === undefined) throw new Error(`The PvE database's ${id} floor has no stated enemy speed.`);
  return fastest;
}
