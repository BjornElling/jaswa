import { type Dispatch, type SetStateAction, useMemo, useSyncExternalStore } from 'react';

type SessionValueReader<T> = ((value: unknown) => value is T) | { read: (value: unknown) => T };

function readSessionValue<T>(key: string, reader: SessionValueReader<T>): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof reader !== 'function') return reader.read(value);
    return reader(value) ? value : null;
  } catch {
    return null;
  }
}

/** For a page that sets another page's choice before sending the user there. */
export function writeSessionValue<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Session-scoped choices remain usable when storage is unavailable or full. */
  }
}

type SessionStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  setState: (update: SetStateAction<T>) => void;
};

function createSessionStore<T>(
  key: string,
  initialValue: T,
  reader: SessionValueReader<T>,
): SessionStore<T> {
  let value = initialValue;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded) return;
    loaded = true;
    const stored = readSessionValue(key, reader);
    if (stored !== null) value = stored;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      load();
      return value;
    },
    getServerSnapshot: () => initialValue,
    setState(update) {
      load();
      value = typeof update === 'function'
        ? (update as (previous: T) => T)(value)
        : update;
      writeSessionValue(key, value);
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Session state starts with its server-safe default, then adopts a validated
 * value from this tab during hydration. Independent choices can supply a
 * `readSettings` reader so one invalid field cannot reset its neighbours. Updates
 * write immediately so leaving a page cannot race the persistence of the latest choice.
 */
export function useSessionStorageState<T>(
  key: string,
  initialValue: T,
  reader: SessionValueReader<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const store = useMemo(() => createSessionStore(key, initialValue, reader), [key, initialValue, reader]);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [value, store.setState];
}
