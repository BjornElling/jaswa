export type SpeedVerdict = 'good' | 'bad' | 'none';

/* A tick, a cross or a dash, large enough to be read down a column of lines
   before any name is: the one question the page is opened to answer. */
export function SpeedVerdictMark({ state, small = false }: { state: SpeedVerdict; small?: boolean }) {
  const path = state === 'good' ? 'M3.5 8.5l3 3 6-7' : state === 'bad' ? 'M4 4l8 8M12 4l-8 8' : 'M4 8h8';
  return <span className={small ? 'speed-summary-mark speed-summary-mark-small' : 'speed-summary-mark'} data-state={state} aria-hidden="true">
    <svg viewBox="0 0 16 16"><path d={path} /></svg>
  </span>;
}
