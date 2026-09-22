import collaborationSpeciesData from '../data/collaboration-species.json';

// A collaboration event can launch a monster under a licensed name and later
// expose a documented generic statistic row. That relationship belongs to
// statistics and scoring only; Storage's monster identity deliberately keeps
// catalogue lineages separate for ownership, fodder and row merging.
//
// Both master ids stay in circulation, and a copy keeps the name it was summoned
// under. `unit_master_id` therefore remains the identity of that owned line,
// while the species is only the shared key used by the captured statistics. A
// roster row shows the master id's own name;
// captured-statistics consumers — statistics, default preferences and score
// rankings — can key on the species, so a documented pair counts once and its
// observations pool into a single sample. Ownership questions use the separate
// canonical identity in `monster-identity.ts`.
//
// The table lives in `app/data/collaboration-species.json` rather than here
// because the collection script reads it too, and one source beats two that
// agree until they do not. The generic id is the species representative because
// it outlives the event; `members` are the other master ids served by that
// statistics population. This is intentionally not the owned-monster identity.
// A class can hold three: Nezuko Kamado and Gandalf each shipped an extra event
// form that reuses the same artwork, and those belong to the same species.
//
// Pairings come from the published collaboration mappings and are verified
// against the catalogue — members of a class agree on element, awakening tier
// and archetype. `npm run verify:collaboration-species` rechecks that after
// every catalogue sync, and reports any pending pair the catalogue has caught up
// with.

type CollaborationSpecies = {
  collab: string | null;
  genericName: string | null;
  collabName: string | null;
  members: string[];
};

type CollaborationSpeciesFile = {
  speciesCount: number;
  pending: { collab: string; collabName: string; genericName: string }[];
  species: Record<string, CollaborationSpecies>;
};

const file = collaborationSpeciesData as CollaborationSpeciesFile;

export const collaborationSpecies = file.species;

const speciesByMember: Record<string, string> = {};
for (const [speciesId, entry] of Object.entries(file.species)) {
  for (const member of entry.members) speciesByMember[member] = speciesId;
}

/**
 * The species a master id belongs to. A monster that never had a collaboration
 * twin is its own species, so callers need no special case for the common one.
 */
export function monsterSpeciesId(masterId: unknown): string {
  const key = String(masterId ?? 'unknown');
  return speciesByMember[key] ?? key;
}

/**
 * Every master id in a species, representative first. Used where a species has
 * to be widened back into the ids the game actually reports — matching owned
 * copies, or pooling statistics recorded under either name.
 */
export function monsterSpeciesMemberIds(speciesId: unknown): string[] {
  const key = String(speciesId ?? 'unknown');
  const entry = file.species[key];
  return entry ? [key, ...entry.members] : [key];
}

export function isCollaborationSpecies(speciesId: unknown): boolean {
  return Boolean(file.species[String(speciesId ?? 'unknown')]);
}
