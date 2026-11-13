/**
 * The recommendation pass is deliberately greedy: the highest-scoring usable
 * artifact/monster pair claims its slot, then the next pair is considered.
 * This models an account that keeps farming replacements; it is not a
 * portfolio optimiser that trades a great first placement for a larger sum.
 */
export type ArtifactPlacementCandidate<Category extends string = string> = {
  artifactId: string;
  artifactOrder: number;
  category: Category;
  monsterId: string;
  monsterOrder: number;
  value: number;
  /** At most one placement in this group may go to the same monster. */
  exclusiveGroup?: string;
};

export type ArtifactPlacement<Category extends string = string> = ArtifactPlacementCandidate<Category>;

export type ArtifactAllocation<Category extends string = string> = {
  placements: readonly ArtifactPlacement<Category>[];
  unfilledSlots: readonly { monsterId: string; category: Category }[];
};

function slotKey<Category extends string>(monsterId: string, category: Category): string {
  return `${monsterId}\u0000${category}`;
}

function pairKey<Category extends string>(candidate: ArtifactPlacementCandidate<Category>): string {
  return `${candidate.artifactId}\u0000${candidate.monsterId}\u0000${candidate.category}`;
}

function assertCandidate<Category extends string>(candidate: ArtifactPlacementCandidate<Category>) {
  if (!candidate.artifactId || !candidate.monsterId || !candidate.category) {
    throw new Error('Artifact allocation requires an artifact, monster and category for every candidate.');
  }
  if (!Number.isSafeInteger(candidate.value) || candidate.value <= 0) {
    throw new Error('Artifact allocation accepts only positive whole-point scores.');
  }
  if (!Number.isSafeInteger(candidate.artifactOrder) || !Number.isSafeInteger(candidate.monsterOrder)) {
    throw new Error('Artifact allocation requires a stable order for artifacts and monsters.');
  }
  if (candidate.exclusiveGroup !== undefined && !candidate.exclusiveGroup) {
    throw new Error('Artifact allocation requires a non-empty exclusivity group when one is set.');
  }
}

/**
 * Selects at most one artifact for each monster/category slot and at most one
 * destination for each artifact. A slot is unfilled only when the ranked pass
 * has no usable artifact left for it; it is never filled with a zero-score
 * match merely to make the count look tidy.
 */
export function allocateArtifactPlacements<Category extends string>(
  candidates: readonly ArtifactPlacementCandidate<Category>[],
  slots: readonly { monsterId: string; category: Category }[],
): ArtifactAllocation<Category> {
  const knownSlots = new Set<string>();
  for (const slot of slots) {
    if (!slot.monsterId || !slot.category) throw new Error('Artifact allocation requires a monster and category for every slot.');
    const key = slotKey(slot.monsterId, slot.category);
    if (knownSlots.has(key)) throw new Error('Artifact allocation received the same slot twice.');
    knownSlots.add(key);
  }

  const pairs = new Set<string>();
  for (const candidate of candidates) {
    assertCandidate(candidate);
    const candidateSlot = slotKey(candidate.monsterId, candidate.category);
    if (!knownSlots.has(candidateSlot)) throw new Error('Artifact allocation received a candidate outside its recommendation scope.');
    const key = pairKey(candidate);
    if (pairs.has(key)) throw new Error('Artifact allocation received the same artifact/monster pair twice.');
    pairs.add(key);
  }

  const ranked = [...candidates].sort((left, right) => right.value - left.value
    || left.artifactOrder - right.artifactOrder
    || left.monsterOrder - right.monsterOrder
    || left.category.localeCompare(right.category));
  const placedArtifacts = new Set<string>();
  const filledSlots = new Set<string>();
  const exclusiveGroups = new Set<string>();
  const placements: ArtifactPlacement<Category>[] = [];

  for (const candidate of ranked) {
    const key = slotKey(candidate.monsterId, candidate.category);
    const exclusiveKey = candidate.exclusiveGroup === undefined
      ? undefined : `${candidate.monsterId}\u0000${candidate.exclusiveGroup}`;
    if (placedArtifacts.has(candidate.artifactId) || filledSlots.has(key)
      || (exclusiveKey !== undefined && exclusiveGroups.has(exclusiveKey))) continue;
    placedArtifacts.add(candidate.artifactId);
    filledSlots.add(key);
    if (exclusiveKey !== undefined) exclusiveGroups.add(exclusiveKey);
    placements.push(candidate);
  }

  const unfilledSlots = slots.filter((slot) => !filledSlots.has(slotKey(slot.monsterId, slot.category)));
  assertArtifactAllocation(placements, slots);
  return { placements, unfilledSlots };
}

/** A defensive boundary for callers and regression checks. */
export function assertArtifactAllocation<Category extends string>(
  placements: readonly ArtifactPlacement<Category>[],
  slots: readonly { monsterId: string; category: Category }[],
) {
  const validSlots = new Set(slots.map((slot) => slotKey(slot.monsterId, slot.category)));
  const artifacts = new Set<string>();
  const filledSlots = new Set<string>();
  const exclusiveGroups = new Set<string>();
  for (const placement of placements) {
    assertCandidate(placement);
    const key = slotKey(placement.monsterId, placement.category);
    if (!validSlots.has(key)) throw new Error('Artifact allocation placed an artifact outside its recommendation scope.');
    if (artifacts.has(placement.artifactId)) throw new Error('Artifact allocation assigned one artifact more than once.');
    if (filledSlots.has(key)) throw new Error('Artifact allocation assigned more than one artifact to a monster slot.');
    if (placement.exclusiveGroup !== undefined) {
      const exclusiveKey = `${placement.monsterId}\u0000${placement.exclusiveGroup}`;
      if (exclusiveGroups.has(exclusiveKey)) throw new Error('Artifact allocation assigned more than one exclusive group member to a monster.');
      exclusiveGroups.add(exclusiveKey);
    }
    artifacts.add(placement.artifactId);
    filledSlots.add(key);
  }
}
