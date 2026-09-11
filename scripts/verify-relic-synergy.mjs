#!/usr/bin/env node

/**
 * Proves the relic synergy table is a measurement and not a coincidence
 * (`docs/RELIC-CANONICAL.md` §5).
 *
 * The table is the one thing on the Relics page nobody can check by eye: it is
 * derived from 6.1 million engravings, and a subtle mistake in the derivation
 * would produce a plausible-looking grid of stars that means nothing. So this
 * check does three separate things, and each would fail on its own kind of
 * error.
 *
 * 1. **It re-derives the table independently** and compares it to the one the
 *    app ships, so a change to `relic-synergy.ts` that quietly alters the
 *    method has to be a deliberate change to this file too.
 * 2. **It splits the monsters in half and correlates the two halves.** If the
 *    association were noise, two halves of the population would disagree. They
 *    do not — the halves correlate above 0.97 however the split is drawn —
 *    and that is the evidence the grading rests on.
 * 3. **It holds the five bands to a real spread.** A scale whose bands are all
 *    but empty at one end is a scale that is not separating anything.
 *
 * Usage: node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-relic-synergy.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relicSynergy, relicSynergyBandOrder } from '../app/lib/relic-synergy.ts';
import { monsterSpeciesId } from '../app/lib/monster-species.ts';
import { relicMainProperties, relicProperties } from '../app/lib/relic-properties.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = resolve(repositoryRoot, 'app/data/engraving-statistics.json');

/** The reliability the halves must reach before the grading is worth drawing. */
const minimumSplitHalfCorrelation = 0.95;
/** No band may hold fewer than this many of the 48 cells. */
const minimumBandOccupancy = 3;

let failures = 0;
function check(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
}

/** Independent re-derivation: the same method, written out rather than imported. */
function derive(panels) {
  const joint = new Map();
  const mainTotals = new Map();
  const propertyTotals = new Map();
  let observations = 0;
  for (const panel of panels) {
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
  const scores = new Map();
  for (const mainId of Object.keys(relicMainProperties).map(Number)) {
    const logLifts = new Map();
    for (const property of relicProperties) {
      const expected = (mainTotals.get(mainId) ?? 0) * (propertyTotals.get(property.id) ?? 0) / observations;
      const observed = joint.get(`${mainId}:${property.id}`) ?? 0;
      if (expected <= 0 || observed <= 0) continue;
      logLifts.set(property.id, Math.log(observed / expected));
    }
    const values = [...logLifts.values()];
    if (!values.length) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    for (const [propertyId, logLift] of logLifts) {
      scores.set(`${relicMainProperties[mainId]}:${propertyId}`, deviation > 0 ? (logLift - mean) / deviation : 0);
    }
  }
  return scores;
}

function correlation(left, right) {
  const size = left.length;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / size;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / size;
  let covariance = 0;
  let leftSpread = 0;
  let rightSpread = 0;
  for (let index = 0; index < size; index += 1) {
    covariance += (left[index] - leftMean) * (right[index] - rightMean);
    leftSpread += (left[index] - leftMean) ** 2;
    rightSpread += (right[index] - rightMean) ** 2;
  }
  return covariance / Math.sqrt(leftSpread * rightSpread);
}

/* A shuffle with a stated seed, so a failure is reproducible and a pass is not
   the luck of one draw. */
function shuffled(items, seed) {
  const order = [...items];
  let state = seed;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

async function main() {
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));

  /* Pooled by species, exactly as the reader pools them: a collaboration pair
     is one monster the game serves under two ids. */
  const pooled = new Map();
  for (const [masterId, entry] of Object.entries(dataset.monsters)) {
    if (!entry.relics) continue;
    const speciesId = monsterSpeciesId(masterId);
    const existing = pooled.get(speciesId);
    if (!existing || (entry.relics.observedAt ?? '') > (existing.observedAt ?? '')) pooled.set(speciesId, entry.relics);
  }
  const panels = [...pooled.values()];
  check(panels.length > 500, `${panels.length} monster types carry a relic panel`);

  const propertyIds = new Set();
  const mainIds = new Set();
  for (const panel of panels) {
    for (const entry of panel.primaryEffect ?? []) mainIds.add(entry.effectId);
    for (const entry of panel.secondaryEffect ?? []) propertyIds.add(entry.effectId);
  }
  const expectedProperties = relicProperties.map((property) => property.id).sort((a, b) => a - b).join(',');
  check([...propertyIds].sort((a, b) => a - b).join(',') === expectedProperties,
    'the panels use exactly the sixteen unique properties the vocabulary declares');
  check([...mainIds].sort((a, b) => a - b).join(',') === '100,101,102',
    'the panels use exactly the three main properties the vocabulary declares');

  const derived = derive(panels);
  let drift = 0;
  let cells = 0;
  for (const [key, score] of derived) {
    const [main, propertyId] = key.split(':');
    const shipped = relicSynergy(main, Number(propertyId));
    if (!shipped) continue;
    cells += 1;
    drift = Math.max(drift, Math.abs(shipped.score - score));
  }
  check(cells === 48, `the shipped table answers for all 48 pairs (it answers for ${cells})`);
  /* The committed file rounds to six places so a recapture's diff stays
     readable; anything past that rounding is real drift. */
  check(drift < 1e-6, `the shipped table matches an independent re-derivation (largest gap ${drift.toExponential(2)})`);

  for (const band of relicSynergyBandOrder) {
    let held = 0;
    for (const key of derived.keys()) {
      const [main, propertyId] = key.split(':');
      if (relicSynergy(main, Number(propertyId))?.band === band) held += 1;
    }
    check(held >= minimumBandOccupancy, `band ${band} holds ${held} of the 48 pairs`);
  }

  for (const seed of [1, 7, 99]) {
    const order = shuffled(panels, seed);
    const half = Math.floor(order.length / 2);
    const first = derive(order.slice(0, half));
    const second = derive(order.slice(half));
    const keys = [...first.keys()].filter((key) => second.has(key));
    const reliability = correlation(keys.map((key) => first.get(key)), keys.map((key) => second.get(key)));
    check(reliability >= minimumSplitHalfCorrelation,
      `split ${seed}: the two halves of the population agree at r = ${reliability.toFixed(4)}`);
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nRelic synergy holds.');
  process.exitCode = failures ? 1 : 0;
}

await main();
