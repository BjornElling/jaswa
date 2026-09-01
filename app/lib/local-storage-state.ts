import { type Dispatch, type SetStateAction, useMemo, useSyncExternalStore } from 'react';

type StoredValueValidator<T> = (value: unknown) => value is T;

function readStoredValue<T>(key: string, validate: StoredValueValidator<T>): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredValue<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The current choice remains usable when persistent storage is unavailable or full. */
  }
}

type LocalStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  setState: (update: SetStateAction<T>) => void;
};

function createLocalStore<T>(
  key: string,
  initialValue: T,
  validate: StoredValueValidator<T>,
): LocalStore<T> {
  let value = initialValue;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded) return;
    loaded = true;
    const stored = readStoredValue(key, validate);
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
      writeStoredValue(key, value);
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Local state starts with its server-safe default, then adopts a validated
 * value saved on this computer during hydration. Updates write immediately so
 * closing a tab cannot race the persistence of the latest choice.
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  validate: StoredValueValidator<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const store = useMemo(() => createLocalStore(key, initialValue, validate), [key, initialValue, validate]);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [value, store.setState];
}
