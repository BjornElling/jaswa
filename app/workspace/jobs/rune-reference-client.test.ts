import { afterEach, describe, expect, it } from 'vitest';
import { referenceKey, referenceSampleSize } from '../../domain/runes/cleanup/rune-quality-reference';
import { defaultCraftCredit } from '../../domain/runes/craft/rune-craft-end-state';
import type { RuneReferenceWorkerRequest } from '../../domain/runes/cleanup/rune-reference-protocol';
import { clearAccountJobMemory } from './account-job-memory';
import { leaseRuneReferences } from './rune-reference-client';
import { provideWorkerFactories } from './worker-factories';

const piece = { slot: 1, stars: 6, main: 3 };
const request = (price: number) => {
  const prices = Float64Array.of(0, price);
  return { ...piece, prices, credit: defaultCraftCredit, key: referenceKey(piece, prices, defaultCraftCredit) };
};

class ReferenceWorker extends EventTarget {
  readonly requests: RuneReferenceWorkerRequest[] = [];
  terminated = false;
  postMessage(message: RuneReferenceWorkerRequest) { this.requests.push(message); }
  terminate() { this.terminated = true; }
  answer(length = referenceSampleSize) {
    const references = this.requests.at(-1)?.requests.map(({ key }) => ({ key, scores: new Float64Array(length) }));
    this.dispatchEvent(new MessageEvent('message', { data: { type: 'prepared', references } }));
  }
}

function factories(fail = false) {
  const workers: ReferenceWorker[] = [];
  const create = () => {
    if (fail) throw new Error('Cannot start reference worker');
    const worker = new ReferenceWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  };
  provideWorkerFactories({ artifactScore: create, craftRecommendation: create, runeAdvice: create,
    runeReference: create, runeOptimization: create, runeOptimizationWork: create });
  return workers;
}

afterEach(clearAccountJobMemory);

describe('shared rune quality preparation', () => {
  it('coalesces overlapping keys, releases just one caller and reuses both completed scores', async () => {
    const workers = factories();
    const a = request(1);
    const b = request(2);
    const first = leaseRuneReferences([a]);
    const later = leaseRuneReferences([a, b]);
    const cancelled = expect(first.ready).rejects.toThrow('were not prepared');
    first.release();
    expect(workers.flatMap((worker) => worker.requests.flatMap((batch) => batch.requests.map(({ key }) => key))))
      .toEqual([a.key, b.key]);
    expect(workers.some(({ terminated }) => terminated)).toBe(false);

    workers.forEach((worker) => worker.answer());
    await cancelled;
    expect([...(await later.ready).keys()]).toEqual([a.key, b.key]);
    later.release();
    const warm = leaseRuneReferences([b, a]);
    expect((await warm.ready).size).toBe(2);
    expect(workers).toHaveLength(2);
    warm.release();
  });

  it('discards late replies after reset and retries failed preparation', async () => {
    const workers = factories();
    const a = request(1);
    const unfinished = leaseRuneReferences([a]);
    const reset = expect(unfinished.ready).rejects.toThrow('were not prepared');
    clearAccountJobMemory();
    workers[0].answer();
    await reset;
    unfinished.release();

    const invalid = leaseRuneReferences([a]);
    workers[1].answer(1);
    await expect(invalid.ready).rejects.toThrow('were not prepared');
    invalid.release();

    factories(true);
    const failed = leaseRuneReferences([a]);
    await expect(failed.ready).rejects.toThrow('were not prepared');
    failed.release();

    const fresh = factories();
    const retry = leaseRuneReferences([a]);
    fresh[0].answer();
    expect((await retry.ready).size).toBe(1);
    retry.release();
  });
});
