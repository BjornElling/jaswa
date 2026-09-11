#!/usr/bin/env node

/**
 * Derives `app/data/relic-synergy.json` from the engraving statistics.
 *
 * The table is 48 numbers. The capture it comes out of is 6.5 MB, and a page
 * that imported the capture to read the 48 numbers would make every visitor
 * download the whole archive to be told that HP and Valiant go together. So the
 * derivation runs here, once, and the app ships the answer.
 *
 * That is a derived value written down, which `AGENTS.md` §6 is right to be
 * wary of — so it is kept honest the same way the capture itself is:
 * `npm run verify:relic-synergy` re-derives the table from the statistics and
 * fails if the committed file has drifted from them. Re-run this script after
 * any capture session that adds relic panels.
 *
 * `docs/RELIC-CANONICAL.md` §5 states the method this implements.
 *
 * Usage: node scripts/build-relic-synergy.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = resolve(repositoryRoot, 'app/data/engraving-statistics.json');
const outputPath = resolve(repositoryRoot, 'app/data/relic-synergy.json');

const mainProperties = { 100: 'HP', 101: 'ATK', 102: 'DEF' };
const propertyIds = Array.from({ length: 16 }, (_, index) => index + 1);

/* Kept to six places: far finer than any band boundary, and short enough that a
   recapture's diff is readable line by line. */
const round = (value) => Number(value.toFixed(6));

/**
 * A collaboration pair is one monster the game serves under two ids with
 * byte-identical panels, so the later observation stands for the pair. The rule
 * belongs to `docs/MONSTER-SPECIES-DECISION.md`; the id arithmetic is repeated
 * here rather than imported so this script stays plain Node with no loader.
 */
async function speciesResolver() {
  const table = JSON.parse(await readFile(resolve(repositoryRoot, 'app/data/collaboration-species.json'), 'utf8'));
  const members = new Map();
  for (const [speciesId, entry] of Object.entries(table.species ?? {})) {
    for (const member of entry.members ?? []) members.set(String(member), speciesId);
  }
  return (masterId) => members.get(String(masterId)) ?? String(masterId);
}

async function main() {
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  const speciesId = await speciesResolver();

  const panels = new Map();
  for (const [masterId, entry] of Object.entries(dataset.monsters)) {
    if (!entry.relics) continue;
    const key = speciesId(masterId);
    const existing = panels.get(key);
    if (!existing || (entry.relics.observedAt ?? '') > (existing.observedAt ?? '')) panels.set(key, entry.relics);
  }

  const joint = new Map();
  const mainTotals = new Map();
  const propertyTotals = new Map();
  let observations = 0;
  for (const panel of panels.values()) {
    const primary = panel.primaryEffect ?? [];
    const secondary = panel.secondaryEffect ?? [];
    const primaryTotal = primary.reduce((sum, entry) => sum + entry.count, 0);
    const secondaryTotal = secondary.reduce((sum, entry) => sum + entry.count, 0);
    if (primaryTotal <= 0 || secondaryTotal <= 0) continue;
    const weight = (primaryTotal + secondaryTotal) / 2;
    observations += weight;
    for (const main of primary) {
      const share = weight * (main.count / primaryTotal);
      mainTotals.set(main.effectId, (mainTotals.get(main.effectId) ?? 0) + share);
      for (const property of secondary) {
        const key = `${main.effectId}:${property.effectId}`;
        joint.set(key, (joint.get(key) ?? 0) + share * (property.count / secondaryTotal));
      }
    }
    for (const property of secondary) {
      propertyTotals.set(property.effectId,
        (propertyTotals.get(property.effectId) ?? 0) + weight * (property.count / secondaryTotal));
    }
  }

  const cells = {};
  for (const [mainId, main] of Object.entries(mainProperties)) {
    const logLifts = new Map();
    for (const propertyId of propertyIds) {
      const expected = (mainTotals.get(Number(mainId)) ?? 0) * (propertyTotals.get(propertyId) ?? 0) / observations;
      const observed = joint.get(`${mainId}:${propertyId}`) ?? 0;
      if (expected <= 0 || observed <= 0) continue;
      logLifts.set(propertyId, Math.log(observed / expected));
    }
    const values = [...logLifts.values()];
    if (!values.length) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    for (const [propertyId, logLift] of logLifts) {
      cells[`${main}:${propertyId}`] = {
        score: round(deviation > 0 ? (logLift - mean) / deviation : 0),
        lift: round(Math.exp(logLift)),
        reach: round((joint.get(`${mainId}:${propertyId}`) ?? 0) / observations),
      };
    }
  }

  const document = {
    description: 'How often the player base engraves each relic main property with each unique property, '
      + 'relative to chance. Derived by scripts/build-relic-synergy.mjs; see docs/RELIC-CANONICAL.md §5.',
    derivedFrom: 'app/data/engraving-statistics.json',
    observedFrom: dataset.observedFrom,
    observedTo: dataset.observedTo,
    monsterTypes: panels.size,
    engravings: Math.round(observations),
    cells,
  };
  await writeFile(outputPath, `${JSON.stringify(document, null, 1)}\n`, 'utf8');
  console.log(`Wrote ${Object.keys(cells).length} cells from ${panels.size} monster types `
    + `and ${Math.round(observations).toLocaleString('en')} engravings.`);
}

await main();
