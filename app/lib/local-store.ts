import type { ImportedGame, Preferences } from './types';
const databaseName = 'jaswa-local'; const storeName = 'workspace'; const gameKey = 'imported-game'; const preferencesKey = 'preferences';
function openDatabase(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(databaseName, 1); request.onupgradeneeded = () => request.result.createObjectStore(storeName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function get<T>(key: string): Promise<T | null> { const database = await openDatabase(); return new Promise((resolve, reject) => { const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key); request.onsuccess = () => resolve((request.result as T | undefined) ?? null); request.onerror = () => reject(request.error); }); }
async function set(key: string, value: unknown): Promise<void> { const database = await openDatabase(); return new Promise((resolve, reject) => { const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
export function loadImportedGame() { return get<ImportedGame>(gameKey); } export function saveImportedGame(game: ImportedGame) { return set(gameKey, game); }
// This replaces JASWA's private working copy only. The source JSON file on the
// user's computer is never opened for writing.
export function overwriteLocalWorkingCopy(game: ImportedGame) { return set(gameKey, game); }
export async function clearImportedGame() { const database = await openDatabase(); return new Promise<void>((resolve, reject) => { const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(gameKey); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
export function loadPreferences() { return get<Preferences>(preferencesKey); } export function savePreferences(preferences: Preferences) { return set(preferencesKey, preferences); }
