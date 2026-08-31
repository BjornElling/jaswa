import type { ArtifactScoreRequest } from '../artifact-score-protocol';

/** The worker owns backend selection; callers only request one score matrix. */
export interface ArtifactScoreBackend {
  readonly type: 'cpu' | 'webgpu';
  initialize(): Promise<void>;
  calculate(request: ArtifactScoreRequest): Promise<Float32Array>;
  dispose(): void;
}
