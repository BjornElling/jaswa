import { describe, expect, it, vi } from 'vitest';

vi.mock('../../domain/runes/optimization/rune-optimization-work', () => ({ runeOptimizationWorkPool: () => ({ width: 2 }) }));
vi.mock('../../domain/runes/optimization/rune-optimization-problem', () => ({ figureIndex: () => 0 }));

const { optimizeRuneBuilds, stopRuneOptimization } = await import('./rune-optimization-client');
const { provideWorkerFactories } = await import('./worker-factories');

type Listener = (event: { data: unknown }) => void;
class SearchWorker {
  posted: Array<Record<string, unknown>> = [];
  terminated = false;
  private listeners = new Map<string, Listener[]>();
  addEventListener(type: string, listener: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  postMessage(message: Record<string, unknown>) { this.posted.push(message); }
  terminate() { this.terminated = true; }
  emit(type: string, data: unknown) { for (const listener of this.listeners.get(type) ?? []) listener({ data }); }
}

const build = (identity: string, value: number) => ({ identity, figures: [value], runeIds: [] });
const answer = (builds: ReturnType<typeof build>[]) => ({
  builds, complete: false, stoppedBy: 'user', combinations: 10, nodes: 5,
  report: { runes: 1 }, backend: { engine: 'processor' }, tieBreakers: [],
});

describe('rune optimization client', () => {
  it('keeps the builds other shares found when one share fails after Stop', async () => {
    const workers: SearchWorker[] = [];
    const create = () => { const worker = new SearchWorker(); workers.push(worker); return worker as unknown as Worker; };
    provideWorkerFactories({
      runeOptimization: create, runeOptimizationWork: create,
      artifactScore: create, craftRecommendation: create, runeAdvice: create, runeReference: create, speedIntervals: create,
    });
    const problem = { tieBreakers: [] } as never;
    const input = { requirements: { rankBy: 'spd' }, settings: { resultCount: 5 } } as never;
    const outcome = optimizeRuneBuilds(input, false, undefined, undefined, problem);
    expect(workers).toHaveLength(2);

    stopRuneOptimization();
    workers[0].emit('message', { type: 'result', requestId: 0, answer: answer([build('a', 9)]) });
    workers[1].emit('message', { type: 'error', requestId: 1, message: 'Out of memory' });

    const settled = await outcome;
    expect(settled.status).toBe('done');
    if (settled.status !== 'done') return;
    expect(settled.answer.builds.map((entry) => entry.identity)).toEqual(['a']);
    expect(settled.answer.complete).toBe(false);
    expect(workers).toHaveLength(2);
  });
});
