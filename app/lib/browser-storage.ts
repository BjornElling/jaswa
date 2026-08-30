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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(key: string): Promise<T | null> {
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

async function write(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
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

function readPreferencesMirror(): Preferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(preferencesMirrorKey);
    return raw ? JSON.parse(raw) as Preferences : null;
  } catch {
    return null;
  }
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
  return read<ImportedGame>(gameKey);
}

export function saveImportedGame(game: ImportedGame) {
  return write(gameKey, game);
}

export async function clearImportedGame(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(gameKey);
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

export async function loadPreferences(): Promise<Preferences | null> {
  try {
    const preferences = await read<Preferences>(preferencesKey);
    return preferences ?? readPreferencesMirror();
  } catch {
    return readPreferencesMirror();
  }
}

export function savePreferences(preferences: Preferences) {
  writePreferencesMirror(preferences);
  const snapshot = structuredClone(preferences);
  const writeNext = preferenceWriteTail.catch(() => undefined).then(() => write(preferencesKey, snapshot));
  preferenceWriteTail = writeNext;
  return writeNext;
}
