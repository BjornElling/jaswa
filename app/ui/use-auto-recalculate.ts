import { useEffect, useRef } from 'react';
import type { ArtifactSettings } from '../domain/model';

/**
 * Re-runs a recommendation view's calculation when its inputs move underneath
 * an existing result and the user has asked for that (`ACCOUNT-TABLES.md`
 * §7).
 *
 * Shared by the three recommendation views so the rule cannot drift between
 * them: each already decides staleness the same way — the key a fresh
 * calculation would use against the key the held one was calculated for — and
 * what to do about it should be one decision as well.
 *
 * Three things it deliberately does not do:
 *
 * - It never starts the *first* calculation. Nothing is stale until a result
 *   exists, and an empty view auto-filling itself on arrival would spend a
 *   whole-library calculation nobody requested — the same objection that makes
 *   `manual` the default.
 * - It never re-runs while one is in flight, so a settings slider dragged
 *   through five stops queues no work; the run in progress finishes against the
 *   old key, is stale on arrival, and this fires once for the value that stuck.
 * - It never retries a failed run. An error clears the held result, so nothing
 *   is stale and the effect has nothing to chase — which is what keeps a
 *   calculation that fails on its inputs from failing in a loop.
 */
export function useAutoRecalculate({ mode, stale, calculating, calculate }: {
  mode: ArtifactSettings['recalculate'];
  /**
   * Whether a result is held *and* was calculated for inputs that have since
   * moved. False both when nothing has been calculated yet and when what is on
   * screen is already current, which are the two states with nothing to do.
   */
  stale: boolean;
  calculating: boolean;
  calculate: () => void;
}) {
  /* The callback closes over this render's data and settings, and is a new
     function every render. Held in a ref so the effect below can call the
     current one without listing it as a dependency and re-running on every
     keystroke elsewhere on the page. Written in an effect of its own rather
     than during render, and declared first so it has already committed by the
     time the effect below reads it. */
  const latest = useRef(calculate);
  useEffect(() => {
    latest.current = calculate;
  });

  useEffect(() => {
    if (mode !== 'on-change' || !stale || calculating) return;
    latest.current();
    /* `stale` is the whole trigger: it turns true exactly when a held result
       stopped answering the current question, and false again the moment a
       fresh one lands — so a successful run cannot re-arm this. */
  }, [mode, stale, calculating]);
}
