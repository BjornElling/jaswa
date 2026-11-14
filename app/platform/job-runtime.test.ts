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
  it('holds the last result and makes cancellation observable', async () => {
    const workers: TestWorker[] = [];
    const runtime = createJobRuntime<{ value: number }, number>(() => {
      const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker;
    }, 'start failed');
    const first = runtime.run({ value: 1 });
    workers[0].emit('message', { data: { type: 'result', requestId: workers[0].messages[0].requestId, result: 7 } });
    await expect(first).resolves.toBe(7);
    expect(runtime.getState()).toMatchObject({ activity: 'idle', result: 7, progress: 1 });

    const second = runtime.run({ value: 2 });
    runtime.cancel();
    await expect(second).rejects.toBeInstanceOf(CalculationCancelled);
    expect(runtime.getState()).toMatchObject({ activity: 'stopped', result: 7, error: null });
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
    expect(runtime.getState().activity).toBe('idle');
  });
});
