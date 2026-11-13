/// <reference lib="webworker" />

/**
 * The artifact score matrix, off the main thread.
 *
 * It decides nothing about *where* the matrix is computed: it hands the request and
 * the user's own setting to `runAccelerated`, which is the one place in the program
 * that weighs a preference against what a card will actually do
 * (`docs/HARDWARE-ACCELERATION.md`). It used to keep its own backend instances and
 * its own fallback rule, which is how a second, quieter version of that decision came
 * to exist — Rune Clean-up's worker said `backend: 'cpu'` in a comment and meant it.
 *
 * Everything after the matrix is deliberately still on this thread. Recovering which
 * conversion a winning pair should take needs the whole scoring detail and not just
 * its number, so it is re-scored here rather than read back from the card.
 */
import { calculateArtifactScoresCpu, scoreArtifactOnMonster } from '../../domain/artifacts/score/artifact-score-core';
import {
  artifactScoreAgreement, calculateArtifactScoresOnGpu,
} from '../gpu/backends/webgpu-artifact-score-backend';
import { runAccelerated } from './accelerated-calculation';
import type { AcceleratedCalculation } from './accelerated-calculation';
import type {
  ArtifactMaximumScore, ArtifactScoreRequest, ArtifactScoreWorkerRequest, ArtifactScoreWorkerResponse,
} from '../../domain/artifacts/score/artifact-score-protocol';

const artifactScoreCalculation: AcceleratedCalculation<ArtifactScoreRequest, Float32Array> = {
  name: 'artifact-score',
  cpu: (request) => calculateArtifactScoresCpu(request),
  gpu: (request, context) => calculateArtifactScoresOnGpu(request, context),
  agrees: artifactScoreAgreement,
};

function maximaFromScores(request: ArtifactScoreRequest, scores: Float32Array): ArtifactMaximumScore[] {
  const maxima: ArtifactMaximumScore[] = [];
  for (let artifactIndex = 0; artifactIndex < request.artifacts.length; artifactIndex += 1) {
    let bestMonsterIndex = -1;
    let bestValue = -1;
    for (let monsterIndex = 0; monsterIndex < request.monsters.length; monsterIndex += 1) {
      const value = scores[artifactIndex * request.monsters.length + monsterIndex];
      if (value > bestValue) { bestValue = value; bestMonsterIndex = monsterIndex; }
    }
    if (bestMonsterIndex < 0 || bestValue < 0) continue;
    const artifact = request.artifacts[artifactIndex];
    const monster = request.monsters[bestMonsterIndex];
    const detail = scoreArtifactOnMonster(artifact, monster, request);
    maxima.push({
      artifactId: artifact.id,
      monsterId: monster.id,
      monsterName: monster.name,
      value: bestValue,
      conversion: detail?.conversion,
      conversions: detail?.conversions ?? [],
    });
  }
  return maxima;
}

function targetScoresFromScores(request: ArtifactScoreRequest, scores: Float32Array): ArtifactMaximumScore[] {
  if (!request.targetMonsterIdByArtifact) return [];
  const monsterIndexes = new Map(request.monsters.map((monster, index) => [monster.id, index]));
  const targetScores: ArtifactMaximumScore[] = [];
  for (let artifactIndex = 0; artifactIndex < request.artifacts.length; artifactIndex += 1) {
    const artifact = request.artifacts[artifactIndex];
    const monsterId = request.targetMonsterIdByArtifact[artifact.id];
    const monsterIndex = monsterId === undefined ? undefined : monsterIndexes.get(monsterId);
    if (monsterIndex === undefined) continue;
    const value = scores[artifactIndex * request.monsters.length + monsterIndex];
    if (value < 0) continue;
    const monster = request.monsters[monsterIndex];
    const detail = scoreArtifactOnMonster(artifact, monster, request);
    targetScores.push({
      artifactId: artifact.id,
      monsterId: monster.id,
      monsterName: monster.name,
      value,
      conversion: detail?.conversion,
      conversions: detail?.conversions ?? [],
    });
  }
  return targetScores;
}

function allScoresFromScores(request: ArtifactScoreRequest, scores: Float32Array): ArtifactMaximumScore[] {
  if (!request.includeAllScores) return [];
  const allScores: ArtifactMaximumScore[] = [];
  for (let artifactIndex = 0; artifactIndex < request.artifacts.length; artifactIndex += 1) {
    const artifact = request.artifacts[artifactIndex];
    for (let monsterIndex = 0; monsterIndex < request.monsters.length; monsterIndex += 1) {
      const value = scores[artifactIndex * request.monsters.length + monsterIndex];
      if (value < 0) continue;
      const monster = request.monsters[monsterIndex];
      const detail = scoreArtifactOnMonster(artifact, monster, request);
      allScores.push({
        artifactId: artifact.id,
        monsterId: monster.id,
        monsterName: monster.name,
        value,
        conversion: detail?.conversion,
        conversions: detail?.conversions ?? [],
      });
    }
  }
  return allScores;
}

self.onmessage = async (event: MessageEvent<ArtifactScoreWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  try {
    const startedAt = performance.now();
    const answer = await runAccelerated(artifactScoreCalculation, message.request, message.preferWebGpu);
    const scores = answer.result;
    const result: ArtifactScoreWorkerResponse = {
      type: 'result', requestId: message.requestId,
      result: {
        backend: answer.backend,
        durationMs: performance.now() - startedAt,
        evaluatedPairs: message.request.artifacts.length * message.request.monsters.length,
        maxima: maximaFromScores(message.request, scores),
        targetScores: targetScoresFromScores(message.request, scores),
        allScores: allScoresFromScores(message.request, scores),
        scoreMatrix: message.request.includeScoreMatrix ? scores : undefined,
        ownedConversionCount: message.request.ownedConversionPropertyIndexes.length,
      },
    };
    self.postMessage(result);
  } catch {
    const response: ArtifactScoreWorkerResponse = {
      type: 'error', requestId: message.requestId,
      message: 'JASWA could not calculate artifact values from this data.',
    };
    self.postMessage(response);
  }
};
