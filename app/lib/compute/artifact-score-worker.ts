/// <reference lib="webworker" />

import { scoreArtifactOnMonster } from './artifact-score-core';
import { CpuArtifactScoreBackend } from './backends/cpu-artifact-score-backend';
import { WebGpuArtifactScoreBackend } from './backends/webgpu-artifact-score-backend';
import type { ArtifactScoreBackend } from './backends/artifact-score-backend';
import type {
  ArtifactMaximumScore, ArtifactScoreRequest, ArtifactScoreWorkerRequest, ArtifactScoreWorkerResponse,
} from './artifact-score-protocol';

let backend: ArtifactScoreBackend | undefined;
let backendPreference: boolean | undefined;

async function selectedBackend(preferWebGpu: boolean): Promise<ArtifactScoreBackend> {
  if (backend && backendPreference === preferWebGpu) return backend;
  backend?.dispose();
  backendPreference = preferWebGpu;
  if (preferWebGpu) {
    try {
      const gpu = new WebGpuArtifactScoreBackend();
      await gpu.initialize();
      backend = gpu;
      return backend;
    } catch {
      /* The response identifies the CPU backend, so a driver or browser fallback
         is observable to the interface instead of being a hidden decision. */
    }
  }
  const cpu = new CpuArtifactScoreBackend();
  await cpu.initialize();
  backend = cpu;
  return backend;
}

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
    });
  }
  return maxima;
}

self.onmessage = async (event: MessageEvent<ArtifactScoreWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  try {
    const startedAt = performance.now();
    let selected = await selectedBackend(message.preferWebGpu);
    let scores: Float32Array;
    try {
      scores = await selected.calculate(message.request);
    } catch {
      if (selected.type !== 'webgpu') throw new Error('Artifact scoring failed on the processor.');
      selected.dispose();
      selected = new CpuArtifactScoreBackend();
      await selected.initialize();
      backend = selected;
      scores = await selected.calculate(message.request);
    }
    const result: ArtifactScoreWorkerResponse = {
      type: 'result', requestId: message.requestId,
      result: {
        backend: selected.type,
        durationMs: performance.now() - startedAt,
        evaluatedPairs: message.request.artifacts.length * message.request.monsters.length,
        maxima: maximaFromScores(message.request, scores),
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
