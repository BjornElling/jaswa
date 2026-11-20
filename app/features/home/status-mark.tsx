import type { AccelerationState } from '../../workspace/acceleration-status';

/* The ring Home draws for the helper and Settings for the graphics card: one
   mark, so a connection that is ready reads alike in both places. */
export function StatusMark({ state }: { state: AccelerationState | 'restart' }) {
  /* An empty ring while the adapter is being asked for: at this moment JASWA
     has no verdict, and any of the three marks would be a claim. */
  const path = state === 'ready' ? 'M13 22.5 19.5 29 31 15'
    : state === 'disabled' || state === 'restart' ? 'M22 12v13M22 30.5v.5'
      : state === 'unavailable' ? 'M14 14 30 30M30 14 14 30'
        : '';
  return <span className={`acceleration-mark ${state}`} aria-hidden="true">
    <svg viewBox="0 0 44 44" width="44" height="44" fill="none" stroke="currentColor"
      strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="22" cy="22" r="19" strokeWidth="2" opacity=".45" />
      {path && <path d={path} />}
    </svg>
  </span>;
}
