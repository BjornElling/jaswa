/**
 * **One rule for the whole program: heavy work goes to the graphics card unless the
 * user switched it off or the card refused.**
 *
 * The rule used to be written out per calculation, and it drifted immediately. The
 * artifact scorer tried the card, fell back on any failure, and reported which one
 * answered. Rune Clean-up hard-coded `'cpu'` and said in a comment that it had no
 * card backend — true when it was written, and the kind of statement that stops being
 * true without anything failing. Everything else simply never asked.
 *
 * So the decision lives here, once, and a calculation states only two things: how the
 * processor does it, and how the card does it if it can. Whoever answers is reported
 * to the interface, because a silent fall back to the processor is a thing the user is
 * entitled to see — it is the difference between "your card is working" and "your card
 * is listed and doing nothing".
 *
 * ## Why not "GPU if available"
 *
 * Three states, not two. **Switched off** is the user's decision and is obeyed without
 * asking the card anything. **Refused** is the card's — no WebGPU, no adapter, a
 * rejected pass, a lost device — and is answered by the processor. Only the third
 * state uses the card. Collapsing the first two would make the setting a hint, and
 * collapsing the last two would make a driver problem look like a preference.
 *
 * ## Where a second implementation is allowed to exist
 *
 * A shader is a second implementation of arithmetic the processor also does, which
 * `AGENTS.md` §6 is otherwise firmly against — two implementations drift, and the
 * drift is silent. The bargain is that **a card backend must be able to prove itself
 * against the processor before its answers are used**, which is what `agrees` is for:
 * a calculation may hand over a small battery of cases whose answers it already knows,
 * and a card that gets one of them wrong is not used at all. It runs once per worker,
 * costs milliseconds, and turns the failure mode from "wrong numbers on screen" into
 * "the status line says Processor".
 */
import { sharedGpuContext } from './gpu/gpu-context';
import type { GpuContext } from './gpu/gpu-context';
import type { ComputeBackend } from './calculation-summary';

export type AcceleratedCalculation<TRequest, TResult> = {
  /** For the pipeline cache and for saying which calculation refused. */
  readonly name: string;
  /** The reference answer. Every result is this one's, or one checked against it. */
  cpu(request: TRequest): TResult | Promise<TResult>;
  /** The card's answer, where one exists. Throwing means "the processor, then". */
  gpu?(request: TRequest, context: GpuContext): Promise<TResult>;
  /**
   * Whether this card can be trusted with this calculation — run once per worker,
   * before any real answer is taken from it. A calculation without one is taking the
   * card on faith, which is a choice to make deliberately and write down.
   */
  agrees?(context: GpuContext): Promise<boolean>;
};

export type AcceleratedAnswer<TResult> = { result: TResult; backend: ComputeBackend };

/**
 * Which calculations this worker has already proved its card on.
 *
 * Keyed by the device as well as the calculation. A driver reset, a laptop switching
 * from discrete to integrated, a browser reclaiming a device: the next request opens
 * a **different** card, and evidence gathered on the last one says nothing about it.
 */
const proven = new Map<string, Promise<boolean>>();

export async function runAccelerated<TRequest, TResult>(
  calculation: AcceleratedCalculation<TRequest, TResult>,
  request: TRequest,
  preferGpu: boolean,
): Promise<AcceleratedAnswer<TResult>> {
  if (preferGpu && calculation.gpu) {
    const context = sharedGpuContext();
    try {
      if (await context.ready() && await trusted(calculation, context)) {
        return { result: await calculation.gpu(request, context), backend: 'webgpu' };
      }
    } catch {
      /* A card that refused this request is not a card that has stopped working, so
         nothing is torn down — the next request asks it again. The answer below is
         the processor's, and the caller reports that. */
    }
  }
  return { result: await calculation.cpu(request), backend: 'cpu' };
}

async function trusted<TRequest, TResult>(
  calculation: AcceleratedCalculation<TRequest, TResult>, context: GpuContext,
): Promise<boolean> {
  if (!calculation.agrees) return true;
  const key = `${calculation.name}#${context.generation}`;
  let answer = proven.get(key);
  if (!answer) {
    /* **A card that got an answer wrong and a battery that could not be run are not
       the same verdict.** The first is a fact about this card and is remembered for
       as long as it is this card. The second — a device lost mid-battery, a pass the
       driver dropped, an allocation that failed — is a fact about one moment, so the
       entry is dropped and the next request asks again. Remembering it would turn one
       unlucky instant into a card switched off for the life of the worker, which is
       the opposite of what this gate is for. */
    answer = calculation.agrees(context).catch(() => { proven.delete(key); return false; });
    proven.set(key, answer);
  }
  return answer;
}
