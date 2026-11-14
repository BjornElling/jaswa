import { describe, expect, it } from 'vitest';
import { CalculationCancelled } from './cancellable-worker';
import { createJobRuntime } from './job-runtime';

class TestWorker {
  messages: Array<{ requestId: number; value: number }> = [];
  terminated = false;
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: { requestId: number; value: number }) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(type: string, event: unknown) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
}

describe('job runtime', () => {
  it('lets the latest question win and honours the caller signal', async () => {
    const workers: TestWorker[] = [];
    const runtime = createJobRuntime<{ value: number }, number>(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    }, 'start failed');
    const first = runtime.run({ value: 1 });
    const second = runtime.run({ value: 2 });
    await expect(first).rejects.toBeInstanceOf(CalculationCancelled);
    const live = workers.at(-1)!;
    live.emit('message', { data: { type: 'result', requestId: live.messages.at(-1)!.requestId, result: 20 } });
    await expect(second).resolves.toBe(20);

    const controller = new AbortController();
    const third = runtime.run({ value: 3 }, controller.signal);
    controller.abort();
    await expect(third).rejects.toBeInstanceOf(CalculationCancelled);
  });

  it('keeps independent fan-out requests alive when concurrency is explicit', async () => {
    const worker = new TestWorker();
    const runtime = createJobRuntime<{ value: number }, number>(() => worker as unknown as Worker, 'start failed', { allowConcurrent: true });
    const first = runtime.run({ value: 1 });
    const second = runtime.run({ value: 2 });
    worker.emit('message', { data: { type: 'result', requestId: worker.messages[1].requestId, result: 20 } });
    worker.emit('message', { data: { type: 'result', requestId: worker.messages[0].requestId, result: 10 } });
    await expect(first).resolves.toBe(10);
    await expect(second).resolves.toBe(20);
  });
});
