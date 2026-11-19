/**
 * What every calculating panel says when a setting it read has changed since its
 * last answer (`AGENTS.md` §5, *Only Calculate calculates*). One wording, so the
 * same state reads the same on every page; the held answer comes back on its own
 * when the setting is changed back.
 */
export const calculationOutdated = {
  title: 'Something changed since the last calculation.',
  detail: 'Press Calculate to catch up, or change it back to see the last results.',
} as const;
