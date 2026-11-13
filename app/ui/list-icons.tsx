/* The marks beside an entry of a list the user orders by hand — Speed Tuning's
   teams and the monster priority list — so moving and removing read the same
   wherever an order is kept. */

export function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return <svg className="speed-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d={direction === 'up' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'} />
  </svg>;
}

export function RemoveIcon() {
  return <svg className="speed-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>;
}
