/* The globals a pure calculation may use, because a page, a worker and Node all
   provide them: a clock for time limits, a yield, a deep copy and random ids.
   `tsconfig.pure.json` checks `app/domain/` and `app/ingest/` against these and
   the language alone, so any other browser API there fails to compile — the
   browser is the platform's (`ARCHITECTURE-FROM-SCRATCH.md` §5). */
declare const performance: { now(): number };
declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(id: number | undefined): void;
declare function structuredClone<T>(value: T): T;
declare const crypto: { randomUUID(): string };
