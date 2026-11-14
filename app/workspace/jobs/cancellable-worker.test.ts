import { describe, expect, it } from 'vitest';
import { CalculationCancelled, cancellableWorker } from './cancellable-worker';

class TestWorker {
  messages: Array<{ requestId: number }> = [];
  terminated = false;
  private listeners = new Map<string, Array<(event: never) => void>>();

  addEventListener(type: string, listener: (event: never) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  postMessage(message: { requestId: number }) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
}

describe('cancellable worker', () => {
  it('routes out-of-order answers to their own requests', async () => {
    const worker = new TestWorker();
    const ask = cancellableWorker<number>(() => worker as unknown as Worker, 'start failed');
    const first = ask({ value: 1 });
    const second = ask({ value: 2 });
    worker.emit('message', { data: { type: 'result', requestId: worker.messages[1].requestId, result: 20 } });
    worker.emit('message', { data: { type: 'result', requestId: worker.messages[0].requestId, result: 10 } });
    await expect(first).resolves.toBe(10);
    await expect(second).resolves.toBe(20);
  });

  it('restarts the other request when one consumer cancels', async () => {
    const workers: TestWorker[] = [];
    const ask = cancellableWorker<number>(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    }, 'start failed');
    const controller = new AbortController();
    const first = ask({}, controller.signal);
    const second = ask({});
    controller.abort();
    await expect(first).rejects.toBeInstanceOf(CalculationCancelled);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].messages).toHaveLength(1);
    workers[0].emit('message', { data: { type: 'result', requestId: workers[0].messages[1].requestId, result: 1 } });
    workers[1].emit('message', { data: { type: 'result', requestId: workers[1].messages[0].requestId, result: 2 } });
    await expect(second).resolves.toBe(2);
  });

  it('costs one fresh worker when several requests share the cancelled signal', async () => {
    const workers: TestWorker[] = [];
    const ask = cancellableWorker<number>(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    }, 'start failed');
    const controller = new AbortController();
    const batch = [ask({}, controller.signal), ask({}, controller.signal), ask({}, controller.signal)];
    const survivor = ask({});
    controller.abort();
    const afterCancel = ask({});
    for (const request of batch) await expect(request).rejects.toBeInstanceOf(CalculationCancelled);
    expect(workers).toHaveLength(2);
    expect(workers[1].messages).toHaveLength(2);
    workers[1].emit('message', { data: { type: 'result', requestId: workers[1].messages[0].requestId, result: 7 } });
    workers[1].emit('message', { data: { type: 'result', requestId: workers[1].messages[1].requestId, result: 8 } });
    await expect(afterCancel).resolves.toBe(7);
    await expect(survivor).resolves.toBe(8);
  });

  it('fails pending requests when a worker dies and starts a fresh one later', async () => {
    const workers: TestWorker[] = [];
    const ask = cancellableWorker<number>(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    }, 'start failed');
    const first = ask({});
    const second = ask({});
    workers[0].emit('error', {});
    await expect(first).rejects.toThrow('start failed');
    await expect(second).rejects.toThrow('start failed');
    const third = ask({});
    workers[1].emit('message', { data: { type: 'result', requestId: workers[1].messages[0].requestId, result: 3 } });
    await expect(third).resolves.toBe(3);
  });
});
