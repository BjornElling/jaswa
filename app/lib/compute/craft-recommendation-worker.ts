/// <reference lib="webworker" />
import { recommendRuneCraft } from '../rune-craft-recommendations';
import type { CraftRecommendationRequest } from '../rune-craft-recommendations';
import type { CraftRecommendationResponse } from './craft-recommendation-protocol';

self.onmessage = async (event: MessageEvent<CraftRecommendationRequest>) => {
  try {
    let reported = -1;
    const result = await recommendRuneCraft(event.data, (fraction) => {
      const percent = Math.floor(fraction * 100);
      if (percent !== reported) { self.postMessage({ type: 'progress', fraction } satisfies CraftRecommendationResponse); reported = percent; }
    });
    self.postMessage({ type: 'result', result, backend: result.backend } satisfies CraftRecommendationResponse);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The craft calculation failed.' } satisfies CraftRecommendationResponse);
  }
};
