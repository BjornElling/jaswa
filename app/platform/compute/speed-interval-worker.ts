/// <reference lib="webworker" />

import { readSpeedIntervals } from '../../domain/speed/speed-tuning-intervals';
import type { SpeedIntervalSearch } from '../../domain/speed/speed-tuning-intervals';

self.onmessage = ({ data: { requestId, search } }: MessageEvent<{ requestId: number; search: SpeedIntervalSearch }>) => {
  try {
    self.postMessage({ requestId, type: 'result', result: readSpeedIntervals(search) });
  } catch (error) {
    self.postMessage({ requestId, type: 'error', message: error instanceof Error ? error.message : 'Speed intervals could not be calculated.' });
  }
};
