import { useEffect, useMemo, useState } from 'react';
import { runeAdviceChannel } from '../../platform/compute/rune-advice-client';
import { rememberedRuneAdviceFor, rememberRuneAdvice } from '../../platform/compute/rune-advice-memory';
import type { RuneAdviceInputs } from '../../platform/compute/rune-advice-memory';
import { calculatedRuneVerdict } from '../../domain/runes/cleanup/rune-cleanup-advice';
import type { RuneAdvice } from '../../domain/runes/cleanup/rune-cleanup-advice';
import { runeCalculationKey } from '../../domain/runes/rune-calculation-inputs';
import type { ReferenceStats } from '../../domain/reference/rune-reference-stats';
import type { Rune } from '../../domain/runes/runes';

/** Which runes Rune Clean-up's own calculation keeps, or how far it is from saying. */
export type RuneKeepers =
  | { state: 'off' }
  /**
   * `calibration` is how far through Clean-up's one-time calibration, or `null` once
   * it is over. `previous` is the last answer for these same inputs, so a live sync
   * narrows by what was known a moment ago instead of emptying the page while it asks.
   */
  | { state: 'pending'; progress: number; calibration: number | null; previous: ReadonlySet<string> | null }
  | { state: 'failed'; message: string }
  | { state: 'ready'; keep: ReadonlySet<string> };

/** Its own channel, so asking here never supersedes Rune Clean-up's table or a rune overlay. */
const keeperChannel = runeAdviceChannel();

function keepersOf(advice: ReadonlyMap<string, RuneAdvice>): ReadonlySet<string> {
  return new Set([...advice].filter(([, found]) => calculatedRuneVerdict(found) === 'keep').map(([id]) => id));
}

/**
 * The runes whose calculated verdict is Keep, asked only while `enabled`.
 *
 * Rune Clean-up's newest answers are read first, so a box the table has already
 * judged costs nothing here; only the runes it has not judged with these inputs
 * go to the worker, and their answers are remembered for the table and the overlay
 * in turn. The sell safeguards are read past (`calculatedRuneVerdict`): a rune kept
 * only because the user protects it is not one the calculation keeps.
 */
export function useRuneKeepers({ enabled, runes, inputs, base, hardwareAcceleration }: {
  enabled: boolean; runes: readonly Rune[]; inputs: RuneAdviceInputs;
  base: ReadonlyMap<string, ReferenceStats> | null; hardwareAcceleration: boolean;
}): RuneKeepers {
  const { roles, settings } = inputs;
  const key = useMemo(() => runeCalculationKey({ roles, settings, base }), [roles, settings, base]);
  const [answer, setAnswer] = useState<{ key: string; runes: readonly Rune[]; keepers: RuneKeepers } | null>(null);
  const [lastReady, setLastReady] = useState<{ key: string; keep: ReadonlySet<string> } | null>(null);
  const judgeable = base !== null && roles.length > 0;
  useEffect(() => {
    if (!enabled || base === null || roles.length === 0) return undefined;
    const known = rememberedRuneAdviceFor(inputs, runes);
    const unknown = runes.filter((rune) => !known.has(rune.id));
    let current = true;
    const settle = (keepers: RuneKeepers) => {
      if (!current) return;
      setAnswer({ key, runes, keepers });
      if (keepers.state === 'ready') setLastReady({ key, keep: keepers.keep });
    };
    if (unknown.length === 0) {
      /* Settled in a microtask like an asked answer, so the effect never sets state as it runs. */
      void Promise.resolve().then(() => settle({ state: 'ready', keep: keepersOf(known) }));
    } else {
      /* Both reports land in one state, so a progress tick never hides a calibration still running. */
      let calibration: number | null = null;
      let progress = 0;
      void keeperChannel.calculate({ runes: unknown, roles, settings, base, preferWebGpu: hardwareAcceleration },
        (fraction) => { progress = fraction; settle({ state: 'pending', progress, calibration, previous: null }); },
        (fraction) => { calibration = fraction; settle({ state: 'pending', progress, calibration, previous: null }); })
        .then((outcome) => {
          if (outcome.status === 'superseded') return;
          if (outcome.status === 'failed') { settle({ state: 'failed', message: outcome.message }); return; }
          rememberRuneAdvice(inputs, unknown, outcome.advice);
          settle({ state: 'ready', keep: keepersOf(new Map([...known, ...outcome.advice])) });
        });
    }
    return () => { current = false; if (unknown.length > 0) keeperChannel.cancel(); };
  }, [enabled, key, runes, inputs, roles, settings, base, hardwareAcceleration]);
  if (!enabled) return { state: 'off' };
  if (!judgeable) return { state: 'failed', message: 'Rune Clean-up cannot judge these runes yet.' };
  const keepers: RuneKeepers = answer?.key === key && answer.runes === runes ? answer.keepers
    : { state: 'pending', progress: 0, calibration: null, previous: null };
  return keepers.state === 'pending' ? { ...keepers, previous: lastReady?.key === key ? lastReady.keep : null } : keepers;
}
