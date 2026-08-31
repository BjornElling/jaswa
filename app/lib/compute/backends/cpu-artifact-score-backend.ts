import { calculateArtifactScoresCpu } from '../artifact-score-core';
import type { ArtifactScoreRequest } from '../artifact-score-protocol';
import type { ArtifactScoreBackend } from './artifact-score-backend';

/** The reference implementation used whenever WebGPU is unavailable. */
export class CpuArtifactScoreBackend implements ArtifactScoreBackend {
  readonly type = 'cpu' as const;

  async initialize(): Promise<void> {}

  async calculate(request: ArtifactScoreRequest): Promise<Float32Array> {
    return calculateArtifactScoresCpu(request);
  }

  dispose(): void {}
}
