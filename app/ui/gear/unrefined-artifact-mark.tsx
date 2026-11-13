import styles from './unrefined-artifact-mark.module.css';

export function UnrefinedArtifactMark({ unrefined }: { unrefined: boolean }) {
  if (!unrefined) return null;
  return <span className={styles.mark}
    role="img"
    aria-label="Unrefined artifact"
    title="Unrefined artifact">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.4 1.6 13.6h12.8L8 2.4Z" />
      <path d="M8 6.7v3" className={styles.bang} />
      <path d="M8 11.9h.01" className={styles.bang} />
    </svg>
  </span>;
}
