import styles from './unrefined-artifact-mark.module.css';

export function UnrefinedArtifactMark({ unrefined }: { unrefined: boolean }) {
  return <span className={unrefined ? styles.mark : `${styles.mark} ${styles.empty}`}
    role={unrefined ? 'img' : undefined}
    aria-label={unrefined ? 'Unrefined artifact' : undefined}
    title={unrefined ? 'Unrefined artifact — Refine it in Summoners War to finish its power-ups.' : undefined}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.25v7.5M5.25 7 8 9.75 10.75 7M3 12.5h10" /></svg>
  </span>;
}
