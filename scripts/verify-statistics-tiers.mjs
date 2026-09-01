#!/usr/bin/env node

/**
 * Proves `app/data/engraving-statistics.json` holds each monster at one
 * awakening tier only (decision 39), and that no panel is an empty answer
 * (decision 40).
 *
 * The game makes a two-tier capture all but impossible: asked for statistics it
 * normalises upward, serving the awakened panel for an un-awakened monster and
 * the 2A panel where a 2A exists. Across every session captured so far it has
 * never once returned a lower tier.
 *
 * The check exists because the cost of being wrong is asymmetric. The reader
 * (`app/lib/artifact-preferences.ts`) keys on the master id and knows nothing of
 * tiers, so a monster held at two tiers becomes two unrelated monsters, each
 * ranked on its own and each claiming to be that monster — counted, usable, and
 * wrong, which is `AGENTS.md` §0.1's third failure and the one nothing surfaces.
 *
 * It also reports rows the coverage list would never ask for, so a record cannot
 * sit in the dataset unreachable by the work list — the Homunculus case, where a
 * five-digit rule counted captured statistics that coverage never listed.
 *
 * Usage: node scripts/verify-statistics-tiers.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = resolve(repositoryRoot, 'app/data/engraving-statistics.json');
const catalogPath = resolve(repositoryRoot, 'app/data/swarfarm-monsters.json');

const panels = ['runes', 'artifacts', 'relics'];

/** The tier lives in the second-to-last digit: 0 un-awakened, 1 awakened, 3 2A. */
function awakeningTier(id) {
  const digits = String(id);
  if (digits.length < 3) return null;
  return Number(digits[digits.length - 2]);
}

/** One monster across all its awakening tiers — the id with the tier blanked. */
function monsterLineage(id) {
  const digits = String(id);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, -2)}_${digits.at(-1)}`;
}

async function main() {
  const [dataset, catalog] = await Promise.all([
    readFile(datasetPath, 'utf8').then(JSON.parse),
    readFile(catalogPath, 'utf8').then(JSON.parse),
  ]);
  const rows = dataset.monsters ?? {};
  const known = new Map(catalog.monsters.map((monster) => [String(monster.com2us_id), monster]));

  /* A monster held at two tiers, per panel: the failure this command exists for. */
  const perLineage = new Map();
  for (const id of Object.keys(rows)) {
    const tier = awakeningTier(id);
    if (tier === null) continue;
    for (const panel of panels) {
      if (!rows[id][panel]) continue;
      const key = `${monsterLineage(id)}:${panel}`;
      const seen = perLineage.get(key) ?? [];
      seen.push({ id, tier });
      perLineage.set(key, seen);
    }
  }
  const collisions = [...perLineage].filter(([, seen]) => seen.length > 1);

  /* Tier 0 must never appear: decision 23 excludes it and the game never serves
     it, so one here means an assumption broke rather than a preference lapsed. */
  const unawakened = Object.keys(rows).filter((id) => awakeningTier(id) === 0);

  /* A row the catalogue does not know is a record nothing can name or reach. */
  const unknown = Object.keys(rows).filter((id) => !known.has(id));

  /* Decision 40: a panel with no distribution at all is not a capture. The game
     answers this way for monsters too little played to have one — every 1★ does
     — and storing it would count the monster as covered while holding nothing. */
  const emptyPanels = [];
  for (const id of Object.keys(rows)) {
    for (const panel of panels) {
      const observation = rows[id][panel];
      if (!observation) continue;
      const counted = (observation.primaryEffect?.length ?? 0) + (observation.secondaryEffect?.length ?? 0);
      if (counted === 0) emptyPanels.push({ id, panel });
    }
  }

  let failed = false;

  if (collisions.length) {
    failed = true;
    console.error(`${collisions.length} monster/panel pair(s) are held at more than one awakening tier:`);
    for (const [key, seen] of collisions.slice(0, 20)) {
      const panel = key.split(':')[1];
      const shown = seen.map((entry) => `${entry.id} (tier ${entry.tier})`).join(' and ');
      console.error(`  ${panel}: ${shown}`);
    }
    if (collisions.length > 20) console.error(`  … and ${collisions.length - 20} more.`);
    console.error('  The reader treats these as separate monsters. Re-run the collector, which keeps the highest.');
  }

  if (unawakened.length) {
    failed = true;
    console.error(`\n${unawakened.length} row(s) are un-awakened (tier 0), which decision 23 excludes:`);
    for (const id of unawakened.slice(0, 20)) console.error(`  ${id} ${known.get(id)?.name ?? '(not in catalogue)'}`);
  }

  if (unknown.length) {
    failed = true;
    console.error(`\n${unknown.length} row(s) are not in the monster catalogue:`);
    for (const id of unknown.slice(0, 20)) console.error(`  ${id}`);
    console.error('  A record the catalogue cannot name is one the interface cannot show.');
  }

  if (emptyPanels.length) {
    failed = true;
    console.error(`\n${emptyPanels.length} panel(s) hold no distribution at all:`);
    for (const entry of emptyPanels.slice(0, 20)) {
      console.error(`  ${entry.id} ${known.get(entry.id)?.name ?? '?'} — ${entry.panel}`);
    }
    if (emptyPanels.length > 20) console.error(`  … and ${emptyPanels.length - 20} more.`);
    console.error('  Decision 40: an empty answer is not a capture. Re-run the collector, which drops these.');
  }

  if (failed) {
    console.error('\nSee decisions 39 and 40 in docs/ARTIFACT-SPRINT.md.');
    process.exitCode = 1;
    return;
  }

  const panelCount = Object.values(rows).reduce((total, row) => total + Object.keys(row).length, 0);
  const tiers = new Map();
  for (const id of Object.keys(rows)) {
    const tier = awakeningTier(id);
    tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
  }
  const shape = [...tiers].sort((left, right) => left[0] - right[0]).map(([tier, count]) => `${count} at tier ${tier}`).join(', ');
  console.log(`${Object.keys(rows).length} monster row(s) and ${panelCount} panel(s): ${shape}.`);
  console.log('Every monster is held at one awakening tier, every row is a catalogued monster, and every panel carries a distribution.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
