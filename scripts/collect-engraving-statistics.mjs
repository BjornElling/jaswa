#!/usr/bin/env node

/**
 * Merges engraving statistics out of the helper's traffic log into the dated
 * dataset in `app/data/engraving-statistics.json`.
 *
 * This is a human-triggered maintenance command, run after a capture session.
 * It never runs in the app, on import, or in CI, and it makes no network
 * request of any kind: everything it writes was already observed passing
 * through the helper while the user opened the game's own Statistics panels.
 *
 * The command is additive and idempotent. The traffic log starts empty each
 * time recording is switched on, so it is a buffer, not an archive — run this
 * before switching recording on again, and the dataset keeps every session.
 * Re-running against the same log changes nothing.
 *
 * Usage:
 *   node scripts/collect-engraving-statistics.mjs            merge, then report
 *   node scripts/collect-engraving-statistics.mjs --dry-run  report only
 *   node scripts/collect-engraving-statistics.mjs --log PATH read another log
 *   node scripts/collect-engraving-statistics.mjs --progress coverage only
 *   node scripts/collect-engraving-statistics.mjs --todo [n] what to capture next
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repositoryRoot, 'app/data/engraving-statistics.json');
const catalogPath = resolve(repositoryRoot, 'app/data/swarfarm-monsters.json');
const collaborationSpeciesPath = resolve(repositoryRoot, 'app/data/collaboration-species.json');

/* The helper writes here; `helper/src/config.cjs` `dataDirectory()` is the
   authority on the location, and this mirrors it for a read-only consumer. */
function defaultLogPath() {
  const base = process.env.LOCALAPPDATA
    ?? (process.env.APPDATA ? join(process.env.APPDATA, '..', 'Local') : null);
  if (!base) return null;
  return join(base, 'JASWA Helper', 'traffic.log');
}

/* A collaboration monster and its generic re-release are one monster with two
   master ids, and the game serves both ids the same statistics — verified
   identical for every pair captured on both sides. So coverage counts the pair
   once and capturing either name is enough. `app/data/collaboration-species.json`
   is the shared table; `app/lib/monster-species.ts` is its other consumer. */
let speciesByMember = new Map();
let speciesMembers = new Map();

async function loadCollaborationSpecies() {
  const raw = await readFile(collaborationSpeciesPath, 'utf8').catch(() => null);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  for (const [speciesId, entry] of Object.entries(parsed.species ?? {})) {
    const members = Array.isArray(entry?.members) ? entry.members.map(String) : [];
    speciesMembers.set(String(speciesId), [String(speciesId), ...members]);
    for (const member of members) speciesByMember.set(member, String(speciesId));
  }
}

function monsterSpeciesId(masterId) {
  return speciesByMember.get(String(masterId)) ?? String(masterId);
}

function monsterSpeciesMemberIds(speciesId) {
  return speciesMembers.get(String(speciesId)) ?? [String(speciesId)];
}

/* One command per panel. The game serves a whole panel's dropdowns from a
   single response, so a monster type costs exactly these three calls. */
const panels = {
  getUnitStatsRuneInfo: 'runes',
  getUnitStatsArtifactInfo: 'artifacts',
  getUnitStatsRelicInfo: 'relics',
};

/* `favorite_type` names a game mode, not a favourite monster: 0 is PvE, 1 is
   RTA. Decision 22 takes PvE, so an RTA row is rejected rather than blended
   into a dataset that would then mean neither thing. Relics are exempt because
   the game offers one model and never sends the field. */
const pveMode = 0;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const progressOnly = argv.includes('--progress');
const todoIndex = argv.indexOf('--todo');
const todoOnly = todoIndex >= 0;
const todoLimit = todoOnly && Number.isInteger(Number(argv[todoIndex + 1]))
  ? Number(argv[todoIndex + 1])
  : 40;
const logPathArgument = argv.indexOf('--log') >= 0 ? argv[argv.indexOf('--log') + 1] : null;

function fail(message) {
  throw new Error(message);
}

/** A count list is only usable if every row is a whole, non-negative count. */
function readCounts(rows, { requireSlot }) {
  if (!Array.isArray(rows)) return null;
  const cleaned = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null;
    const effectId = row.effect_id;
    const count = row.count;
    if (!Number.isInteger(effectId) || !Number.isInteger(count) || count < 0) return null;
    const entry = { effectId, count };
    if (requireSlot) {
      if (!Number.isInteger(row.slot_id)) return null;
      entry.slotId = row.slot_id;
    } else if (Number.isInteger(row.slot_id)) {
      entry.slotId = row.slot_id;
    }
    cleaned.push(entry);
  }
  return cleaned;
}

/** Rune set rows carry the combination itself — `[4, 8]`, not two rows. */
function readRuneSets(rows) {
  if (!Array.isArray(rows)) return null;
  const cleaned = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null;
    if (!Array.isArray(row.set_list) || row.set_list.length === 0) return null;
    if (!row.set_list.every((set) => Number.isInteger(set))) return null;
    if (!Number.isInteger(row.count) || row.count < 0) return null;
    cleaned.push({ setList: [...row.set_list], count: row.count });
  }
  return cleaned;
}

/**
 * Turns one logged exchange into a dataset observation, or explains why not.
 *
 * Counts are kept as the game sends them and percentages are never stored: a
 * 30 % share drawn from 83,549 uses is not the same evidence as 30 % drawn from
 * twelve, and the percentage throws exactly that away.
 */
function readObservation(entry) {
  const panel = panels[entry?.command];
  if (!panel) return null;

  const request = entry.request;
  const response = entry.response;
  if (!request || typeof request !== 'object') return { rejected: 'the request was not an object' };
  if (!response || typeof response !== 'object') return { rejected: 'the response was not an object' };

  const unitMasterId = request.unit_master_id;
  if (!Number.isInteger(unitMasterId)) return { rejected: 'no integer unit_master_id' };

  if (response.ret_code !== 0) return { rejected: `the game returned ret_code ${response.ret_code}` };

  /* Read the id from the statistics request itself. The neighbouring
     `GetUnitRecommendPage_V2` addresses the monster on screen, which for an
     un-awakened monster is a different — and wrong — id. */
  if (panel !== 'relics') {
    const mode = response.favorite_type ?? request.favorite_type;
    if (mode !== pveMode) return { rejected: `favorite_type ${mode} is the RTA model, not PvE` };
  }

  const observedAt = typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at))
    ? entry.at
    : null;
  if (!observedAt) return { rejected: 'no valid timestamp' };

  const primary = readCounts(response.primary_effect, { requireSlot: false });
  if (!primary) return { rejected: 'primary_effect was missing or malformed' };
  const secondary = readCounts(response.secondary_effect, { requireSlot: false });
  if (!secondary) return { rejected: 'secondary_effect was missing or malformed' };

  const observation = { observedAt, primaryEffect: primary, secondaryEffect: secondary };

  if (panel === 'runes') {
    const runeSets = readRuneSets(response.runeset);
    if (!runeSets) return { rejected: 'runeset was missing or malformed' };
    observation.runeSets = runeSets;
  }

  return { unitMasterId, panel, observation };
}

/** The tier lives in the second-to-last digit: 0 un-awakened, 1 awakened, 3 2A. */
function awakeningTier(unitMasterId) {
  const digits = String(unitMasterId);
  if (digits.length < 3) return null;
  return Number(digits[digits.length - 2]);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

/**
 * The set of monster types the dataset is meant to cover.
 *
 * One row per type at its highest awakening (decision 23): every 2A, plus each
 * awakened form that has no 2A. Six-digit ids are towers, guild bosses and
 * boss-only entries rather than player monsters, and are excluded.
 */
function captureList(catalog) {
  const monsters = Array.isArray(catalog) ? catalog : catalog?.monsters;
  if (!Array.isArray(monsters)) return null;
  const ids = new Set(monsters.map((monster) => Number(monster.com2us_id)));
  const wanted = [];
  for (const monster of monsters) {
    const id = Number(monster.com2us_id);
    /* Six-digit ids are Towers, guild bosses and boss-only entries; tier 2 is
       the Imperfect line and tiers 4–7 are Ancient Spirits and bosses. The
       player-monster space is exactly the five-digit ids at tier 1 or 3. */
    if (!Number.isInteger(id) || String(id).length !== 5) continue;
    /* Material monsters — Devilmons, rainbowmons — wear no equipment, and the
       Korean-named rows are test entries the live game does not offer. Both
       would otherwise sit in the work list forever, uncapturable. */
    if (monster.archetype === 'Material') continue;
    if (/[ᄀ-ᇿ가-힯]/.test(monster.name ?? '')) continue;
    /* An archetype of `none` is the catalog saying this row is not a monster a
       player fields: the Ancient Spirit line numbers its eight rows 62703–62773
       through the same digit this file reads as an awakening tier, so 62733
       otherwise reads as a 2A and joins the work list, where no Statistics panel
       will ever exist to answer it. */
    if (!monster.archetype || monster.archetype === 'none') continue;
    const tier = awakeningTier(id);
    if (tier === 3) wanted.push({ id, name: monster.name, archetype: monster.archetype });
    else if (tier === 1 && !ids.has(id + 20)) wanted.push({ id, name: monster.name, archetype: monster.archetype });
  }
  /* A collaboration monster and its generic twin are one monster released under
     two names, so they count once towards coverage. Capturing either satisfies
     the pair, because the reader pools their observations into one sample. */
  const bySpecies = new Map();
  for (const entry of wanted) {
    const speciesId = monsterSpeciesId(entry.id);
    if (!bySpecies.has(speciesId)) bySpecies.set(speciesId, entry);
  }
  return [...bySpecies.values()];
}

/**
 * Writes the dataset compactly, one line per monster type.
 *
 * Indented JSON costs 2.6× the bytes, which at full catalog coverage is 13 MB
 * against 5 MB — a difference the browser bundle would carry. A line per
 * monster keeps a session's diff readable anyway: a capture run appends lines
 * rather than reflowing the file.
 */
async function writeDataset(dataset) {
  const { monsters, ...header } = dataset;
  const ids = Object.keys(monsters).sort((left, right) => Number(left) - Number(right));
  const lines = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(monsters[id])}`);
  const headerJson = JSON.stringify(header, null, 2).slice(1, -1).trimEnd();
  const body = `{${headerJson},\n "monsters": {\n${lines.join(',\n')}\n }\n}\n`;

  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, body, 'utf8');
  await rename(temporaryPath, outputPath);
  await rm(temporaryPath, { force: true });
}

/* The game returns the same distributions for both ids of a collaboration pair,
   so capturing either one covers the species: a panel present under either name
   is that panel captured. Merging the members mirrors what the reader does. */
function speciesRow(dataset, masterId) {
  const members = monsterSpeciesMemberIds(monsterSpeciesId(masterId));
  const row = {};
  let found = false;
  for (const member of members) {
    const recorded = dataset.monsters[member];
    if (!recorded) continue;
    found = true;
    for (const panel of ['runes', 'artifacts', 'relics']) if (recorded[panel]) row[panel] = recorded[panel];
  }
  return found ? row : undefined;
}

function reportProgress(dataset, catalog) {
  const wanted = captureList(catalog);
  if (!wanted) {
    console.log('The monster catalog could not be read, so coverage cannot be reported.');
    return;
  }
  const covered = wanted.filter((monster) => {
    const row = speciesRow(dataset, monster.id);
    return row?.runes && row?.artifacts && row?.relics;
  });
  const partial = wanted.filter((monster) => {
    const row = speciesRow(dataset, monster.id);
    return row && !(row.runes && row.artifacts && row.relics);
  });
  const percentage = wanted.length ? (covered.length / wanted.length) * 100 : 0;
  console.log(`\nCoverage: ${covered.length}/${wanted.length} monster types complete (${percentage.toFixed(1)} %).`);
  if (partial.length) {
    console.log(`${partial.length} started but incomplete — a panel was missed:`);
    for (const monster of partial.slice(0, 10)) {
      const row = speciesRow(dataset, monster.id);
      const missing = ['runes', 'artifacts', 'relics'].filter((panel) => !row[panel]);
      console.log(`  ${monster.id} ${monster.name} — missing ${missing.join(', ')}`);
    }
    if (partial.length > 10) console.log(`  … and ${partial.length - 10} more.`);
  }
}

/**
 * Names the monster types still to capture, nearest first by id.
 *
 * Ordering by id keeps a session's clicking close together in the game's own
 * list — the five elements of one family are consecutive — which is the
 * difference between a tidy pass and hunting for one straggler.
 */
function reportTodo(dataset, catalog, limit) {
  const wanted = captureList(catalog);
  if (!wanted) {
    console.log('The monster catalog could not be read, so no work list can be produced.');
    return;
  }
  const outstanding = wanted.filter((monster) => {
    const row = speciesRow(dataset, monster.id);
    return !(row?.runes && row?.artifacts && row?.relics);
  });

  /* A half-captured monster is the cheapest work there is — one panel rather
     than three — and the easiest to lose track of, because nothing on screen
     says a panel was missed. It goes first. */
  const partial = outstanding.filter((monster) => speciesRow(dataset, monster.id));
  const untouched = outstanding.filter((monster) => !speciesRow(dataset, monster.id));

  console.log(`${outstanding.length} monster type(s) still to capture.\n`);

  if (partial.length) {
    console.log(`${partial.length} need only a missed panel — finish these first:`);
    for (const monster of partial) {
      const row = speciesRow(dataset, monster.id);
      const missing = ['runes', 'artifacts', 'relics'].filter((panel) => !row[panel]);
      console.log(`  ${monster.id}  ${(monster.name ?? '').padEnd(22)} needs ${missing.join(', ')}`);
    }
    console.log('');
  }

  console.log(`Next ${Math.min(limit, untouched.length)} not yet started:`);
  for (const monster of untouched.slice(0, limit)) {
    console.log(`  ${monster.id}  ${monster.name}`);
  }
}

async function main() {
  const catalog = await readJson(catalogPath, null);
  await loadCollaborationSpecies();

  const dataset = await readJson(outputPath, null) ?? {
    description: 'Community engraving statistics observed from the game\'s own Monster Info → Statistics panels. Counts as the game reports them; percentages are derived, never stored.',
    gameMode: 'PvE',
    monsters: {},
  };
  if (!dataset.monsters || typeof dataset.monsters !== 'object') fail(`${outputPath} exists but has no monsters object. Move it aside rather than letting this command overwrite it.`);

  if (todoOnly) {
    reportTodo(dataset, catalog, todoLimit);
    return;
  }

  if (progressOnly) {
    reportProgress(dataset, catalog);
    return;
  }

  const logPath = logPathArgument ?? defaultLogPath();
  if (!logPath) fail('No traffic log path could be determined. Pass --log PATH.');

  let raw;
  try {
    raw = await readFile(logPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      fail(`No traffic log at ${logPath}. Switch on "Log all traffic" in the helper's tray menu, capture a session, then run this again.`);
    }
    throw error;
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  let unparseable = 0;
  const rejections = new Map();
  const seen = new Map();

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      unparseable += 1;
      continue;
    }
    const read = readObservation(entry);
    if (!read) continue;
    if (read.rejected) {
      rejections.set(read.rejected, (rejections.get(read.rejected) ?? 0) + 1);
      continue;
    }
    /* A session can visit the same panel twice. The later observation wins:
       it is the more recent evidence of the same thing. */
    const key = `${read.unitMasterId}:${read.panel}`;
    const existing = seen.get(key);
    if (!existing || existing.observation.observedAt < read.observation.observedAt) seen.set(key, read);
  }

  const tierRejected = [];
  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  const touched = new Set();

  for (const { unitMasterId, panel, observation } of seen.values()) {
    /* Decision 23: awakened forms only. An un-awakened monster's statistics
       describe where players park spare runes, not what the monster is for. */
    const tier = awakeningTier(unitMasterId);
    if (tier !== 1 && tier !== 3) {
      tierRejected.push(`${unitMasterId} (tier ${tier})`);
      continue;
    }

    const id = String(unitMasterId);
    dataset.monsters[id] ??= {};
    const previous = dataset.monsters[id][panel];
    if (!previous) added += 1;
    else if (JSON.stringify(previous) === JSON.stringify(observation)) unchanged += 1;
    else replaced += 1;
    dataset.monsters[id][panel] = observation;
    touched.add(id);
  }

  console.log(`Read ${lines.length} log lines from ${logPath}.`);
  if (unparseable) console.log(`${unparseable} line(s) were not valid JSON and were skipped.`);
  for (const [reason, count] of rejections) console.log(`Rejected ${count} statistics response(s): ${reason}.`);
  if (tierRejected.length) console.log(`Skipped ${tierRejected.length} un-awakened or unrecognised tier(s): ${tierRejected.slice(0, 8).join(', ')}${tierRejected.length > 8 ? ', …' : ''}.`);
  console.log(`${added} new panel(s), ${replaced} updated, ${unchanged} already current, across ${touched.size} monster type(s).`);

  if (dryRun) {
    console.log('\n--dry-run: nothing was written.');
    reportProgress(dataset, catalog);
    return;
  }

  if (added || replaced) {
    /* The dataset carries its own dates at three levels: each observation, each
       merge, and the whole file. The game recomputes these statistics monthly,
       so a row's age is part of what it says. */
    dataset.lastMergedAt = new Date().toISOString();
    const dates = [];
    for (const row of Object.values(dataset.monsters)) {
      for (const panel of Object.values(row)) {
        if (panel?.observedAt) dates.push(panel.observedAt);
      }
    }
    dates.sort();
    dataset.observedFrom = dates[0] ?? null;
    dataset.observedTo = dates[dates.length - 1] ?? null;
    dataset.monsterCount = Object.keys(dataset.monsters).length;
    await writeDataset(dataset);
    console.log(`Wrote ${outputPath}.`);
  } else {
    console.log('Nothing new in this log; the dataset was left alone.');
  }

  reportProgress(dataset, catalog);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
