#!/usr/bin/env node

/**
 * Checks `app/data/collaboration-species.json` against the monster catalogue.
 *
 * A collaboration monster and the generic unit the game later re-released it as
 * are the same monster under two names, and the app pools their statistics and
 * preferences on that basis. The pairings themselves come from Com2uS'
 * announcements, which this command cannot read — what it can do is prove that
 * every pairing is *internally consistent*, so a typo or a stale entry fails
 * loudly rather than quietly averaging two unrelated monsters together.
 *
 * A class is consistent when its members exist in the catalogue and agree on
 * element, awakening tier and archetype — the three properties the game copies
 * verbatim when it re-releases a collaboration unit. Archetype is the useful one:
 * it is not implied by the id, so agreement across a pair is real evidence the
 * mapping is right rather than a restatement of how the id is built.
 *
 * It also reports pending pairs whose generic counterpart has appeared in the
 * catalogue since the table was written, so a sync that unblocks one is noticed.
 *
 * Usage: node scripts/verify-collaboration-species.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(repositoryRoot, 'app/data/swarfarm-monsters.json');
const speciesPath = resolve(repositoryRoot, 'app/data/collaboration-species.json');
const statisticsPath = resolve(repositoryRoot, 'app/data/engraving-statistics.json');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/* `<family><tier><element>`: the last two digits are what must match across a
   class, since a collaboration pair is re-released element for element. */
function tierAndElement(id) {
  return String(id).slice(-2);
}

async function main() {
  const [catalog, table, statistics] = await Promise.all([
    readJson(catalogPath),
    readJson(speciesPath),
    readJson(statisticsPath).catch(() => ({ monsters: {} })),
  ]);

  const byId = new Map(catalog.monsters.map((monster) => [String(monster.com2us_id), monster]));
  const problems = [];
  const notes = [];
  const memberOwners = new Map();

  let classCount = 0;
  let idCount = 0;

  for (const [speciesId, entry] of Object.entries(table.species ?? {})) {
    classCount += 1;
    const members = [speciesId, ...(entry.members ?? [])];
    idCount += members.length;

    for (const member of members) {
      if (!byId.has(member)) {
        problems.push(`${speciesId} (${entry.collabName ?? '?'} / ${entry.genericName ?? '?'}): master id ${member} is not in the catalogue`);
        continue;
      }
      /* An id in two classes would make the species a monster resolves to depend
         on iteration order, which is the one thing a canonical key may not do. */
      const owner = memberOwners.get(member);
      if (owner && owner !== speciesId) problems.push(`master id ${member} appears in both species ${owner} and ${speciesId}`);
      memberOwners.set(member, speciesId);
    }

    if (table.species[speciesId] && (entry.members ?? []).includes(speciesId)) {
      problems.push(`${speciesId} lists itself as one of its own members`);
    }
    /* A representative that is also somebody else's member would chain, and
       `monsterSpeciesId` resolves exactly one hop. */
    for (const [otherId, other] of Object.entries(table.species ?? {})) {
      if (otherId !== speciesId && (other.members ?? []).includes(speciesId)) {
        problems.push(`${speciesId} is a representative but also a member of ${otherId}`);
      }
    }

    const known = members.filter((member) => byId.has(member));
    if (known.length < 2) {
      if (known.length) problems.push(`${speciesId} (${entry.genericName ?? '?'}) has no twin left in the catalogue`);
      continue;
    }

    const slots = new Set(known.map(tierAndElement));
    if (slots.size > 1) {
      problems.push(`${speciesId} (${entry.genericName ?? '?'}) mixes tiers or elements: ${known.map((id) => `${id}`).join(', ')}`);
    }

    const archetypes = new Set(known.map((member) => byId.get(member).archetype ?? 'none'));
    if (archetypes.size > 1) {
      problems.push(`${speciesId} (${entry.collabName ?? '?'} / ${entry.genericName ?? '?'}) disagrees on archetype: ${
        known.map((member) => `${member}=${byId.get(member).archetype ?? 'none'}`).join(', ')}`);
    }

    if (entry.genericName && byId.get(speciesId)?.name !== entry.genericName) {
      notes.push(`${speciesId}: table says the generic name is "${entry.genericName}", the catalogue says "${byId.get(speciesId)?.name}"`);
    }
  }

  /* The generic unit is the representative because it outlives the event, so a
     statistics row filed under a collaboration id is history, not an error — the
     reader pools it. Reported so the pooling stays visible rather than implicit. */
  const pooledIds = Object.keys(statistics.monsters ?? {}).filter((id) => memberOwners.has(id));

  for (const pending of table.pending ?? []) {
    const found = catalog.monsters.find((monster) => monster.name === pending.genericName);
    if (found) {
      problems.push(`pending pair ${pending.collabName} / ${pending.genericName} can now be resolved: the catalogue carries ${found.com2us_id}. Add it to the table.`);
    } else {
      notes.push(`still pending: ${pending.collab} — ${pending.collabName} / ${pending.genericName} (no catalogue entry yet)`);
    }
  }

  console.log(`Checked ${classCount} species covering ${idCount} master ids against ${catalogPath}.`);
  if (pooledIds.length) {
    console.log(`${pooledIds.length} statistics row(s) are filed under a collaboration id and pool into their species at read time.`);
  }
  for (const note of notes) console.log(`  note: ${note}`);

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nEvery species is consistent: members exist, share an element and tier, and agree on archetype.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
