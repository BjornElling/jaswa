import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/* Held for the application's lifetime, not the page's: leaving Artifact
   Optimization and coming back keeps each view's choices and its last answer, so
   a game change made meanwhile — a re-import from Home included — lands in that
   answer rather than in an empty page. Another account, or a reload, starts
   afresh. Nothing here is written to preferences. */
const held = new Map<string, { account: string | null; value: unknown }>();

/** `useState`, kept per view and account across navigation (`ACCOUNT-TABLES.md` §7). */
export function useArtifactViewState<T>(
  view: string,
  account: string | null,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const entry = held.get(view);
    return entry !== undefined && entry.account === account ? entry.value as T : initial;
  });
  const [owner, setOwner] = useState(account);
  if (owner !== account) {
    setOwner(account);
    setState(initial);
  }
  useEffect(() => {
    held.set(view, { account, value: state });
  }, [view, account, state]);
  return [state, setState];
}
