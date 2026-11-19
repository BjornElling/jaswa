import { workerFactories } from './worker-factories';
import { registerAccountJobReset } from './account-job-memory';
import { leaseRuneReferences } from './rune-reference-client';
import { planQualityReferences } from '../../domain/runes/cleanup/rune-cleanup-advice';
import { runeScaleStars } from '../../domain/runes/rune-substat-weights';
import { referencePieceKey, retainedReferenceCount } from '../../domain/runes/cleanup/rune-quality-reference';
import type { QualityReference } from '../../domain/runes/cleanup/rune-quality-reference';
import { combineCalculationBackends } from '../../domain/shared/calculation-summary';
import type {
  RuneAdviceOutcome, RuneAdviceRequest, RuneAdviceWorkerRequest, RuneAdviceWorkerResponse,
} from '../../domain/runes/cleanup/rune-advice-protocol';

export type RuneAdviceChannel = {
  calculate: (request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
    onPreparation?: (fraction: number | null) => void) => Promise<RuneAdviceOutcome>;
  cancel: () => void;
};

type AdvicePartition = { runes: RuneAdviceRequest['runes'][number][]; pieces: Set<string>; work: number };

function partitionRunes(runes: RuneAdviceRequest['runes'], statisticsReferences?: ReadonlyMap<string, QualityReference>): AdvicePartition[] {
  const referenceCounts = new Map<string, number>();
  for (const key of statisticsReferences?.keys() ?? []) {
    const piece = key.slice(0, key.lastIndexOf('|'));
    referenceCounts.set(piece, (referenceCounts.get(piece) ?? 0) + 1);
  }
  const pieces = new Map<string, AdvicePartition>();
  let unfinished = 0;
  for (const rune of runes) {
    const key = referencePieceKey({ slot: rune.slot, stars: runeScaleStars, main: rune.mainStatId });
    const piece = pieces.get(key) ?? { runes: [], pieces: new Set([key]), work: 0 };
    piece.runes.push(rune);
    if (rune.level < 12) unfinished += 1;
    const work = rune.level < 12 ? 1 + (12 - rune.level) * 4 : 1;
    piece.work += work * (referenceCounts.get(key) ?? 1);
    pieces.set(key, piece);
  }
  // Each piece belongs to one worker so a full reference array crosses the thread boundary once.
  const cores = Math.max(1, (globalThis.navigator?.hardwareConcurrency || 4) - 1);
  const count = unfinished >= 48 ? Math.max(1, Math.min(8, cores, pieces.size)) : 1;
  const partitions: AdvicePartition[] = Array.from({ length: count }, () => ({ runes: [], pieces: new Set(), work: 0 }));
  for (const piece of [...pieces.values()].sort((left, right) => right.work - left.work)) {
    const partition = partitions.reduce((lightest, next) => next.work < lightest.work ? next : lightest);
    partition.runes.push(...piece.runes);
    for (const key of piece.pieces) partition.pieces.add(key);
    partition.work += piece.work;
  }
  return partitions;
}

function referencesFor(partitions: readonly AdvicePartition[], references: ReadonlyMap<string, QualityReference>) {
  const buffers = partitions.map(() => new Map<string, QualityReference>());
  const owner = new Map(partitions.flatMap(({ pieces }, index) => [...pieces].map((piece) => [piece, index] as const)));
  for (const [key, reference] of references) {
    const piece = key.slice(0, key.lastIndexOf('|'));
    const index = owner.get(piece);
    if (index === undefined) throw new Error('A rune reference has no calculation partition.');
    buffers[index].set(key, reference);
  }
  return buffers;
}

/** Each caller owns cancellation of its advice workers while sharing preparation leases. */
export function runeAdviceChannel(): RuneAdviceChannel {
  const workers: Worker[] = [];
  let active: (() => void) | undefined;
  let nextRequestId = 1;

  function calculate(request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
    onPreparation?: (fraction: number | null) => void): Promise<RuneAdviceOutcome> {
    const startedAt = performance.now();
    const requestId = nextRequestId++;
    const { runes, roles, settings, base } = request;
    let lease: ReturnType<typeof leaseRuneReferences> | undefined;
    try {
      const references = planQualityReferences(runes, roles, base, settings);
      if (references.length <= retainedReferenceCount) lease = leaseRuneReferences(references, onPreparation, request.explain);
    } catch {
      active?.();
      return Promise.resolve({ status: 'failed', message: 'JASWA could not plan the rune quality references.' });
    }
    active?.();

    return new Promise<RuneAdviceOutcome>((resolve) => {
      const listeners: (() => void)[] = [];
      const running = new Set<number>();
      const stop = () => finish({ status: 'superseded' });
      const finish = (outcome: RuneAdviceOutcome) => {
        if (active !== stop) return;
        active = undefined;
        for (const detach of listeners) detach();
        if (outcome.status !== 'done') {
          for (const index of running) {
            workers[index].terminate();
            delete workers[index];
          }
        }
        lease?.release();
        resolve(outcome);
      };

      active = stop;
      void (lease?.ready ?? Promise.resolve(null)).then((references) => {
        if (active !== stop) return;
        const partitions = partitionRunes(runes, request.reuseOutcomeScores ? references ?? undefined : undefined);
        const buffers = references ? referencesFor(partitions, references) : null;
        const fractions = partitions.map(() => 0);
        const preparation = partitions.map(() => 0);
        const preparing = new Set(partitions.map((_, index) => index));
        if (!buffers) onPreparation?.(0);
        const outcomes = new Map<number, Extract<RuneAdviceWorkerResponse, { type: 'result' }>>();
        const totalWork = partitions.reduce((sum, partition) => sum + partition.work, 0);
        const fail = () => finish({ status: 'failed', message: 'JASWA could not complete its rune calculation.' });

        partitions.forEach((partition, index) => {
          if (active !== stop) return;
          const worker = workers[index] ?? (workers[index] = workerFactories().runeAdvice(request.explain));
          const onMessage = ({ data }: MessageEvent<RuneAdviceWorkerResponse>) => {
            if (active !== stop || data.requestId !== requestId) return;
            if (data.type === 'preparation') {
              preparation[index] = data.fraction ?? 1;
              if (data.fraction === null) preparing.delete(index);
              onPreparation?.(preparing.size ? preparation.reduce((sum, value) => sum + value, 0) / preparation.length : null);
            } else if (data.type === 'progress') {
              fractions[index] = data.fraction;
              if (!buffers && preparing.size) return;
              onProgress?.(totalWork === 0 ? 1 : fractions.reduce(
                (sum, fraction, at) => sum + fraction * partitions[at].work, 0,
              ) / totalWork);
            } else if (data.type === 'error') fail();
            else {
              running.delete(index);
              outcomes.set(index, data);
              if (outcomes.size !== partitions.length) return;
              const byId = new Map([...outcomes.values()].flatMap(({ advice }) => [...advice]));
              const advice = new Map(runes.map((rune) => [rune.id, byId.get(rune.id)!]));
              if ([...advice.values()].some((answer) => !answer)) { fail(); return; }
              finish({ status: 'done', advice, durationMs: performance.now() - startedAt,
                backend: combineCalculationBackends([...outcomes.values()].map(({ backend }) => backend)) });
            }
          };
          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', fail, { once: true });
          listeners.push(() => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', fail);
          });
          running.add(index);
          const message: RuneAdviceWorkerRequest = {
            type: 'calculate', requestId, request: { ...request, runes: partition.runes }, references: buffers?.[index] ?? null,
          };
          worker.postMessage(message);
        });
      }).catch(() => finish({ status: 'failed', message: 'JASWA could not prepare the rune calculation.' }));
    });
  }

  return { calculate, cancel: () => active?.() };
}

const cleanupChannel = runeAdviceChannel();
export function calculateRuneAdvice(request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
  onPreparation?: (fraction: number | null) => void): Promise<RuneAdviceOutcome> {
  return cleanupChannel.calculate(request, onProgress, onPreparation);
}
export const cancelRuneAdvice = cleanupChannel.cancel;
registerAccountJobReset(cancelRuneAdvice);
