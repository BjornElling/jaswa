/**
 * Rune Optimization's search, on whichever engine the user's setting allows.
 *
 * Thin on purpose, like `rune-chance-engine.ts`: the decision of *which* engine
 * belongs to `accelerated-calculation.ts` and the arithmetic to
 * `rune-optimization-search.ts`. What is left is the one statement tying them
 * together.
 *
 * **There is no card half yet, and that is a recorded decision, not an omission**
 * (`RUNE-OPTIMIZATION.md` §7). A branch-and-bound search is a chain of decisions —
 * every node asks whether to go on — which is precisely what
 * `HARDWARE-ACCELERATION.md` §2 keeps on the processor. The part a card can take is
 * the bottom of the tree: for a batch of four-slot prefixes, the full cross product
 * of the last two slots, returning each prefix's best few builds. That needs a shader,
 * its layout module and an agreement battery, and no browser this repository drives
 * can run one. Until it exists, the status line says `Processor`, which is true.
 */
import { searchRuneBuilds } from '../rune-optimization-search';
import type { SearchOutcome } from '../rune-optimization-search';
import type { RuneOptimizationProblem } from '../rune-optimization-problem';
import { runAccelerated } from './accelerated-calculation';
import type { AcceleratedCalculation } from './accelerated-calculation';
import type { CalculationBackend } from './calculation-summary';

type SearchRequest = {
  problem: RuneOptimizationProblem;
  part: number;
  parts: number;
  onProgress?: (fraction: number) => void;
};

const runeOptimizationSearch: AcceleratedCalculation<SearchRequest, SearchOutcome> = {
  name: 'rune-optimization',
  cpu: ({ problem, part, parts, onProgress }) => searchRuneBuilds(problem, part, parts, onProgress),
};

export async function searchRuneBuildsAccelerated(
  request: SearchRequest, preferWebGpu: boolean,
): Promise<{ outcome: SearchOutcome; backend: CalculationBackend }> {
  const answer = await runAccelerated(runeOptimizationSearch, request, preferWebGpu);
  return { outcome: answer.result, backend: answer.backend };
}
