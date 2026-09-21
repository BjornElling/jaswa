/** The circular arrows are the shared mark for a property changed in place. */
export function CircularArrowsMark({ label, className = '' }: { label: string; className?: string }) {
  return <svg className={`artifact-sub-mark artifact-sub-converted ${className}`.trim()} viewBox="0 0 16 16" role="img"
    aria-label={label}>
    <path d="M13 5.5A5.25 5.25 0 0 0 3.6 4L2.5 5.25" />
    <path d="M2.5 2.75v2.5H5" />
    <path d="M3 10.5A5.25 5.25 0 0 0 12.4 12l1.1-1.25" />
    <path d="M13.5 13.25v-2.5H11" />
  </svg>;
}

/** The game's permanent conversion lock needs a compact, readable marker. */
export function ConvertedArtifactMark({ position }: { position: number }) {
  return <CircularArrowsMark label={`Converted sub-property ${position + 1}; this slot can be converted again`} />;
}
