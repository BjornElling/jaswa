#!/usr/bin/env node

/**
 * Creates the checked-in PvE database `app/lib/pve-stages.ts` reads: every
 * floor of every Cairos dungeon, Abyss and Dimension Hole area Swarfarm carries
 * enemies for, wave by wave, with each enemy's monster and stats.
 *
 * Like `refresh-swarfarm-speed-data.mjs`, this is a human-triggered maintenance
 * command. It never runs in the app, on import, or in CI; the app reads only
 * the file it writes. Swarfarm's public API is rate limited, so it fetches one
 * page at a time, waits three seconds between requests, and stops rather than
 * retrying after a rate-limit or server response. A full run takes about
 * fifteen minutes, nearly all of it one request a floor.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagesPath = resolve(repositoryRoot, 'app/data/swarfarm-pve-stages.json');
const api = 'https://swarfarm.com/api/v2/';
const pageSize = 100;
const minimumDelayMs = 3_000;
const maximumSnapshotAgeMs = 7 * 24 * 60 * 60 * 1_000;
const force = process.argv.includes('--force');

/* The areas a preset can fight in that Swarfarm files enemies for. The Rift
   Beasts and Rift Raid are filed too, but with no enemies on any floor, and a
   Secret Dungeon is no preset's content. */
const categories = new Set(['Cairos Dungeon', 'Dimensional Hole', 'Rift Beast', 'Rift Raid']);
/* Swarfarm's placeholders for records it has not named, and the Dimension
   Predator, a timed hunt whose five copies no preset fights. */
const skippedNames = new Set(['UNKNOWN DUNGEON', 'Dimension Predator']);

/* One enemy, as one row: the order `pve-stages.ts` reads it in. */
const enemyColumns = ['monster', 'level', 'stars', 'speed', 'resistance', 'accuracy', 'hp', 'attack', 'defense', 'criRate', 'criDamageReduction'];

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

let lastRequestAt = 0;
async function fetchJson(url) {
  const wait = lastRequestAt + minimumDelayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'JASWA PvE-data refresh (local maintenance; no runtime API requests)',
    },
  });
  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('retry-after');
    throw new Error(`Swarfarm returned ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}. The existing database was kept; retry manually after that interval.`);
  }
  if (!response.ok) throw new Error(`Swarfarm returned HTTP ${response.status} for ${url}. The existing database was kept.`);
  return response.json();
}

async function fetchAll(path, onPage) {
  const url = new URL(path, api);
  url.searchParams.set('page_size', String(pageSize));
  let next = url.toString();
  let total = null;
  let seen = 0;
  while (next) {
    const payload = await fetchJson(next);
    if (!payload || !Array.isArray(payload.results) || !Number.isInteger(payload.count)) {
      throw new Error(`Swarfarm ${path} did not match the expected paginated shape. The existing database was kept.`);
    }
    total ??= payload.count;
    if (payload.count !== total) throw new Error(`Swarfarm changed the ${path} total during this refresh. The existing database was kept.`);
    payload.results.forEach(onPage);
    seen += payload.results.length;
    console.log(`${path}: ${seen}/${total}`);
    next = payload.next;
  }
  if (seen !== total) throw new Error(`Expected ${total} ${path} records but received ${seen}. The existing database was kept.`);
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(stagesPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

function isFresh(snapshot) {
  if (!snapshot || typeof snapshot.retrievedAt !== 'string') return false;
  const retrievedAt = Date.parse(snapshot.retrievedAt);
  return Number.isFinite(retrievedAt) && Date.now() - retrievedAt < maximumSnapshotAgeMs;
}

/* An enemy missing a figure would read as a floor easier than it is, and one
   whose monster Swarfarm cannot name would be an enemy no page can show, so
   either stops the refresh rather than enter the database half known. */
function enemyRow(level, enemy, com2usIdBySwarfarmId) {
  const figures = [enemy.level, enemy.stars, enemy.speed, enemy.resist, enemy.accuracy_bonus, enemy.hp, enemy.attack, enemy.defense, enemy.crit_bonus, enemy.crit_damage_reduction];
  if (!figures.every(Number.isFinite)) {
    throw new Error(`Swarfarm level ${level.id} has an enemy (${enemy.id}) without every figure. The existing database was kept.`);
  }
  const monster = com2usIdBySwarfarmId.get(enemy.monster);
  if (monster === undefined) {
    throw new Error(`Swarfarm level ${level.id} has an enemy (${enemy.id}) whose monster ${enemy.monster} is not in Swarfarm's monster list. The existing database was kept.`);
  }
  return [monster, ...figures];
}

/* Every enemy's element, by the game's monster id. The id's last digit names
   the element of a monster a player can own, but not of a crystal, a tower or an
   Abyss boss — Swarfarm's own record is what does. `Pure` is Swarfarm's word for
   an enemy with no element, which no element has advantage over. */
const elements = new Set(['Water', 'Fire', 'Wind', 'Light', 'Dark', 'Pure']);

function enemyElements(dungeons, elementByCom2usId) {
  const ids = new Set(dungeons.flatMap((dungeon) => dungeon.floors.flatMap((floor) => floor.waves.flat().map(([monster]) => monster))));
  return Object.fromEntries([...ids].sort((left, right) => left - right).map((id) => {
    const element = elementByCom2usId.get(id);
    if (!elements.has(element)) {
      throw new Error(`Swarfarm gives enemy monster ${id} the element ${element}, which is none of ${[...elements].join(', ')}. The existing database was kept.`);
    }
    return [String(id), element];
  }));
}

async function main() {
  const existing = await readExisting();
  if (!force && isFresh(existing)) {
    console.log(`Database is younger than seven days (${existing.retrievedAt}); no API request was made. Use --force only for a deliberate refresh.`);
    return;
  }

  const com2usIdBySwarfarmId = new Map();
  const elementByCom2usId = new Map();
  await fetchAll('monsters/', (monster) => {
    com2usIdBySwarfarmId.set(monster.id, monster.com2us_id);
    elementByCom2usId.set(monster.com2us_id, monster.element);
  });

  const records = [];
  await fetchAll('dungeons/', (dungeon) => {
    if (categories.has(dungeon.category) && !skippedNames.has(dungeon.name)) records.push(dungeon);
  });

  const dungeons = [];
  const withoutEnemies = [];
  for (const dungeon of records) {
    const floors = [];
    for (const levelId of dungeon.levels) {
      const level = await fetchJson(new URL(`levels/${levelId}/`, api));
      /* A floor with no waves is a floor Swarfarm has not filled in, not an
         empty one: it is left out, so the area reads as unknown there. */
      if (!Array.isArray(level.waves) || level.waves.length === 0
        || level.waves.some((wave) => !Array.isArray(wave.enemies) || wave.enemies.length === 0)) continue;
      floors.push({
        floor: level.floor,
        swarfarmLevel: level.id,
        /* How many monsters the player brings. */
        teamSize: level.total_slots,
        waves: level.waves.map((wave) => wave.enemies.map((enemy) => enemyRow(level, enemy, com2usIdBySwarfarmId))),
      });
    }
    if (floors.length === 0) { withoutEnemies.push(dungeon.name); continue; }
    dungeons.push({ name: dungeon.name, category: dungeon.category, swarfarmDungeon: dungeon.id, floors: floors.sort((left, right) => left.floor - right.floor) });
    console.log(`${dungeon.name}: ${floors.length} floors`);
  }

  await writeSnapshot(stagesPath, {
    source: api,
    retrievedAt: new Date().toISOString(),
    minimumDelayMs,
    enemyColumns,
    dungeons: dungeons.sort((left, right) => left.swarfarmDungeon - right.swarfarmDungeon),
    enemyElements: enemyElements(dungeons, elementByCom2usId),
  });
  console.log(`Wrote ${dungeons.length} areas to ${stagesPath}. Without enemies on Swarfarm: ${withoutEnemies.join(', ') || 'none'}.`);
}

async function writeSnapshot(path, snapshot) {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  /* One enemy a line keeps a file of thousands of enemies readable in a diff
     without spreading each row over a dozen lines. */
  const body = JSON.stringify(snapshot, (key, value) => (key === 'waves' ? value.map((wave) => wave.map((row) => JSON.stringify(row))) : value), 1)
    .replace(/"(\[[^"\]]*\])"/g, '$1');
  await writeFile(temporaryPath, `${body}
`, 'utf8');
  await rename(temporaryPath, path);
  await rm(temporaryPath, { force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
