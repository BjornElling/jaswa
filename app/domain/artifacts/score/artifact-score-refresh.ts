import { intangibleRestrictionCode } from './artifact-score-protocol';
import type { ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput } from './artifact-score-protocol';

/**
 * What a change in the game asks the scorer again (`ACCOUNT-TABLES.md` §7).
 *
 * A pair's score reads three things: the packed artifact, the packed monster row
 * and the request's terms — and, in the owned-stone mode, the stones engraved for
 * the artifact's own class (`ARTIFACT-CANONICAL.md` §15.12). Nothing else in the
 * request reaches it. So two packings of the same standards differ, pair by pair,
 * exactly where one of those differs, and only those pairs need the scorer; every
 * other pair's score is the one already held. That is what lets a sync land in a
 * held table without the table going away.
 *
 * The scorer itself is untouched: an update is an ordinary request over fewer
 * artifacts or fewer rows, so a re-scored pair is the figure a full calculation
 * would have produced (`AGENTS.md` §6, *one artifact calculation*).
 */
export type ArtifactScoreChanges = {
  /** Artifacts in the new packing that are new or whose scoring input moved. */
  artifacts: ReadonlySet<string>;
  /** Monster rows, by `artifactScoreRowKey`, that are new or whose input moved. */
  monsters: ReadonlySet<string>;
};

/**
 * A row's identity across two packings. A species row and a copy's own row may
 * in principle share an id string, so the kind is part of the key.
 */
export function artifactScoreRowKey(monster: PackedMonsterScoreInput): string {
  return monster.ownerUnitId === undefined ? `species:${monster.id}` : `copy:${monster.ownerUnitId}`;
}

/* The request's own terms. These are the user's standards, so a view that
   compares them has already found them equal; they are checked anyway, because
   a difference here moves every pair and must never be merged around. */
function requestTerms(request: ArtifactScoreRequest): string {
  return JSON.stringify([request.acceptableWorth, request.conversionMode, request.conversionRollFractions,
    request.insignificantDifference]);
}

/* The stones only count where the mode spends them, and only the ones engraved
   for this artifact's class: spending the last Water stone re-scores the Water
   artifacts and nothing else. Sorted, because the stones' order in the export
   decides nothing. */
function artifactInput(request: ArtifactScoreRequest, artifact: PackedArtifactScoreInput): string {
  const stones = request.conversionMode === 2 && artifact.restriction !== intangibleRestrictionCode
    ? [...(request.ownedConversionPropertyIndexesByClass[artifact.restriction] ?? [])].sort((left, right) => left - right)
    : null;
  return JSON.stringify([artifact, stones]);
}

export function artifactScoreChanges(
  before: ArtifactScoreRequest | undefined,
  after: ArtifactScoreRequest,
): ArtifactScoreChanges {
  if (before === undefined || requestTerms(before) !== requestTerms(after)) {
    return {
      artifacts: new Set(after.artifacts.map((artifact) => artifact.id)),
      monsters: new Set(after.monsters.map(artifactScoreRowKey)),
    };
  }
  const heldArtifacts = new Map(before.artifacts.map((artifact) => [artifact.id, artifactInput(before, artifact)]));
  const heldMonsters = new Map(before.monsters.map((monster) => [artifactScoreRowKey(monster), JSON.stringify(monster)]));
  return {
    artifacts: new Set(after.artifacts
      .filter((artifact) => heldArtifacts.get(artifact.id) !== artifactInput(after, artifact))
      .map((artifact) => artifact.id)),
    monsters: new Set(after.monsters
      .filter((monster) => heldMonsters.get(artifactScoreRowKey(monster)) !== JSON.stringify(monster))
      .map(artifactScoreRowKey)),
  };
}

/**
 * The requests that score every pair a change touched, and no other: the
 * changed artifacts against every row, then the unchanged artifacts against
 * the changed rows. Empty when nothing the scorer reads has moved.
 */
export function artifactScoreUpdateRequests(
  after: ArtifactScoreRequest,
  changes: ArtifactScoreChanges,
): ArtifactScoreRequest[] {
  const changedArtifacts = after.artifacts.filter((artifact) => changes.artifacts.has(artifact.id));
  const unchangedArtifacts = after.artifacts.filter((artifact) => !changes.artifacts.has(artifact.id));
  const changedMonsters = after.monsters.filter((monster) => changes.monsters.has(artifactScoreRowKey(monster)));
  return [
    { ...after, artifacts: changedArtifacts },
    { ...after, artifacts: unchangedArtifacts, monsters: changedMonsters },
  ].filter((request) => request.artifacts.length > 0 && request.monsters.length > 0);
}

type ScoredMatrix = { request: ArtifactScoreRequest; matrix: Float32Array };

function matrixReader({ request, matrix }: ScoredMatrix) {
  const artifacts = new Map(request.artifacts.map((artifact, index) => [artifact.id, index]));
  const monsters = new Map(request.monsters.map((monster, index) => [artifactScoreRowKey(monster), index]));
  return (artifactId: string, rowKey: string): number | undefined => {
    const artifact = artifacts.get(artifactId);
    const monster = monsters.get(rowKey);
    return artifact === undefined || monster === undefined ? undefined : matrix[artifact * request.monsters.length + monster];
  };
}

/**
 * The full score matrix of `after`, each pair read from the update that
 * re-scored it or, failing that, from the held matrix.
 *
 * A pair found in neither is a defect in the change detection, not an
 * ineligible pair, so it fails rather than read as one.
 */
export function mergedArtifactScoreMatrix(
  held: ScoredMatrix | undefined,
  after: ArtifactScoreRequest,
  updates: readonly ScoredMatrix[],
): Float32Array {
  const readers = [...updates, ...(held ? [held] : [])].map(matrixReader);
  const rowKeys = after.monsters.map(artifactScoreRowKey);
  const merged = new Float32Array(after.artifacts.length * after.monsters.length);
  after.artifacts.forEach((artifact, artifactIndex) => {
    rowKeys.forEach((rowKey, monsterIndex) => {
      let value: number | undefined;
      for (const read of readers) {
        value = read(artifact.id, rowKey);
        if (value !== undefined) break;
      }
      if (value === undefined) throw new Error('An artifact update left a pair neither held nor scored.');
      merged[artifactIndex * after.monsters.length + monsterIndex] = value;
    });
  });
  return merged;
}
