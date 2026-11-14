const resets = new Set<() => void>();

/** Clients register when loaded; the store must not eagerly load every algorithm
 * and reference dataset merely to release caches it has never used. */
export function registerAccountJobReset(reset: () => void): void { resets.add(reset); }

/** Account replacement releases answers and active account-wide work. Navigation
 * and another revision of the same known account retain mathematical reuse. */
export function clearAccountJobMemory(): void {
  for (const reset of resets) reset();
}
