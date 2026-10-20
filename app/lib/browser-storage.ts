import type { ImportedGame, Preferences } from './types';

const databaseName = 'jaswa-local';
const storeName = 'workspace';
const gameKey = 'imported-game';
const preferencesKey = 'preferences';
const preferencesMirrorKey = 'jaswa-preferences';

/* A preference click must survive even a tab closed immediately afterwards.
   IndexedDB is the complete workspace store; this small synchronous mirror is
   written before React receives the new value, then reconciled to IndexedDB in
   order. It is deliberately limited to preferences, never an imported game. */
let preferenceWriteTail: Promise<void> = Promise.resolve();

/* The one place the workspace database is opened: its name, its store and
   the store's creation. The save folder (`save-location.ts`) lives in the same
   store and reaches it through the three functions below, so the two can never
   open the database in different shapes. The `1` is IndexedDB's own required
   argument, not a format version of JASWA's. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One stored value of the workspace, or `null` where none is stored. */
export async function readWorkspaceValue<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => {
      database.close();
      resolve((request.result as T | undefined) ?? null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

/* Settles when the transaction does, so a caller knows the change is stored. */
async function change(apply: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    apply(transaction.objectStore(storeName));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export function writeWorkspaceValue(key: string, value: unknown): Promise<void> {
  return change((store) => store.put(value, key));
}

export function deleteWorkspaceValue(key: string): Promise<void> {
  return change((store) => store.delete(key));
}

function readPreferencesMirror(): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(preferencesMirrorKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* Only the timestamp decides which copy is newer. The copies are not checked
   against the whole contract here: that used to throw away any copy saved
   before the latest change to it, and with it every choice the user had made.
   `readPreferences` judges the chosen copy one choice at a time. */
function savedAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  const time = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(time) ? time : null;
}

function latestPreferences(first: unknown, second: unknown): unknown {
  const firstTime = savedAt(first);
  const secondTime = savedAt(second);
  if (firstTime === null) return secondTime === null ? null : second;
  if (secondTime === null) return first;
  /* The synchronous mirror is written before IndexedDB, so it must win an
     exact tie as well as a newer timestamp after a tab closes mid-write. */
  return secondTime >= firstTime ? second : first;
}

function writePreferencesMirror(preferences: Preferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(preferencesMirrorKey, JSON.stringify(preferences));
  } catch {
    /* IndexedDB remains the primary store when a browser declines the mirror. */
  }
}

export function loadImportedGame() {
  return readWorkspaceValue<ImportedGame>(gameKey);
}

export function saveImportedGame(game: ImportedGame) {
  return writeWorkspaceValue(gameKey, game);
}

export function clearImportedGame(): Promise<void> {
  return deleteWorkspaceValue(gameKey);
}

/** The newest stored copy, unjudged; pass it through `readPreferences`. */
export async function loadPreferences(): Promise<unknown> {
  const mirror = readPreferencesMirror();
  try {
    return latestPreferences(await readWorkspaceValue<unknown>(preferencesKey), mirror);
  } catch {
    return latestPreferences(null, mirror);
  }
}

export function savePreferences(preferences: Preferences) {
  writePreferencesMirror(preferences);
  const snapshot = structuredClone(preferences);
  const writeNext = preferenceWriteTail.catch(() => undefined).then(() => writeWorkspaceValue(preferencesKey, snapshot));
  preferenceWriteTail = writeNext;
  return writeNext;
}
