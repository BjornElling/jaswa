#!/usr/bin/env node

/**
 * Creates the checked-in snapshot that Speed Tuning reads: every monster's
 * speed leader skill, every skill that moves an attack bar or grants a speed
 * buff, and the enemies — monster, speed and resistance — of the hardest floor
 * of each tuned dungeon.
 *
 * Like `refresh-swarfarm-monsters.mjs`, this is a human-triggered maintenance
 * command. It never runs in the app, on import, or in CI; the app reads only
 * the file it writes. Swarfarm's public API is rate limited, so it fetches one
 * page at a time, waits three seconds between requests, and stops rather than
 * retrying after a rate-limit or server response. A full run takes about five
 * minutes.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsPath = resolve(repositoryRoot, 'app/data/swarfarm-speed-skills.json');
const dungeonsPath = resolve(repositoryRoot, 'app/data/swarfarm-speed-dungeons.json');
const api = 'https://swarfarm.com/api/v2/';
const pageSize = 100;
const minimumDelayMs = 3_000;
const maximumSnapshotAgeMs = 7 * 24 * 60 * 60 * 1_000;
const force = process.argv.includes('--force');

/* Swarfarm's skill-effect ids. Only these two change a turn order the page
   models — an ally's attack bar filled, and the speed buff — so only skills
   carrying one of them are kept. */
const increaseAttackBar = 17;
const increaseAttackSpeed = 5;

/* Where Swarfarm says a leader skill counts. "Element" is stored as "General"
   with its element, so `speed-tick.ts` names the other four. */
const leaderAreas = new Set(['General', 'Arena', 'Dungeon', 'Guild', 'Element']);

/* The page's dungeons, as Swarfarm names them. Swarfarm files each Abyss as a
   dungeon of its own ("Giant's Keep (Abyss)"), with Normal and Hard as floors 1
   and 2 and `difficulty` left empty. The hardest floor is therefore the highest
   floor of the Abyss where one carries enemy data, and the highest floor of the
   ordinary dungeon otherwise. Enemy level is no guide: B12's monsters are
   levelled above Abyss Hard's. */
const dungeons = [
  { id: 'giants', names: ["Giant's Keep"] },
  { id: 'dragons', names: ["Dragon's Lair"] },
  { id: 'necropolis', names: ['Necropolis'] },
  { id: 'spiritual', names: ['Spiritual Realm'] },
  { id: 'steel', names: ['Steel Fortress'] },
  { id: 'punisher', names: ["Punisher's Crypt"] },
  { id: 'magic', names: ['Hall of Magic'] },
];

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
      'User-Agent': 'JASWA speed-data refresh (local maintenance; no runtime API requests)',
    },
  });
  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('retry-after');
    throw new Error(`Swarfarm returned ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}. The existing snapshot was kept; retry manually after that interval.`);
  }
  if (!response.ok) throw new Error(`Swarfarm returned HTTP ${response.status} for ${url}. The existing snapshot was kept.`);
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
      throw new Error(`Swarfarm ${path} did not match the expected paginated shape. The existing snapshot was kept.`);
    }
    total ??= payload.count;
    if (payload.count !== total) throw new Error(`Swarfarm changed the ${path} total during this refresh. The existing snapshot was kept.`);
    payload.results.forEach(onPage);
    seen += payload.results.length;
    console.log(`${path}: ${seen}/${total}`);
    next = payload.next;
  }
  if (seen !== total) throw new Error(`Expected ${total} ${path} records but received ${seen}. The existing snapshot was kept.`);
}

function isFresh(snapshot) {
  if (!snapshot || typeof snapshot.retrievedAt !== 'string') return false;
  const retrievedAt = Date.parse(snapshot.retrievedAt);
  return Number.isFinite(retrievedAt) && Date.now() - retrievedAt < maximumSnapshotAgeMs;
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(skillsPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

/* "Attack Bar Recovery +{0}%" is the one skill-up that changes a boost; the
   others (damage, cooldown) do not touch a turn order and are dropped. */
function attackBarRecoveryUpgrades(skill) {
  return (Array.isArray(skill.upgrades) ? skill.upgrades : [])
    .map((upgrade) => (typeof upgrade?.effect === 'string' && upgrade.effect.startsWith('Attack Bar Recovery')
      ? upgrade.amount : 0));
}

function compactSkill(skill) {
  const effects = (Array.isArray(skill.effects) ? skill.effects : [])
    .filter((entry) => entry?.effect?.id === increaseAttackBar || entry?.effect?.id === increaseAttackSpeed)
    .map((entry) => ({
      effect: entry.effect.id === increaseAttackBar ? 'attack-bar' : 'speed-buff',
      /* Attack-bar percent for a boost, turns for a speed buff. */
      quantity: entry.quantity,
      aoe: entry.aoe,
      self: entry.self_effect,
      single: entry.single_target,
      onCrit: entry.on_crit,
      chance: entry.chance,
    }));
  if (effects.length === 0) return null;
  return {
    com2usId: skill.com2us_id,
    name: skill.name,
    slot: skill.slot,
    passive: skill.passive,
    description: skill.description,
    recoveryUpgrades: attackBarRecoveryUpgrades(skill),
    effects,
  };
}

function fastestEnemy(wave) {
  return Math.max(...wave.enemies.map((enemy) => enemy.speed));
}

/* A wave whose enemy lacks a speed or a resistance would quietly read as a
   floor easier than it is, so it stops the refresh instead; one whose monster
   Swarfarm cannot name would leave the Ticks view an anonymous lane. */
function checkedWave(level, wave, com2usIdBySwarfarmId) {
  for (const enemy of wave.enemies) {
    if (!Number.isFinite(enemy.speed) || !Number.isFinite(enemy.resist)) {
      throw new Error(`Swarfarm level ${level.id} has an enemy (${enemy.id}) without a speed or resistance. The existing snapshot was kept.`);
    }
    if (!com2usIdBySwarfarmId.has(enemy.monster)) {
      throw new Error(`Swarfarm level ${level.id} has an enemy (${enemy.id}) whose monster ${enemy.monster} is not in Swarfarm's monster list. The existing snapshot was kept.`);
    }
  }
  return {
    fastest: fastestEnemy(wave),
    speeds: wave.enemies.map((enemy) => enemy.speed),
    /* Resistance percent, in the same order as the speeds. */
    resists: wave.enemies.map((enemy) => enemy.resist),
    /* The game's monster id, in the same order: what the app names the enemy by. */
    monsters: wave.enemies.map((enemy) => com2usIdBySwarfarmId.get(enemy.monster)),
  };
}

async function main() {
  const existing = await readExisting();
  if (!force && isFresh(existing)) {
    console.log(`Snapshot is younger than seven days (${existing.retrievedAt}); no API request was made. Use --force only for a deliberate refresh.`);
    return;
  }

  /* Every leader skill, not only speed: the team editor names whatever a
     monster leads with, and says whether it counts where the team is going. An
     area outside the vocabulary is a Swarfarm change to look at, not a lead to
     file under the nearest one. */
  const leaders = [];
  /* A dungeon enemy names its monster by Swarfarm's own key; the app knows
     monsters by the game's. */
  const com2usIdBySwarfarmId = new Map();
  await fetchAll('monsters/', (monster) => {
    com2usIdBySwarfarmId.set(monster.id, monster.com2us_id);
    const lead = monster.leader_skill;
    if (!lead) return;
    if (!leaderAreas.has(lead.area)) throw new Error(`Swarfarm gives ${monster.name} (${monster.com2us_id}) a leader skill in an unknown area, ${JSON.stringify(lead.area)}. The existing snapshot was kept.`);
    if (typeof lead.attribute !== 'string' || !Number.isFinite(lead.amount)) throw new Error(`Swarfarm's leader skill for ${monster.name} (${monster.com2us_id}) has no attribute or amount. The existing snapshot was kept.`);
    const element = lead.element ?? null;
    if (lead.area === 'Element' && element === null) throw new Error(`Swarfarm gives ${monster.name} (${monster.com2us_id}) an element leader skill without an element. The existing snapshot was kept.`);
    /* Swarfarm writes an element lead either as area "Element" or as area
       "General" with an element; Agrius is the second. The snapshot stores one
       form — the area, and the element as a limit of its own. */
    leaders.push([monster.com2us_id, lead.attribute, lead.amount, lead.area === 'Element' ? 'General' : lead.area, element]);
  });

  const skills = [];
  await fetchAll('skills/', (skill) => {
    const compacted = compactSkill(skill);
    if (compacted) skills.push(compacted);
  });

  const dungeonRecords = [];
  await fetchAll('dungeons/', (dungeon) => dungeonRecords.push(dungeon));

  const floors = [];
  for (const target of dungeons) {
    const matches = dungeonRecords.filter((dungeon) => target.names.some((name) => dungeon.name.startsWith(name)));
    if (matches.length === 0) throw new Error(`Swarfarm has no dungeon named ${target.names.join(' / ')}. The existing snapshot was kept.`);
    let best = null;
    for (const dungeon of matches) {
      for (const levelId of dungeon.levels) {
        const level = await fetchJson(new URL(`levels/${levelId}/`, api));
        if (!Array.isArray(level.waves) || level.waves.length === 0
          || level.waves.some((wave) => !Array.isArray(wave.enemies) || wave.enemies.length === 0)) continue;
        const rank = [dungeon.name.includes('(Abyss)') ? 1 : 0, level.floor];
        if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
          best = { rank, dungeon, level };
        }
      }
    }
    if (!best) throw new Error(`No ${target.names[0]} floor on Swarfarm carries enemy data. The existing snapshot was kept.`);
    floors.push({
      id: target.id,
      swarfarmDungeon: best.dungeon.name,
      swarfarmLevel: best.level.id,
      floor: best.level.floor,
      /* How many monsters the player brings. */
      teamSize: best.level.total_slots,
      stages: best.level.waves.map((wave) => checkedWave(best.level, wave, com2usIdBySwarfarmId)),
    });
    console.log(`${target.id}: ${best.dungeon.name} floor ${best.level.floor} (level ${best.level.id})`);
  }

  const retrievedAt = new Date().toISOString();
  /* Two files, because they are read in two places: the dungeon floors are small
     and needed wherever a saved team is validated, while the skill table is two
     hundred kilobytes that only the Speed Tuning page should load. */
  await writeSnapshot(dungeonsPath, { source: api, retrievedAt, minimumDelayMs, dungeons: floors });
  await writeSnapshot(skillsPath, {
    source: api,
    retrievedAt,
    minimumDelayMs,
    /* [com2us_id, attribute, percent, area, element] — one row per leader skill. */
    leaders: leaders.sort((left, right) => left[0] - right[0]),
    skills: skills.sort((left, right) => left.com2usId - right.com2usId),
  });
  console.log(`Leader attributes: ${[...new Set(leaders.map((leader) => leader[1]))].sort().join(', ')}.`);
  console.log(`Wrote ${leaders.length} leaders and ${skills.length} skills to ${skillsPath}, and ${floors.length} dungeons to ${dungeonsPath}.`);
}

async function writeSnapshot(path, snapshot) {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 1)}
`, 'utf8');
  await rename(temporaryPath, path);
  await rm(temporaryPath, { force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
