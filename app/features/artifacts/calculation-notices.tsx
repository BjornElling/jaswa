import { CalculationNote } from '../../ui/calculation-actions';
import { calculationOutdated } from '../../ui/calculation-outdated';

/**
 * Where an artifact view says its held answer no longer fits the user's
 * standards (`ACCOUNT-TABLES.md` §7). The line is always in the layout and only
 * shown or hidden, so the results beneath it never move when it appears.
 */
export function OutdatedNotice({ shown }: { shown: boolean }) {
  return <p className="notice warning" role="status" style={{ visibility: shown ? 'visible' : 'hidden' }}
    aria-hidden={!shown}>{calculationOutdated.title} {calculationOutdated.detail}</p>;
}

/** The report line while a change in the game is merged into a held answer, or after that failed. */
export function GameRefreshNote({ state }: { state: 'updating' | 'failed' }) {
  return state === 'updating'
    ? <CalculationNote tone="busy">Catching up with the game…</CalculationNote>
    : <CalculationNote tone="failed">JASWA could not score the game’s latest changes. Calculate to try again.</CalculationNote>;
}
