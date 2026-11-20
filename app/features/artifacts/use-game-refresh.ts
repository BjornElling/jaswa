import { useEffect, useRef, useState } from 'react';
import { isCalculationCancelled } from '../../workspace/jobs/cancellable-worker';
import type { GameRecord } from '../../domain/account/game-record';

/**
 * Brings a held artifact answer up to date with the game (`ACCOUNT-TABLES.md`
 * §7).
 *
 * The user's own changes wait for Calculate; the game's do not. When an import
 * or a sync replaces the data a held answer was calculated from, `refresh`
 * re-scores what the change touched and returns the merged answer, which
 * replaces the held one only if nothing else has replaced it meanwhile. The held
 * answer stays on screen throughout.
 *
 * Shared by the three recommendation views so the rule cannot drift between
 * them. It never starts a first calculation (nothing is held), never runs beside
 * Calculate (`busy`), and never retries a failed update until the game moves
 * again — Calculate remains the way past a failure.
 */
export function useGameRefresh<Held extends { data: GameRecord }>({ held, data, busy, refresh, onRefreshed }: {
  /** The answer on screen, if it still answers the user's standards. */
  held: Held | undefined;
  data: GameRecord;
  busy: boolean;
  /** `undefined` when the change removed what the answer was about. */
  refresh: (held: Held, signal: AbortSignal) => Promise<Held | undefined>;
  onRefreshed: (from: Held, next: Held | undefined) => void;
}): 'current' | 'updating' | 'failed' {
  const [failedFor, setFailedFor] = useState<GameRecord | null>(null);
  /* The callbacks close over this render's data and settings. Held in a ref so
     the effect can call the current ones without re-running on every render. */
  const latest = useRef({ refresh, onRefreshed });
  useEffect(() => {
    latest.current = { refresh, onRefreshed };
  });

  useEffect(() => {
    if (held === undefined || held.data === data || busy || failedFor === data) return;
    const controller = new AbortController();
    /* A sync arrives in bursts; the short pause lets the last of them be the
       one answered rather than starting work for each. */
    const timer = window.setTimeout(() => {
      latest.current.refresh(held, controller.signal).then(
        (next) => { if (!controller.signal.aborted) latest.current.onRefreshed(held, next); },
        (failure) => { if (!controller.signal.aborted && !isCalculationCancelled(failure)) setFailedFor(data); },
      );
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [held, data, busy, failedFor]);

  if (held === undefined || held.data === data) return 'current';
  return failedFor === data ? 'failed' : 'updating';
}
