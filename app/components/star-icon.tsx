/** A stroked five-point star, sized by its caller's class and drawn in `currentColor`. */
export function StarIcon({ className = 'rune-star-icon', label }: { className?: string; label?: string }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"
    {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}>
    <path d="M8 1.6 9.9 5.5l4.3.6-3.1 3  .8 4.3L8 11.4l-3.9 2 .8-4.3-3.1-3 4.3-.6L8 1.6Z" />
  </svg>;
}
