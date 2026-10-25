import type { CraftRecommendations } from '../rune-craft-recommendations';
import type { CalculationBackend } from './calculation-summary';

export type CraftRecommendationResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; result: CraftRecommendations; backend: CalculationBackend }
  | { type: 'error'; message: string };
