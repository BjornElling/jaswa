#!/usr/bin/env node

/**
 * Holds the PvE database (`app/lib/pve-stages.ts`, `docs/PVE-STAGES.md`) to
 * what its readers assume of it: every area it names has the floor its
 * readers take as the hardest, every enemy on a Swarfarm floor has every
 * figure and a monster the catalogue knows, and a stated floor carries its
 * source. Runs against the checked-in data, so a refresh that changes the
 * hardest floor or drops a figure fails here before any page reads it.
 */
import { hasMonsterCatalogEntry } from '../app/lib/monster-catalog.ts';
import { fastestEnemyOn, hardestPveFloor, highestResistanceOn, pveAreaOf, pveFloors } from '../app/lib/pve-stages.ts';
import { accuracyCeilings } from '../app/lib/accuracy-ceiling.ts';

let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`PvE database: ${message}`);
}

const figures = ['speed', 'resistance', 'accuracy', 'hp', 'attack', 'defense', 'criRate', 'criDamageReduction', 'level', 'stars'];

/* The hardest floor is what every reader takes: the Abyss where Swarfarm files
   one with enemies, the last ordinary floor otherwise. */
const hardest = {
  giants: 'Abyss Hard', dragons: 'Abyss Hard', necropolis: 'Abyss Hard', spiritual: 'Abyss Hard',
  steel: 'B10', punisher: 'B10', magic: 'B10',
  'roaring-beasts': 'Level 5', 'dreaming-fairies': 'Level 5', 'tough-beast-men': 'Level 5', 'silent-death': 'Level 5', 'forgotten-heroes': 'Level 5',
  'rift-raid': 'R5',
  'dimension-raid-1': 'Level 5', 'dimension-raid-2': 'Level 5', 'dimension-raid-3': 'Level 5',
  'temple-of-chaos': 'Level 100',
};
for (const [area, name] of Object.entries(hardest)) {
  check(pveAreaOf(area) === area, `${area} is an area of the database`);
  check(hardestPveFloor(area)?.name === name, `${area}'s hardest floor is ${name}, not ${hardestPveFloor(area)?.name}`);
}
/* An area Swarfarm files without enemies has no floor, rather than a guessed one. */
check(pveAreaOf('raging-fires') === 'raging-fires' && pveFloors('raging-fires').length === 0, 'Hellground of Raging Fires has no floor');
check(pveAreaOf('not-a-pve-area') === undefined && pveAreaOf(undefined) === undefined, 'an area the database does not know is no area of it');
check(pveFloors('giants').map((floor) => floor.name).join() === 'B1,B2,B3,B4,B5,B6,B7,B8,B9,B10,B11,B12,Abyss Normal,Abyss Hard',
  "Giant's Keep's floors run from B1 to Abyss Hard");

for (const area of Object.keys(hardest)) {
  for (const floor of pveFloors(area)) {
    const enemies = floor.waves.flat();
    check(floor.waves.length > 0 && floor.waves.every((wave) => wave.length > 0), `${area} ${floor.name} has an enemy in every wave`);
    check(enemies.every((enemy) => (enemy.speed === null || Number.isFinite(enemy.speed))
      && (enemy.resistance === null || Number.isFinite(enemy.resistance))), `${area} ${floor.name} has valid stated speed and Resistance figures`);
    check(floor.source.name.length > 0 && floor.source.url.startsWith('https://') && /^\d{4}-\d{2}-\d{2}$/.test(floor.source.read),
      `${area} ${floor.name} names its source and when it was read`);
    if (floor.source.name === 'Swarfarm') {
      check(enemies.every((enemy) => figures.every((key) => Number.isFinite(enemy[key]))), `${area} ${floor.name} has every figure for every Swarfarm enemy`);
      check(enemies.every((enemy) => hasMonsterCatalogEntry(enemy.monster)), `${area} ${floor.name} names every enemy by a monster the catalogue knows`);
    } else {
      check(enemies.every((enemy) => enemy.monster !== null || (enemy.name ?? '').length > 0), `${area} ${floor.name} names every stated enemy`);
    }
  }
}

/* The stated R5 boss, as its source tabulates it, and what the readers make of it. */
const r5 = hardestPveFloor('rift-raid');
const boss = r5.waves[0][0];
check(r5.waves.length === 1 && r5.waves[0].length === 1 && boss.name === 'Chaos Beast', 'R5 is one wave of one Chaos Beast head');
check(boss.speed === 192 && boss.resistance === 30 && boss.accuracy === 0 && boss.hp === 863_400 && boss.defense === 2_670 && boss.attack === 3_996,
  'the R5 boss carries its source\'s figures');
check(fastestEnemyOn(r5) === 192 && highestResistanceOn(r5) === 30, 'R5\'s fastest enemy and highest Resistance are its boss\'s');
check(accuracyCeilings('rift-raid')[0]?.part === 'R5' && accuracyCeilings('rift-raid')[0]?.percent === 15, 'R5\'s Accuracy goal follows from its boss');

/* The three Dimension Raid contents divide the same five waves: the first
   boss, the three recovery waves, then the evolved boss. */
const raids = [
  { area: 'dimension-raid-1', fastest: 150, resistance: 49, accuracy: 34, waves: 1 },
  { area: 'dimension-raid-2', fastest: 145, resistance: 30, accuracy: 15, waves: 3 },
  { area: 'dimension-raid-3', fastest: 150, resistance: 49, accuracy: 34, waves: 1 },
];
for (const expected of raids) {
  const floor = hardestPveFloor(expected.area);
  check(floor?.name === 'Level 5' && floor.waves.length === expected.waves, `${expected.area} splits the Level 5 waves for its phase`);
  check(fastestEnemyOn(floor) === expected.fastest && highestResistanceOn(floor) === expected.resistance,
    `${expected.area} derives its fastest enemy and Accuracy from Swarfarm`);
  check(accuracyCeilings(expected.area)[0]?.percent === expected.accuracy, `${expected.area} shows its Resistance-based Accuracy goal`);
}

/* SWCalc states Temple of Chaos's maximum-level boss resistance, but gives no
   speed, so its Accuracy goal is known and its fastest enemy is not. */
const temple = hardestPveFloor('temple-of-chaos');
check(temple.waves[0][0].name === 'Temple of Chaos Boss' && temple.waves[0][0].hp === 735_495
  && temple.waves[0][0].attack === 22_265 && temple.waves[0][0].defense === 1_000, 'Temple of Chaos Level 100 carries its SWCalc figures');
check(highestResistanceOn(temple) === 50 && fastestEnemyOn(temple) === undefined, 'Temple of Chaos has stated Resistance and no stated speed');
check(accuracyCeilings('temple-of-chaos')[0]?.part === 'Level 100' && accuracyCeilings('temple-of-chaos')[0]?.percent === 35,
  'Temple of Chaos derives its Accuracy goal from SWCalc Resistance');

console.log(`PvE database holds: ${checks} checks.`);
