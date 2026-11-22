/** Independent holdouts and paired, seeded verdict sensitivity. Pass a private export for the account sweep. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createImportedGame, validateGameFile } from '../app/ingest/game-export.ts';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { referenceLines } from '../app/domain/reference/rune-reference-stats.ts';
import { runeAdvice, planQualityReferences, readingAllowance } from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import { newRuneAdviceScope, prepareRuneCandidate, roleBuilds } from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { defaultCraftCredit } from '../app/domain/runes/craft/rune-craft-end-state.ts';
import { isIntangibleRuneSet } from '../app/domain/runes/rune-sets.ts';
import { slotMainProperties } from '../app/domain/runes/rune-properties.ts';
import { runeScaleStars } from '../app/domain/runes/rune-substat-weights.ts';
import {
  allowanceDenominator, qualityBar, qualityHits, referenceBodies, referenceKey, referencePieceKey,
  referenceSampleSize, referenceScores,
} from '../app/domain/runes/cleanup/rune-quality-reference.ts';

const standardSeed = 0x73b4ae91;
const holdoutSeeds = [0x937e57a9, 0x114f10c3];
const candidateSeed = 0xa0761d64;
const allowances = [5500, 10000, 20000, 50000, 100000, 200000, allowanceDenominator];
const file = process.argv[2] ?? new URL('../tests/fixtures/craft-account.json', import.meta.url);
const raw = JSON.parse(readFileSync(file, 'utf8'));
const game = createImportedGame('verification.json', raw, validateGameFile(raw));
const base = new Map([...referenceLines(game.data)].map(([type, entry]) => [type, entry.stats]));
const roles = defaultRuneRoles();
const settings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false, neverSellPotentialValue: false,
  neverSellEngravedPlacements: false, neverSellReappTargets: false, intangibleRunes: 1 };
const runes = game.snapshot.runes;
const planned = planQualityReferences(runes, roles, base, settings);
const broad = Float64Array.of(0, 0.002, 0.13, 0.006, 0.11, 0.005, 0.03, 0, 0.17, 0.12, 0.07, 0.02, 0.05);
const speed = Float64Array.from(broad, (_, id) => id === 8 ? 0.17 : 0);

const n = referenceSampleSize;
let greatestOvershoot = 0;
let greatestAtom = 0;
let greatestUndershoot = 0;
let buckets = 0;
function holdoutCheck(reference, holdout, prices) {
  for (const allowance of allowances) {
    const alpha = allowance / allowanceDenominator;
    const k = Math.floor(alpha * n);
    const bar = qualityBar(reference, allowance, prices);
    const size = qualityHits(reference, bar);
    assert.ok(size <= k);
    if (k < n && reference.scores[n - 1 - k] > 0) {
      const atAtom = qualityHits(reference, reference.scores[n - 1 - k]);
      assert.ok(atAtom > k);
      greatestAtom = Math.max(greatestAtom, (atAtom - size) / n);
    }
    const observed = qualityHits(holdout, bar) / n;
    const tolerance = 5 * Math.sqrt(2 * alpha * (1 - alpha) / n);
    assert.ok(observed <= alpha + tolerance, 'An independent reference exceeded the one-sided allowance band.');
    greatestOvershoot = Math.max(greatestOvershoot, observed - alpha);
    greatestUndershoot = Math.max(greatestUndershoot, alpha - observed);
    buckets += 1;
  }
}

for (const stars of [runeScaleStars]) for (const slot of [1, 2, 3, 4, 5, 6]) {
  for (const main of slotMainProperties[slot]) {
    for (const prices of [broad, speed]) {
      const bodies = referenceBodies(slot, stars, main, n, standardSeed);
      const reference = { scores: referenceScores(bodies, prices, defaultCraftCredit) };
      for (const seed of holdoutSeeds) {
        const holdout = { scores: referenceScores(referenceBodies(slot, stars, main, n, seed), prices, defaultCraftCredit) };
        holdoutCheck(reference, holdout, prices);
      }
    }
  }
}
if (process.argv.includes('--catalogue')) {
  const training = experimentalReferences(n, standardSeed);
  const holdouts = holdoutSeeds.map((seed) => experimentalReferences(n, seed));
  for (const piece of planned.toSorted((left, right) => referencePieceKey(left).localeCompare(referencePieceKey(right)))) {
    const reference = training.get(piece, piece.prices, piece.credit);
    for (const sample of holdouts) holdoutCheck(reference, sample.get(piece, piece.prices, piece.credit), piece.prices);
  }
}
console.log(JSON.stringify({ holdoutComparisons: buckets, greatestAtom, greatestOvershoot, greatestUndershoot }));

function experimentalReferences(count, seed) {
  let key;
  let bodies;
  return {
    get(piece, prices, credit) {
      const pieceKey = referencePieceKey(piece);
      if (key !== pieceKey) {
        key = pieceKey;
        bodies = referenceBodies(piece.slot, piece.stars, piece.main, count, seed);
      }
      return { key: referenceKey(piece, prices, credit), scores: referenceScores(bodies, prices, credit) };
    },
  };
}

function boundaryOf(rune, experimental, count) {
  const standard = experimentalReferences(n, standardSeed);
  const scope = newRuneAdviceScope(settings.craftCredit);
  let closest = Infinity;
  for (const role of roles) {
    const stats = base.get(role.type);
    if (!stats) continue;
    for (const build of roleBuilds(role)) {
      const reading = prepareRuneCandidate(rune, role, build, stats, scope.ruler, scope);
      if (!reading || reading.best <= 0) continue;
      const allowance = readingAllowance(settings, reading.rank, isIntangibleRuneSet(rune.setName));
      if (allowance === null) continue;
      const piece = { slot: rune.slot, stars: runeScaleStars, main: reading.main };
      const { prices } = reading.scoring;
      const reference = standard.get(piece, prices, scope.ruler);
      const comparison = experimental.get(piece, prices, scope.ruler);
      const alpha = allowance / allowanceDenominator;
      const original = qualityHits(reference, reading.best) / n;
      const changed = qualityHits(comparison, reading.best) / count;
      if ((original <= alpha) === (changed <= alpha)) continue;
      const band = 5 * Math.sqrt(alpha * (1 - alpha) * (1 / n + 1 / count));
      closest = Math.min(closest, Math.abs(original - alpha) / band);
    }
  }
  return closest;
}

const start = performance.now();
const baseline = await runeAdvice(runes, roles, settings, base);
console.log(JSON.stringify({ runes: runes.length, keys: planned.length, baselineMs: Math.round(performance.now() - start) }));
for (const [name, count, seed, candidate] of [
  ['size-4096', 4096, standardSeed, 0],
  ['size-65536', 65536, standardSeed, 0],
  ['reference-seed', n, holdoutSeeds[0], 0],
  ['candidate-seed', n, standardSeed, candidateSeed],
  ['both-seeds', n, holdoutSeeds[0], candidateSeed],
]) {
  const measured = performance.now();
  const references = seed === standardSeed && count === n ? undefined : experimentalReferences(count, seed);
  const alternate = await runeAdvice(runes, roles, settings, base, undefined, { references, candidateSeed: candidate });
  const flips = {};
  const affectedSlots = {};
  const affectedRoles = {};
  const affectedRanks = {};
  let flipped = 0;
  let speedSales = 0;
  let greatestChanceMargin = 0;
  let greatestRelativeQualityMargin = 0;
  const bands = { chance: 5 * Math.sqrt(2 * 0.20 * 0.80 / 4096), quality: 5 * Math.sqrt(2 * 0.05 * 0.95 / Math.min(count, n)) };
  for (const rune of runes) {
    const before = baseline.get(rune.id);
    const after = alternate.get(rune.id);
    if (before.verdict === after.verdict) continue;
    flipped += 1;
    const transition = before.verdict + ' → ' + after.verdict;
    flips[transition] = (flips[transition] ?? 0) + 1;
    affectedSlots[rune.slot] = (affectedSlots[rune.slot] ?? 0) + 1;
    const role = after.role?.name ?? 'No role';
    affectedRoles[role] = (affectedRoles[role] ?? 0) + 1;
    affectedRanks[after.rank] = (affectedRanks[after.rank] ?? 0) + 1;
    if (after.verdict === 'sell' && rune.subProperties.some(({ statId, value }) => statId === 8 && value >= 20)) speedSales += 1;
    if (rune.level < 12) greatestChanceMargin = Math.max(greatestChanceMargin, Math.abs(before.chance - 0.20));
    else {
      assert.ok(references, 'Changing only the future stream cannot flip a finished rune.');
      const margin = boundaryOf(rune, references, count);
      assert.ok(margin <= 1, 'No changed reading accounts for the finished rune flip within the holdout band.');
      greatestRelativeQualityMargin = Math.max(greatestRelativeQualityMargin, margin);
    }
  }
  console.log(JSON.stringify({ name, flips, affectedSlots, affectedRoles, affectedRanks, speedSales, greatestChanceMargin, greatestRelativeQualityMargin,
    fraction: flipped / runes.length, bands, ms: Math.round(performance.now() - measured) }));
  assert.ok(greatestChanceMargin <= bands.chance, 'An unfinished rune flipped outside the chance band.');
  assert.equal(speedSales, 0, 'An alternate seed or size introduced a new sale with at least 20 SPD.');
  assert.ok(flipped <= Math.max(1, Math.ceil(runes.length * (name.startsWith('size') ? 0.05 : 0.02))),
    'The paired verdict sensitivity exceeded the release tolerance.');
}
