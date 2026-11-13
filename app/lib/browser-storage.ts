import type { ImportedGame, Preferences } from './types';

const databaseName = 'jaswa-local';
const storeName = 'workspace';
const gameKey = 'imported-game';
const preferencesKey = 'preferences';
const preferencesMirrorKey = 'jaswa-preferences';
const writeOrderKey = '__jaswaWriteOrder';

/* A preference click must survive even a tab closed immediately afterwards.
   IndexedDB is the complete workspace store; this small synchronous mirror is
   written before React receives the new value, then reconciled to IndexedDB in
   order. It is deliberately limited to preferences, never an imported game. */
let preferenceWriteTail: Promise<void> = Promise.resolve();
let lastPreferenceWriteOrder = 0;
let preferenceDatabaseRead = false;
let preferenceReadAttempted = false;
let preferenceInitialization: Promise<unknown> | null = null;

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

/* The copies are not checked against the whole preference contract here:
   `readPreferences` judges the chosen copy one choice at a time. */
function savedAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  const time = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(time) ? time : null;
}

function isPreferenceCopy(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeOrder(value: unknown): number | null {
  if (!isPreferenceCopy(value)) return null;
  const order = value[writeOrderKey];
  return typeof order === 'number' && Number.isSafeInteger(order) && order > 0 ? order : null;
}

function preferencesWithoutWriteOrder(value: unknown): unknown {
  if (!isPreferenceCopy(value) || !(writeOrderKey in value)) return value;
  const copy = { ...value };
  delete copy[writeOrderKey];
  return copy;
}

function latestPreferences(first: unknown, second: unknown): unknown {
  const firstOrder = writeOrder(first);
  const secondOrder = writeOrder(second);
  lastPreferenceWriteOrder = Math.max(lastPreferenceWriteOrder, firstOrder ?? 0, secondOrder ?? 0);
  /* A write order is assigned only after restoration has read both copies, so
     an ordered copy follows an unordered one. Ordinary mirror-first writes
     win an equal order, while a database-only write can win even if the clock
     moved backwards or the old mirror has the same timestamp. */
  if (firstOrder !== null || secondOrder !== null) {
    if (firstOrder === null) return second;
    if (secondOrder === null) return first;
    return secondOrder >= firstOrder ? second : first;
  }
  const firstTime = savedAt(first);
  const secondTime = savedAt(second);
  /* A missing timestamp is one malformed field, not a reason to discard the
     other choices. When neither copy can be ordered, prefer the mirror as in
     the equal-timestamp case and let the section readers judge each choice. */
  if (firstTime === null && secondTime === null) return isPreferenceCopy(second) ? second : isPreferenceCopy(first) ? first : null;
  if (firstTime === null) return second;
  if (secondTime === null) return first;
  /* The synchronous mirror is written before IndexedDB, so it must win an
     exact tie as well as a newer timestamp after a tab closes mid-write. */
  return secondTime >= firstTime ? second : first;
}

/** The database write succeeded, but closing immediately may lose a later edit. */
export class PreferenceMirrorUnavailable extends Error {
  constructor() {
    super('The preference recovery copy could not be saved.');
    this.name = 'PreferenceMirrorUnavailable';
  }
}

/** Writing over an unread database could erase choices missing from the mirror. */
export class PreferenceStoreUnreadable extends Error {
  constructor() {
    super('Reload to read the saved preferences before changing them.');
    this.name = 'PreferenceStoreUnreadable';
  }
}

function writePreferencesMirror(preferences: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(preferencesMirrorKey, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
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
  preferenceReadAttempted = true;
  const mirror = readPreferencesMirror();
  try {
    const databaseCopy = await readWorkspaceValue<unknown>(preferencesKey);
    preferenceDatabaseRead = true;
    return preferencesWithoutWriteOrder(latestPreferences(databaseCopy, mirror));
  } catch (error) {
    preferenceDatabaseRead = false;
    const recovered = latestPreferences(null, mirror);
    if (recovered === null) throw error;
    return preferencesWithoutWriteOrder(recovered);
  }
}

export function canSavePreferences(): boolean {
  return preferenceDatabaseRead;
}

export function savePreferences(preferences: Preferences): Promise<void> {
  /* Standalone callers can write a complete document without first mounting the
     workspace. The interactive path has already restored, so it keeps its
     synchronous mirror. An unsuccessful read never permits a blind overwrite. */
  if (preferenceInitialization || !preferenceReadAttempted) {
    const snapshot = structuredClone(preferences);
    preferenceInitialization ??= loadPreferences().finally(() => { preferenceInitialization = null; });
    return preferenceInitialization.then(() => savePreferences(snapshot));
  }
  if (!preferenceDatabaseRead) return Promise.reject(new PreferenceStoreUnreadable());
  const observedMirrorOrder = writeOrder(readPreferencesMirror()) ?? 0;
  const nextOrder = Math.max(lastPreferenceWriteOrder, observedMirrorOrder) + 1;
  if (!Number.isSafeInteger(nextOrder)) throw new Error('Preference write order is exhausted.');
  lastPreferenceWriteOrder = nextOrder;
  const snapshot = { ...structuredClone(preferences), [writeOrderKey]: nextOrder };
  const mirrored = writePreferencesMirror(snapshot);
  const writeNext = preferenceWriteTail.catch(() => undefined).then(() => writeWorkspaceValue(preferencesKey, snapshot));
  preferenceWriteTail = writeNext;
  return writeNext.then(() => {
    if (!mirrored) throw new PreferenceMirrorUnavailable();
  });
}
