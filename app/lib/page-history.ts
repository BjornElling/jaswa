import { useCallback, useEffect, useRef } from 'react';

/**
 * The page the user is on, as an entry in the browser's history.
 *
 * Every page change — the rail, or a way across such as Presets' Optimize —
 * pushes an entry, so the browser's Back, and the mouse's back button with it,
 * returns to the page the user came from rather than leaving JASWA. The URL is
 * left alone: there is no router, and the page itself is still kept in the
 * session as before. A step back or forward only sets the page; it pushes
 * nothing, or Forward would have nowhere to go.
 */
export function usePageHistory<T extends string>(page: T, setPage: (page: T) => void,
  isPage: (value: unknown) => value is T, onTravel?: () => void): (next: T) => void {
  const current = useRef(page);
  const travel = useRef(onTravel);
  useEffect(() => { current.current = page; }, [page]);
  useEffect(() => { travel.current = onTravel; }, [onTravel]);

  /* The entry the tab already stands on names the page it opened on, so the
     first step back lands there rather than on an entry that names nothing. */
  useEffect(() => {
    window.history.replaceState({ ...readState(window.history.state), jaswaPage: current.current }, '');
  }, []);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const target = readState(event.state).jaswaPage;
      if (!isPage(target) || target === current.current) return;
      travel.current?.();
      setPage(target);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isPage, setPage]);

  return useCallback((next: T) => {
    if (next === current.current) return;
    window.history.pushState({ ...readState(window.history.state), jaswaPage: next }, '');
    current.current = next;
    setPage(next);
  }, [setPage]);
}

function readState(state: unknown): Record<string, unknown> {
  return state !== null && typeof state === 'object' && !Array.isArray(state) ? state as Record<string, unknown> : {};
}
