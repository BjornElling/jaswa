/**
 * The PvE database: what the game sets against a team, area by area, floor by
 * floor, wave by wave, enemy by enemy — the one place JASWA looks up an enemy.
 * Speed Tuning's floors, the Accuracy goals and the fastest enemy on the
 * profile all read it, and so will any later figure that needs an enemy's HP
 * or DEF.
 *
 * Two sources, never mixed within one floor:
 * - **Swarfarm**, through `app/data/swarfarm-pve-stages.json`, which
 *   `scripts/refresh-swarfarm-pve-stages.mjs` writes: every Cairos, Abyss,
 *   Dimension Hole and Dimension Raid floor Swarfarm files enemies for, every
 *   figure filled.
 * - **Stated floors**, below: an area Swarfarm files without enemies, entered
 *   by hand from a named source. A figure the source does not give is `null`
 *   and reads as unknown; it is never filled in from a neighbouring floor.
 *   A source publishing only independent sampled maxima keeps those apart
 *   from waves, so they never turn into an invented enemy or final-wave boss.
 *
 * An area with no stage data has no stage-derived figures, and every reader
 * says so rather than borrow another area's enemies.
 */
import stagesData from '../data/swarfarm-pve-stages.json';
import labyrinthMinibossData from '../data/labyrinth-miniboss-stages.json';
import { monsterPresentation } from './monster-catalog';
import { presetContent } from './preset-contents';

/** An area JASWA can look enemies up for, including sampled Labyrinth stage types. */
export type PveAreaId =
  | 'giants' | 'dragons' | 'necropolis' | 'spiritual' | 'steel' | 'punisher' | 'magic'
  | 'roaring-beasts' | 'dreaming-fairies' | 'tough-beast-men' | 'silent-death' | 'forgotten-heroes' | 'raging-fires'
  | 'rift-raid' | 'dimension-raid-1' | 'dimension-raid-2' | 'dimension-raid-3' | 'temple-of-chaos'
  | 'labyrinth-normal' | 'labyrinth-rescue' | 'labyrinth-explode' | 'labyrinth-cooldown'
  | 'labyrinth-speed-limit' | 'labyrinth-time-limit' | 'labyrinth-boss';

/** One enemy. Swarfarm fills every figure; a stated floor leaves `null` where its source is silent. */
export type PveEnemy = {
  /** The game's monster id, or `null` for an enemy no catalogue entry is known for. */
  monster: number | null;
  /** The name a stated enemy goes by; a catalogued one is named by the catalogue. */
  name: string | null;
  level: number | null;
  stars: number | null;
  /** Combat speed: an enemy fights under no lead, so this is the figure the clock runs on. */
  speed: number | null;
  /** Resistance, in percent. */
  resistance: number | null;
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

export type PveSource = { name: string; url: string; read: string; note?: string };

/** Independent maxima from a published sample, never a synthetic enemy or a final wave. */
type PveObservedMaxima = Pick<PveEnemy, 'speed' | 'resistance' | 'hp' | 'attack' | 'defense'>;

export type PveFloor = {
  area: PveAreaId;
  /** The floor as the game names it: `B12`, `Abyss Hard`, `Level 5`, `R5`. */
  name: string;
  /** How many monsters the player brings, or `null` where the source does not say. */
  teamSize: number | null;
  source: PveSource;
} & ({ waves: readonly (readonly PveEnemy[])[]; observedMaxima?: never }
  | { waves: readonly []; observedMaxima: PveObservedMaxima });

/** An enemy's element as Swarfarm records it; `Pure` is an enemy with none — a crystal, a tower. */
export type PveElement = 'Water' | 'Fire' | 'Wind' | 'Light' | 'Dark' | 'Pure';

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

/* Every Swarfarm enemy's element, by monster id. Read from Swarfarm's record and
   never from the id's last digit, which names no crystal's, tower's or Abyss
   boss's element and names the wrong one for four Dimension Hole enemies. */
const pveElements = new Set<string>(['Water', 'Fire', 'Wind', 'Light', 'Dark', 'Pure']);
const enemyElements = new Map<number, PveElement>(Object.entries(stagesData.enemyElements as Record<string, string>).map(([id, element]) => {
  if (!pveElements.has(element)) throw new Error(`The PvE database gives enemy ${id} the element ${element}.`);
  return [Number(id), element as PveElement];
}));
for (const dungeon of snapshot) {
  for (const row of dungeon.floors.flatMap((floor) => floor.waves.flat())) {
    if (!enemyElements.has(row[0])) throw new Error(`The PvE database names no element for ${dungeon.name}'s enemy ${row[0]}.`);
  }
}

function swarfarmEnemy(row: readonly number[]): PveEnemy {
  const [monster, level, stars, speed, resistance, accuracy, hp, attack, defense, criRate, criDamageReduction] = row;
  return { monster, name: null, level, stars, speed, resistance, accuracy, hp, attack, defense, criRate, criDamageReduction };
}

function swarfarmFloorName(dungeon: SnapshotDungeon, floor: number): string {
  if (dungeon.name.endsWith('(Abyss)')) return `Abyss ${floor === 1 ? 'Normal' : 'Hard'}`;
  return dungeon.category === 'Dimensional Hole' ? `Level ${floor}` : `B${floor}`;
}

/* Swarfarm carries the same five levels for each weekly Dimension Raid
   rotation. Keep checking that shared layout: the three game phases below
   read different wave groups from it, and a changed rotation must be visible. */
const dimensionRaidNames = [
  'Karzhan Remains - Raid', 'Ellunia Remains - Raid', 'Lumel Remains - Raid',
  'Khalderun Remains - Raid', 'Sacreon Remains - Raid',
] as const;

function dimensionRaidFloors(phase: 1 | 2 | 3): PveFloor[] {
  const rotations = dimensionRaidNames.map((name) => {
    const dungeon = snapshot.find((entry) => entry.name === name);
    if (!dungeon) throw new Error(`The PvE database has no Swarfarm entry for ${name}.`);
    return dungeon;
  });
  const [representative, ...others] = rotations;
  const layout = (dungeon: SnapshotDungeon) => JSON.stringify(dungeon.floors.map(({ floor, teamSize, waves }) => (
    { floor, teamSize, waves }
  )));
  if (others.some((dungeon) => layout(dungeon) !== layout(representative))) {
    throw new Error('The PvE database no longer has the same Dimension Raid waves in every rotating dimension.');
  }

  return representative.floors.map((floor) => {
    if (floor.waves.length !== 5) {
      throw new Error(`Swarfarm's ${representative.name} Level ${floor.floor} has ${floor.waves.length} waves; Dimension Raid has five.`);
    }
    const waves = phase === 1 ? floor.waves.slice(0, 1)
      : phase === 2 ? floor.waves.slice(1, 4)
        : floor.waves.slice(4, 5);
    return {
      area: `dimension-raid-${phase}`,
      name: `Level ${floor.floor}`,
      teamSize: floor.teamSize,
      waves: waves.map((wave) => wave.map(swarfarmEnemy)),
      source: swarfarmSource,
    };
  });
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
}, {
  /* SWCalc gives the Level 100 boss's HP, ATK, DEF and constant Resistance.
     Its turn cadence is not a speed figure, so this floor keeps speed unknown. */
  area: 'temple-of-chaos',
  name: 'Level 100',
  teamSize: null,
  waves: [[{
    monster: null, name: 'Temple of Chaos Boss', level: 100, stars: null, speed: null, resistance: 50, accuracy: null,
    hp: 735_495, attack: 22_265, defense: 1_000, criRate: null, criDamageReduction: null,
  }]],
  source: { name: 'SWCalc, Summoners War Mechanics', url: 'https://swcalc.cz/game-mechanics#temple-of-chaos', read: '2026-10-24' },
}, ...(labyrinthMinibossData as PveFloor[]), {
  /* The author's linked CSV is no longer public. The post itself states the
     boss's Resistance; its estimated Accuracy is deliberately not used. */
  area: 'labyrinth-boss',
  name: 'Hell',
  teamSize: presetContent('labyrinth-boss').teamSize,
  waves: [[{
    monster: null, name: 'Tartarus', level: null, stars: null, speed: null, resistance: 55, accuracy: null,
    hp: null, attack: null, defense: null, criRate: null, criDamageReduction: null,
  }]],
  source: {
    name: 'shinedday, Tartarus Hard/Hell — All miniboss up',
    url: 'https://www.reddit.com/r/summonerswar/comments/qpzqo6/', read: '2026-10-30',
    note: 'Hell: 55% Resistance. Speeds describe miniboss waves, not Tartarus.',
  },
}, ...labyrinthSampleFloors()];

function labyrinthSampleFloors(): PveFloor[] {
  /* The table reports maxima across 89 sampled stages, not which enemy has
     them or which wave it stands in. Keeping that distinction prevents a
     monster-specific final-wave threshold from inventing a boss here. */
  const rows = [
    ['labyrinth-normal', 252, 80, 76_905, 2_799],
    ['labyrinth-speed-limit', 225, 42, 54_660, 1_157],
    ['labyrinth-explode', 252, 42, 77_700, 2_862],
    ['labyrinth-rescue', 248, 42, 54_120, 2_141],
    ['labyrinth-cooldown', 252, 42, 53_235, 2_128],
    ['labyrinth-time-limit', 268, 86, 102_855, 2_225],
  ] as const;
  /* The team size is the deck's, never restated: a flat five here once gave
     Rescue, whose decks hold four, a fifth monster. */
  return rows.map(([area, speed, resistance, hp, defense]) => ({
    area,
    name: area === 'labyrinth-time-limit' ? '20 waves' : 'Hell',
    teamSize: presetContent(area).teamSize,
    waves: [],
    observedMaxima: { speed, resistance, hp, defense, attack: null },
    source: {
      name: 'shinedday, Tartarus Labyrinth — data for each stages',
      url: 'https://www.reddit.com/r/summonerswar/comments/qlveqf/', read: '2026-10-30',
      note: area === 'labyrinth-speed-limit' ? 'Hell sample; allied speed is limited.' : '89-stage sample (2021).',
    },
  }));
}

const floorsByArea = new Map<PveAreaId, readonly PveFloor[]>();
for (const [area, names] of Object.entries(swarfarmNames) as [PveAreaId, readonly string[]][]) {
  floorsByArea.set(area, swarfarmFloors(area, names));
}
for (const phase of [1, 2, 3] as const) {
  floorsByArea.set(`dimension-raid-${phase}`, dimensionRaidFloors(phase));
}
for (const floor of statedFloors) {
  if (floorsByArea.get(floor.area)?.some((entry) => entry.source === swarfarmSource)) {
    throw new Error(`The PvE database states a floor for ${floor.area}, which Swarfarm already covers.`);
  }
  floorsByArea.set(floor.area, [...(floorsByArea.get(floor.area) ?? []), floor]);
}
/* A floor or wave with no enemy would read as a floor nothing stands on, and
   every figure below would fall back to nothing; it is a defect in the data. */
for (const floor of [...floorsByArea.values()].flat()) {
  if (floor.observedMaxima) {
    if (floor.waves.length !== 0) throw new Error(`The PvE database mixes sampled maxima with enemy waves for ${floor.area}.`);
    continue;
  }
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

/**
 * The one element every enemy of an area shares, on every floor and in every
 * wave, its elementless crystals and towers aside — or none where two elements
 * meet, or where any enemy's element is unknown.
 */
export function pveAreaElement(area: PveAreaId): Exclude<PveElement, 'Pure'> | undefined {
  const floors = pveFloors(area);
  const found = new Set<PveElement>();
  for (const enemy of floors.flatMap((floor) => floor.waves.flat())) {
    const element = enemy.monster === null ? undefined : enemyElements.get(enemy.monster);
    if (element === undefined) return undefined;
    if (element !== 'Pure') found.add(element);
  }
  return found.size === 1 ? [...found][0] as Exclude<PveElement, 'Pure'> : undefined;
}

/** The fastest stated enemy speed on a floor, or none where its source is silent. */
export function fastestEnemyOn(floor: PveFloor): number | undefined {
  if (floor.observedMaxima) return floor.observedMaxima.speed ?? undefined;
  const speeds = floor.waves.flat().flatMap((enemy) => enemy.speed === null ? [] : [enemy.speed]);
  return speeds.length === 0 ? undefined : Math.max(...speeds);
}

/** The highest stated enemy combat stat on a floor, or none where its source is silent. */
export function highestEnemyStatOn(floor: PveFloor, stat: 'hp' | 'attack' | 'defense'): number | undefined {
  if (floor.observedMaxima) return floor.observedMaxima[stat] ?? undefined;
  const values = floor.waves.flat().flatMap((enemy) => enemy[stat] === null ? [] : [enemy[stat]]);
  return values.length === 0 ? undefined : Math.max(...values);
}

/** The highest stated enemy combat stat in the final wave, which holds the floor's boss. */
export function highestEnemyStatInFinalWaveOn(floor: PveFloor, stat: 'hp' | 'attack' | 'defense' | 'speed'): number | undefined {
  const finalWave = floor.waves.at(-1);
  if (!finalWave) return undefined;
  const values = finalWave.flatMap((enemy) => enemy[stat] === null ? [] : [enemy[stat]]);
  return values.length === 0 ? undefined : Math.max(...values);
}

/** The highest stated Resistance on a floor, or none where its source is silent. */
export function highestResistanceOn(floor: PveFloor): number | undefined {
  if (floor.observedMaxima) return floor.observedMaxima.resistance ?? undefined;
  const resistances = floor.waves.flat().flatMap((enemy) => enemy.resistance === null ? [] : [enemy.resistance]);
  return resistances.length === 0 ? undefined : Math.max(...resistances);
}

export type PveEnemySpeedRank = { speed: number; title: string };

/** Labyrinth alone offers three distinct known speeds. Ties share a rank so
 * two identical crystals do not hide the next speed the team could target.
 * Sample maxima cannot supply runners-up; no other stage's figure fills them.
 */
export function labyrinthEnemySpeedRanks(area: PveAreaId): readonly PveEnemySpeedRank[] {
  if (!area.startsWith('labyrinth-')) return [];
  const floor = hardestPveFloor(area);
  if (!floor) return [];
  const bySpeed = new Map<number, { wave: number; name: string; bosses: Set<string> }[]>();
  const maximum = floor.observedMaxima?.speed;
  if (maximum !== null && maximum !== undefined) {
    bySpeed.set(maximum, []);
  } else {
    /* The game shares one boss preset category. Its captured miniboss approach
       waves belong here too; Tartarus has no stated numeric speed to rank. */
    for (const bossFloor of pveFloors(area)) {
      bossFloor.waves.forEach((wave, index) => {
        for (const enemy of wave) {
          if (enemy.speed === null) continue;
          const encounters = bySpeed.get(enemy.speed) ?? [];
          const name = enemy.name ?? monsterPresentation(String(enemy.monster)).name;
          let encounter = encounters.find((entry) => entry.wave === index + 1 && entry.name === name);
          if (!encounter) {
            encounter = { wave: index + 1, name, bosses: new Set<string>() };
            encounters.push(encounter);
          }
          encounter.bosses.add(bossFloor.name.replace(/ Hell$/, ''));
          bySpeed.set(enemy.speed, encounters);
        }
      });
    }
  }
  const speeds = [...bySpeed.keys()].sort((left, right) => right - left);
  const ranks = ['Fastest', 'Second-fastest', 'Third-fastest'];
  return speeds.slice(0, 3).map((speed, index) => {
    const encounters = bySpeed.get(speed)!;
    const byWave = new Map<number, Set<string>>();
    for (const { wave, name } of encounters) {
      const names = byWave.get(wave) ?? new Set<string>();
      names.add(name);
      byWave.set(wave, names);
    }
    const detail = floor.observedMaxima ? 'observed in the sample'
      : encounters.length === 1 ? `${[...encounters[0].bosses].join('/')}, wave ${encounters[0].wave}: ${encounters[0].name}`
        : [...byWave].map(([wave, names]) => `wave ${wave}: ${[...names].join('/')}`).join('; ');
    return { speed, title: `${ranks[index]}: ${speed} combat speed — ${detail}.` };
  });
}
