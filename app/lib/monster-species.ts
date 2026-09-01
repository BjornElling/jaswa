import collaborationSpeciesData from '../data/collaboration-species.json';

// A collaboration event launches monsters under a licensed name. When the event
// ends, the same monsters return as regular units under names of the game's own
// making, with identical stats and skills — only the artwork and the name
// differ. Com2uS balances the two together and treats them as one unit.
//
// Both master ids stay in circulation, and a copy keeps the name it was summoned
// under, so a player can hold one of each. That gives the two ids different jobs
// here: `unit_master_id` is what the game calls this copy, and the species is
// what the monster actually is. A roster row shows the master id's own name;
// everything that speaks about monsters in general — statistics, preferences,
// score rankings — is keyed on the species, so a pair counts once and their
// observations pool into a single sample.
//
// The table lives in `app/data/collaboration-species.json` rather than here
// because the collection script reads it too, and one source beats two that
// agree until they do not. The generic id is the species representative because
// it outlives the event; `members` are the other master ids of the same monster.
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

/**
 * Collaboration monsters whose generic counterpart the game has released but the
 * catalogue does not carry yet, so there is nothing to pair them with. Recorded
 * rather than left unsaid: a catalogue sync that adds them is then noticed by the
 * verifier instead of passing silently.
 */
export const pendingCollaborationMonsters = file.pending;

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
