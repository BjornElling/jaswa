/**
 * A chosen folder to write exports into.
 *
 * The File System Access API is the only way a web page can write a file where
 * the user asked rather than into whatever the browser calls Downloads. It is
 * absent in Firefox and Safari, so every entry point here reports whether it
 * worked and the interface says plainly which of the two worlds it is in — the
 * alternative is a folder control that silently does nothing.
 *
 * The handle itself is a live object, not a path: it cannot be serialised into
 * the .sw file, and it carries a permission grant that the browser may withdraw
 * between sessions. It therefore lives in IndexedDB beside the workspace and is
 * re-checked on load, never in `Preferences`.
 */

const databaseName = 'jaswa-local';
const storeName = 'workspace';
const saveFolderKey = 'save-folder';

/* The API is young enough that TypeScript's DOM library does not describe it in
   every supported version. Only the members JASWA calls are declared. */
type PermissionState = 'granted' | 'denied' | 'prompt';
type PermissionDescriptor = { mode?: 'read' | 'readwrite' };
type WritableStream = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type FileHandle = { createWritable: () => Promise<WritableStream> };
export type DirectoryHandle = {
  name: string;
  queryPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; startIn?: DirectoryHandle }) => Promise<DirectoryHandle>;
};

export function canChooseSaveFolder(): boolean {
  return typeof window !== 'undefined' && typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(value: DirectoryHandle | null): Promise<void> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    const request = value === null ? store.delete(saveFolderKey) : store.put(value, saveFolderKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
}

function get(): Promise<DirectoryHandle | null> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(saveFolderKey);
    request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }));
}

/**
 * Whether the grant made in an earlier session still stands. A handle that has
 * lost its permission is reported as absent rather than silently re-prompting:
 * the browser only grants one on a real click, and a prompt raised by a page
 * load is one the user cannot connect to anything they did.
 */
async function stillPermitted(handle: DirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    return await handle.queryPermission({ mode: 'readwrite' }) === 'granted';
  } catch {
    return false;
  }
}

export async function loadSaveFolder(): Promise<DirectoryHandle | null> {
  if (!canChooseSaveFolder()) return null;
  try {
    const handle = await get();
    if (!handle) return null;
    return await stillPermitted(handle) ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Asks for a folder. Returns null when the user dismisses the picker, which is
 * an ordinary answer and not an error worth a message.
 */
export async function chooseSaveFolder(): Promise<DirectoryHandle | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ mode: 'readwrite' });
    if (handle.requestPermission && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return null;
    await put(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function forgetSaveFolder(): Promise<void> {
  try {
    await put(null);
  } catch {
    /* Losing the record leaves the next export going through the browser's own
       download, which is the same place it would have gone without a folder. */
  }
}

/**
 * Writes into the chosen folder. Reports false when there is no folder or the
 * write fails, so the caller can fall back to a download rather than leaving
 * the user with no file and no explanation.
 */
export async function writeToSaveFolder(handle: DirectoryHandle | null, filename: string, content: string): Promise<boolean> {
  if (!handle) return false;
  try {
    if (!await stillPermitted(handle)) {
      if (!handle.requestPermission) return false;
      if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return false;
    }
    const file = await handle.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
