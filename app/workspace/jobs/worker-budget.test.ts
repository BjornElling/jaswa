import { describe, expect, it } from 'vitest';
import { budgetedWorker, createWorkerBudget } from './worker-budget';
import { askCraftRecommendations } from './craft-recommendation-client';

class FakeWorker extends EventTarget {
  messages: unknown[] = [];
  terminated = false;
  postMessage(value: unknown) { this.messages.push(value); }
  terminate() { this.terminated = true; }
  reply(type = 'result') { this.dispatchEvent(new MessageEvent('message', { data: { type } })); }
}

describe('shared worker capacity', () => {
  it('answers an empty craft question without starting a worker', async () => {
    const job = askCraftRecommendations([], () => { throw new Error('No work has progress.'); });
    expect(await job.result).toEqual([]);
    job.cancel();
  });
  it('bounds simultaneous jobs and lets foreground work precede queued reference preparation', () => {
    const budget = createWorkerBudget(2);
    const native: FakeWorker[] = [];
    const create = () => { const worker = new FakeWorker(); native.push(worker); return worker as unknown as Worker; };
    const background = Array.from({ length: 4 }, () => budgetedWorker(create, budget, true));
    background.forEach((worker) => worker.postMessage({ pieceId: 1 }));
    const foreground = budgetedWorker(create, budget);
    foreground.postMessage({ type: 'calculate' });
    expect(native).toHaveLength(2);
    expect(budget.active()).toBe(2);
    native[0].reply();
    expect(native).toHaveLength(3);
    expect(native[2].messages).toEqual([{ type: 'calculate' }]);
    expect(budget.active()).toBe(2);
    background[2].terminate();
    foreground.terminate();
    expect(native).toHaveLength(4);
    background.forEach((worker) => worker.terminate());
    expect(budget.active()).toBe(0);
  });

  it('reserves one extra slot for an interactive request without admitting extra background work', () => {
    const budget = createWorkerBudget(2, true);
    const order: string[] = [];
    const release = new Map<string, () => void>();
    const queue = (name: string, interactive = false) => budget.request((done) => {
      order.push(name);
      release.set(name, done);
    }, !interactive, interactive);
    queue('a');
    queue('b');
    queue('queued background');
    queue('overlay', true);
    queue('second overlay', true);

    expect(order).toEqual(['a', 'b', 'overlay']);
    expect(budget.active()).toBe(3);
    release.get('overlay')?.();
    expect(order.at(-1)).toBe('second overlay');
    release.get('b')?.();
    expect(order).not.toContain('queued background');
    release.get('second overlay')?.();
    expect(order.at(-1)).toBe('queued background');
  });

  it('releases a warm worker between requests and keeps cancellation out of the queue', () => {
    const budget = createWorkerBudget(1);
    const first = new FakeWorker();
    const a = budgetedWorker(() => first as unknown as Worker, budget);
    const b = budgetedWorker(() => new FakeWorker() as unknown as Worker, budget);
    a.postMessage({ type: 'calculate' });
    b.postMessage({ type: 'calculate' });
    b.terminate();
    first.reply();
    expect(budget.active()).toBe(0);
    a.postMessage({ type: 'bar', value: 12 });
    expect(budget.active()).toBe(0);
    a.postMessage({ type: 'calculate' });
    expect(budget.active()).toBe(1);
    expect(first.messages).toHaveLength(3);
    a.terminate();
    expect(budget.active()).toBe(0);
  });

  it('returns capacity when an additional request cannot be posted to a busy worker', async () => {
    const budget = createWorkerBudget(1);
    const native = new FakeWorker();
    const worker = budgetedWorker(() => native as unknown as Worker, budget);
    worker.postMessage({ type: 'calculate' });
    native.postMessage = () => { throw new Error('Cannot clone this request.'); };
    const failure = new Promise<void>((resolve) => worker.addEventListener('error', () => resolve(), { once: true }));
    worker.postMessage({ type: 'calculate' });
    await failure;
    expect(budget.active()).toBe(0);
    expect(native.terminated).toBe(true);
  });
});
