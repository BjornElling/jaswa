import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWriterCoordination } from './writer-coordination';

describe('writer coordination without an available lock', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([undefined, { request: async () => { throw new Error('Lock refused'); } }])(
    'preserves read access and never grants write access', async (locks) => {
      vi.stubGlobal('navigator', { locks });
      vi.stubGlobal('BroadcastChannel', undefined);
      const coordination = createWriterCoordination();
      expect(await coordination.ready()).toBe('reader');
      expect(coordination.isCoordinated()).toBe(false);
    },
  );
});
