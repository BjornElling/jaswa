/**
 * Import parity audit — `AGENTS.md` §0.1.
 *
 * Reconciles a real captured `HubUserLogin` response against what JASWA's
 * readers actually accept, entity by entity. It answers one question and
 * refuses to guess at it: does the program show the user everything the game
 * gave it? Any record the export carries and a reader drops is reported with
 * the field that caused the drop, because a silent shortfall is the defect
 * this script exists to make impossible.
 *
 * Usage: node scripts/audit-import-parity.mjs [path-to-traffic.log]
 * Defaults to the helper's own log location on this platform.
 *
 * The capture is personal and no checkout carries one, so with no log to read
 * this reports a skip and exits zero rather than a parity failure it never
 * measured — §0.1's shortfalls must be impossible to miss, and a check that is
 * red on every machine but one is a check nobody reads.
 */
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

function defaultTrafficLogPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE || os.homedir(), 'Downloads', 'JASWA Helper traffic.log');
  }
  return path.join(os.homedir(), '.jaswa-helper', 'traffic.log');
}

/**
 * The last full-account snapshot in the log: the most recent truth about the
 * account.
 *
 * An absent log is a normal state, not a crash: this audit reads a personal
 * traffic capture that only exists on a machine where the helper has run, and
 * a checkout without one used to end in an ENOENT stack trace that read as a
 * broken script rather than as a missing input. `undefined` here reaches the
 * caller's own "no snapshot" message, which says what to do about it.
 */
async function readLatestSnapshot(logPath) {
  /* A downloaded SWEX-shaped profile is already the snapshot this audit needs.
     Read it as one document before treating the path as a newline-delimited
     traffic log: JSON formatting makes a complete profile span many lines,
     and scanning those lines individually used to report a misleading
     "no snapshot" skip for the most useful manual audit input. */
  try {
    const document = JSON.parse(await readFile(logPath, 'utf8'));
    if (isRecord(document) && Array.isArray(document.unit_list) && Array.isArray(document.runes)) {
      return document;
    }
  } catch { /* The normal traffic log path is newline-delimited, not one JSON document. */ }
  const input = createReadStream(logPath);
  /* Attached before the first read, because the open error arrives on the
     stream rather than from `createInterface`, and an unhandled 'error' on a
     stream is what produced the stack trace. */
  const opened = new Promise((resolve, reject) => {
    input.once('error', reject);
    input.once('open', resolve);
  });
  try {
    await opened;
  } catch {
    return undefined;
  }
  const stream = createInterface({ input, crlfDelay: Infinity });
  let snapshot;
  let latestStorageList;
  for await (const line of stream) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const response = entry?.response;
    if (!response || typeof response !== 'object') continue;
    if (entry.command === 'HubUserLogin' || entry.command === 'GuestLogin') snapshot = response;
    if (entry.command === 'GetWizardDataPart1' && Array.isArray(response.GetUnitStorageList?.unit_storage_list)) {
      latestStorageList = response.GetUnitStorageList.unit_storage_list;
    }
  }
  return snapshot && latestStorageList ? { ...snapshot, unit_storage_list: latestStorageList } : snapshot;
}

function countBy(records, describe) {
  const counts = new Map();
  for (const record of records) {
    const key = describe(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveIdentifier(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function identifiedRecords(records, identifier) {
  const ids = new Set();
  let invalid = 0;
  for (const record of records) {
    if (!isRecord(record) || !isPositiveIdentifier(record[identifier])) {
      invalid += 1;
      continue;
    }
    ids.add(String(record[identifier]));
  }
  return { ids, invalid };
}

function accountRecords(snapshot, section) {
  const units = Array.isArray(snapshot.unit_list) ? snapshot.unit_list : [];
  return [
    ...(Array.isArray(snapshot[section]) ? snapshot[section] : []),
    ...units.flatMap((unit) => Array.isArray(unit?.[section]) ? unit[section] : []),
  ];
}

function craftAmount(records) {
  let total = 0;
  let invalid = 0;
  for (const record of records) {
    if (!isRecord(record) || !Number.isSafeInteger(record.amount) || record.amount < 0) {
      invalid += 1;
      continue;
    }
    total += record.amount;
  }
  return { total, invalid };
}

function storageAmount(records) {
  let total = 0;
  let invalid = 0;
  for (const record of records) {
    if (!isRecord(record) || !isPositiveIdentifier(record.unit_master_id)
      || !Number.isSafeInteger(record.quantity) || record.quantity < 1) {
      invalid += 1;
      continue;
    }
    total += record.quantity;
  }
  return { total, invalid };
}

// This one-shot reader needs transforms, never a watch on Cargo's locked binaries.
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
let failures = 0;
/* Set when there is no capture to read, so the audit reports a skip and exits
   zero rather than a shortfall it never actually measured. */
let skipped = false;
function report(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

try {
  const logPath = process.argv[2] ?? defaultTrafficLogPath();
  const snapshot = await readLatestSnapshot(logPath);
  if (!snapshot) {
    /* Says which of the two it is, because the remedies differ: a log that is
       not there has to be captured, while a log with no login response in it
       means the game was never re-entered while the helper watched.

       Reported as a skip rather than a parity failure. This audit needs a
       personal capture that no checkout carries, so treating its absence as a
       red check would make the suite permanently red on any machine but one —
       and §0.1's point is that a *real* shortfall must be impossible to miss,
       which a routinely-failing check defeats. It ends with a message and a
       zero exit; `finally` still closes the Vite server below. */
    console.error(`No account snapshot to audit.\n`
      + `  looked in ${logPath}\n`
      + `  Pass a log explicitly with \`node scripts/audit-import-parity.mjs <path-to-traffic.log>\`,\n`
      + `  or run the helper, enter the game once so it captures a login, and try again.`);
    skipped = true;
  }
  if (!skipped) {
  console.log(`Snapshot from ${logPath}\n`);

  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');
  const { artifactEngraveClass } = await server.ssrLoadModule('/app/lib/artifact-grid.ts');
  const { createImportedGame, validateGameFile } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { accountCounts } = await server.ssrLoadModule('/app/lib/account-counts.ts');
  const { readDeckPresets } = await server.ssrLoadModule('/app/lib/deck-presets.ts');

  /* Import the account through the real entry point, so the audit measures the
     pipeline the user actually gets rather than a convenient subset of it. */
  const validation = validateGameFile(snapshot);
  report(validation.valid, `snapshot validates as an importable game (${validation.message})`);
  const data = createImportedGame('traffic.log', snapshot, validation).data;

  /* These are the game's account counts at the snapshot boundary. The helper
     and file routes must both arrive at these same numbers after they merge
     account-level and engraved copies. */
  const rawUnits = Array.isArray(snapshot.unit_list) ? snapshot.unit_list : [];
  const rawNormalStorage = Array.isArray(snapshot.unit_storage_normal_list) ? snapshot.unit_storage_normal_list : [];
  const rawStorage = Array.isArray(snapshot.unit_storage_list) ? snapshot.unit_storage_list : [];
  const rawRunes = accountRecords(snapshot, 'runes');
  const rawArtifacts = accountRecords(snapshot, 'artifacts');
  const rawRelics = accountRecords(snapshot, 'relics');
  const expectedCounts = {
    monsters: identifiedRecords(rawUnits, 'unit_id'),
    normalStorage: identifiedRecords(rawNormalStorage, 'unit_id'),
    storage: storageAmount(rawStorage),
    runes: identifiedRecords(rawRunes, 'rune_id'),
    artifacts: identifiedRecords(rawArtifacts, 'rid'),
    relics: identifiedRecords(rawRelics, 'rid'),
    craft: craftAmount(Array.isArray(snapshot.rune_craft_item_list) ? snapshot.rune_craft_item_list : []),
  };
  const counts = accountCounts(data);
  console.log('Account counts at snapshot boundary:');
  console.log(`  monsters: ${expectedCounts.monsters.ids.size + expectedCounts.normalStorage.ids.size + expectedCounts.storage.total}`);
  console.log(`  runes: ${expectedCounts.runes.ids.size}`);
  console.log(`  gems/grinds: ${expectedCounts.craft.total}`);
  console.log(`  artifacts: ${expectedCounts.artifacts.ids.size}`);
  console.log(`  relics: ${expectedCounts.relics.ids.size}`);
  report(expectedCounts.monsters.invalid === 0, `every monster has a positive unit_id (${expectedCounts.monsters.invalid} invalid)`);
  report(expectedCounts.normalStorage.invalid === 0, `every normal shrine monster has a positive unit_id (${expectedCounts.normalStorage.invalid} invalid)`);
  report(expectedCounts.storage.invalid === 0, `every sealed-shrine monster has a positive master id and quantity (${expectedCounts.storage.invalid} invalid)`);
  report(expectedCounts.runes.invalid === 0, `every rune has a positive rune_id (${expectedCounts.runes.invalid} invalid)`);
  report(expectedCounts.artifacts.invalid === 0, `every artifact has a positive rid (${expectedCounts.artifacts.invalid} invalid)`);
  report(expectedCounts.relics.invalid === 0, `every relic has a positive rid (${expectedCounts.relics.invalid} invalid)`);
  report(expectedCounts.craft.invalid === 0, `every craft stack has a non-negative amount (${expectedCounts.craft.invalid} invalid)`);
  const preparedCountRows = [
    ['monsters', expectedCounts.monsters.ids.size + expectedCounts.normalStorage.ids.size + expectedCounts.storage.total, counts.monsters],
    ['runes', expectedCounts.runes.ids.size, counts.runes],
    ['gems/grinds', expectedCounts.craft.total, counts.gemsAndGrinds],
    ['artifacts', expectedCounts.artifacts.ids.size, counts.artifacts],
    ['relics', expectedCounts.relics.ids.size, counts.relics],
  ];
  for (const [label, expected, actual] of preparedCountRows) {
    report(expected === actual, `${label} count survives the import unchanged (${expected} game / ${actual} JASWA)`);
  }

  const sourceDecks = readDeckPresets(snapshot);
  const importedDecks = readDeckPresets(data);
  report(sourceDecks.length === importedDecks.length,
    `saved Deck Preset count survives the import unchanged (${sourceDecks.length} game / ${importedDecks.length} JASWA)`);
  const deckAssignments = (decks) => decks.map((deck) => [deck.deckType, deck.deckSequence,
    [...deck.runeOwnerById].sort((left, right) => left[0].localeCompare(right[0])),
    [...deck.artifactOwnerById].sort((left, right) => left[0].localeCompare(right[0]))]);
  report(JSON.stringify(deckAssignments(sourceDecks)) === JSON.stringify(deckAssignments(importedDecks)),
    'every saved Deck Preset rune and artifact assignment survives the import');
  console.log(`  saved decks with missing physical runes: ${importedDecks.filter((deck) => deck.missingRuneIds.length).length}`);

  /* Every saved deck must be a preset the interface can reach, carrying its
     own placements: a deck read and then not offered is the invisible gap
     `AGENTS.md` §0.1 forbids (`DECK-PRESETS.md` §6). */
  const { readPresets, presetMenu } = await server.ssrLoadModule('/app/lib/presets.ts');
  const presets = readPresets(data, []);
  const offered = new Set(presetMenu(presets).flatMap((tab) => tab.areas.flatMap((area) => area.presets.map((preset) => preset.id))));
  const unreachable = importedDecks.filter((deck) => !offered.has(deck.key));
  report(unreachable.length === 0, `every saved deck is a preset on offer (${unreachable.length} not offered)`);
  const misplaced = importedDecks.filter((deck) => {
    const preset = presets.find((entry) => entry.id === deck.key);
    if (!preset || !deck.savesGear) return false;
    return [...deck.runeOwnerById].some(([runeId, unitId]) => preset.runeOwner.get(runeId) !== unitId)
      || [...deck.artifactOwnerById].some(([artifactId, unitId]) => preset.artifactOwner.get(artifactId) !== unitId);
  });
  report(misplaced.length === 0, `every saved placement is the preset's own (${misplaced.length} presets differ)`);
  console.log(`  presets: ${presets.length} (Scenario and ${importedDecks.length} saved decks), ${presets.filter((preset) => preset.content === null && preset.kind === 'game').length} not yet named`);
  console.log(`  saved decks with missing physical artifacts: ${importedDecks.filter((deck) => deck.missingArtifactIds.length).length}`);

  /* An engraved item lives below its owner in the export as well as in the
     account list. Parity is measured after that merge, against the union of
     both places, so an item present only under its owner still has to arrive. */
  const rawArtifactIds = expectedCounts.artifacts.ids;

  // ---- Artifacts -----------------------------------------------------------
  const artifactRecords = Array.isArray(data.artifacts) ? data.artifacts : [];
  const read = artifactRecords.map((record) => ({ record, artifact: readArtifact(record) }));
  const rejected = read.filter((entry) => entry.artifact === null);
  const accepted = read.filter((entry) => entry.artifact !== null);

  console.log(`Artifacts in snapshot (account + engraved, de-duplicated): ${rawArtifactIds.size}`);
  console.log(`Artifacts after import merge: ${artifactRecords.length}`);
  report(artifactRecords.length === rawArtifactIds.size,
    `the import merge keeps every distinct artifact (${rawArtifactIds.size - artifactRecords.length} lost)`);
  console.log(`  accepted by reader:  ${accepted.length}`);
  console.log(`  rejected by reader:  ${rejected.length}`);
  report(rejected.length === 0, `every artifact record is readable (${rejected.length} rejected)`);
  for (const entry of rejected.slice(0, 20)) {
    console.log(`        rejected rid ${entry.record?.rid}: ${JSON.stringify(entry.record)}`);
  }

  /* Every accepted artifact must carry a class the interface can name — a
     named element or type, or the Intangible wildcard. A nameless one would
     import, be counted, and then be absent from every recommendation, which is
     the silent shortfall the parity rule forbids. */
  const nameless = accepted.filter((entry) =>
    artifactEngraveClass(entry.artifact) === null && !entry.artifact.intangible);
  report(nameless.length === 0, `every accepted artifact has a nameable engrave class (${nameless.length} nameless)`);

  const intangible = accepted.filter((entry) => entry.artifact.intangible);
  console.log(`  Intangible (fits any class in its category): ${intangible.length}`);
  for (const [key, count] of countBy(intangible, (entry) => entry.artifact.category)) {
    console.log(`    ${key}: ${count}`);
  }

  /* An Intangible artifact must be judged against every monster its category
     allows. Scoring it against none would be the same invisibility by another
     route, so parity is checked on the scoring side too. */
  const { buildArtifactScoreRequestsForMonsterIds } = await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { calculateArtifactScoresCpu } = await server.ssrLoadModule('/app/lib/compute/artifact-score-core.ts');
  const { recordedArtifactPreferenceMonsterIds } = await server.ssrLoadModule('/app/lib/artifact-preferences.ts');
  /* The shipped defaults, not a hand-written copy: a settings field this audit
     forgets reads as `undefined` and can silently exclude the very artifacts it
     exists to prove are visible. `includeIntangibleArtifacts` did exactly that.
     The scope is widened to every captured monster because parity asks what
     JASWA *can* judge, not what this account happens to own. */
  const { defaultArtifactSettings } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const defaultSettings = { ...defaultArtifactSettings, onlyFactorInOwnedMonsters: false };
  const unscorable = [];
  for (const entry of accepted) {
    const requests = buildArtifactScoreRequestsForMonsterIds(
      data, recordedArtifactPreferenceMonsterIds, defaultSettings, new Set([entry.artifact.id]));
    const eligible = requests.reduce((total, request) => {
      const scores = calculateArtifactScoresCpu(request);
      return total + [...scores].filter((score) => score >= 0).length;
    }, 0);
    if (eligible === 0) unscorable.push(entry);
  }
  console.log(`  accepted but eligible for no monster: ${unscorable.length}`);
  report(unscorable.length === 0,
    `every accepted artifact is judged against at least one monster (${unscorable.length} judged against none)`);
  for (const entry of unscorable.slice(0, 10)) {
    const source = entry.record;
    console.log(`      rid ${source.rid} type ${source.type} attribute ${source.attribute} unit_style ${source.unit_style}`);
  }

  /* The raw field values present in the export, so a value the vocabulary does
     not cover is visible as data rather than inferred from a rejection. */
  console.log('\n  raw `attribute` values on type 1 (attribute artifacts):');
  for (const [value, count] of countBy(artifactRecords.filter((record) => record?.type === 1), (record) => String(record?.attribute))) {
    console.log(`    ${value}: ${count}`);
  }
  console.log('  raw `unit_style` values on type 2 (type artifacts):');
  for (const [value, count] of countBy(artifactRecords.filter((record) => record?.type === 2), (record) => String(record?.unit_style))) {
    console.log(`    ${value}: ${count}`);
  }
  console.log('  raw `type` values:');
  for (const [value, count] of countBy(artifactRecords, (record) => String(record?.type))) {
    console.log(`    ${value}: ${count}`);
  }

  // ---- Runes ---------------------------------------------------------------
  /* Runes have no whole-record reader to audit; what the interface depends on
     is the set id resolving to a name, so an unrecognised set is the rune-side
     equivalent of an unresolved engrave class. */
  const { runeSetName } = await server.ssrLoadModule('/app/lib/rune-sets.ts');
  const runeRecords = Array.isArray(data.runes) ? data.runes : [];
  const unknownSets = runeRecords.filter((rune) => runeSetName(rune?.set_id) === undefined);
  console.log(`\nRunes after import merge: ${runeRecords.length}`);
  console.log(`  unrecognised set id: ${unknownSets.length}`);
  report(unknownSets.length === 0, `every rune has a recognised set (${unknownSets.length} unrecognised)`);
  if (unknownSets.length) {
    for (const [value, count] of countBy(unknownSets, (rune) => `set_id ${rune?.set_id}`)) {
      console.log(`      ${value}: ${count}`);
    }
  }

  // ---- Monsters ------------------------------------------------------------
  /* A monster the catalogue does not describe scores as archetype 0, so it is
     the monster-side parity gap and belongs in the same report. */
  const { hasMonsterCatalogEntry } = await server.ssrLoadModule('/app/lib/monster-catalog.ts');
  const monsterRecords = [
    ...(Array.isArray(data.unit_list) ? data.unit_list : []),
    ...(Array.isArray(data.unit_storage_normal_list) ? data.unit_storage_normal_list : []),
    ...(Array.isArray(data.unit_storage_list) ? data.unit_storage_list : []),
  ];
  const uncatalogued = [...new Set(monsterRecords
    .map((monster) => String(monster?.unit_master_id))
    .filter((id) => id !== 'undefined' && !hasMonsterCatalogEntry(id)))];
  console.log(`\nMonsters after import merge: ${monsterRecords.length}`);
  console.log(`  master ids not in catalogue: ${uncatalogued.length}`);
  report(uncatalogued.length === 0, `every monster is in the catalogue (${uncatalogued.length} missing)`);
  if (uncatalogued.length) console.log(`      ${uncatalogued.join(', ')}`);

  // ---- Relics --------------------------------------------------------------
  const relicRecords = Array.isArray(data.relics) ? data.relics : [];
  console.log(`\nRelics after import merge: ${relicRecords.length}`);

  console.log(`\n${failures === 0 ? 'Import parity holds.' : `${failures} parity failure(s).`}`);
  }
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
