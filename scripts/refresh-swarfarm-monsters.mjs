#!/usr/bin/env node

/**
 * Creates the checked-in Swarfarm monster snapshot used by the browser bundle.
 *
 * This is deliberately a human-triggered maintenance command. It never runs in
 * the app, on import, or in CI. Swarfarm's public API is rate limited, so the
 * command fetches one page at a time, waits at least three seconds between
 * pages, and stops rather than retrying after a rate-limit/server response.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repositoryRoot, 'app/data/swarfarm-monsters.json');
const endpoint = 'https://swarfarm.com/api/v2/monsters/';
const requestedPageSize = 100;
const minimumDelayMs = 3_000;
const maximumSnapshotAgeMs = 7 * 24 * 60 * 60 * 1_000;
const force = process.argv.includes('--force');

const fields = [
  'com2us_id', 'name', 'image_filename', 'archetype',
];

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function compactMonster(monster) {
  const compacted = Object.fromEntries(fields
    .filter((field) => Object.hasOwn(monster, field))
    .map((field) => [field, monster[field]]));
  return compacted;
}

async function readExistingSnapshot() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
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

async function fetchPage(page) {
  const url = new URL(endpoint);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(requestedPageSize));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'JASWA monster-catalog refresh (local maintenance; no runtime API requests)',
    },
  });

  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('retry-after');
    throw new Error(`Swarfarm returned ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}. The existing snapshot was kept; retry manually after that interval.`);
  }
  if (!response.ok) throw new Error(`Swarfarm returned HTTP ${response.status}. The existing snapshot was kept.`);

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.results) || !Number.isInteger(payload.count)) {
    throw new Error('Swarfarm response did not match the expected paginated monster shape. The existing snapshot was kept.');
  }
  return payload;
}

async function writeSnapshot(snapshot) {
  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  await rm(temporaryPath, { force: true });
}

async function main() {
  const existing = await readExistingSnapshot();
  if (!force && isFresh(existing)) {
    console.log(`Snapshot is younger than seven days (${existing.retrievedAt}); no API request was made. Use --force only for a deliberate refresh.`);
    return;
  }

  const monsters = [];
  let page = 1;
  let totalCount = null;
  while (true) {
    const payload = await fetchPage(page);
    totalCount ??= payload.count;
    if (payload.count !== totalCount) throw new Error('Swarfarm changed the reported total during this refresh. The existing snapshot was kept.');
    monsters.push(...payload.results.map(compactMonster));
    console.log(`Fetched page ${page}: ${monsters.length}/${totalCount} monsters.`);
    if (!payload.next) break;
    page += 1;
    await sleep(minimumDelayMs);
  }

  if (monsters.length !== totalCount) {
    throw new Error(`Expected ${totalCount} monsters but received ${monsters.length}. The existing snapshot was kept.`);
  }
  const duplicateId = monsters.find((monster, index) => monsters.findIndex((candidate) => candidate.com2us_id === monster.com2us_id) !== index);
  if (duplicateId) throw new Error(`Duplicate com2us_id ${duplicateId.com2us_id} in Swarfarm response. The existing snapshot was kept.`);

  await writeSnapshot({
    source: endpoint,
    retrievedAt: new Date().toISOString(),
    totalCount,
    requestedPageSize,
    minimumDelayMs,
    monsters: monsters.sort((left, right) => left.com2us_id - right.com2us_id),
  });
  console.log(`Wrote ${monsters.length} monsters to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
