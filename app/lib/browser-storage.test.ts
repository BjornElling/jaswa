import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankPreferences } from './file-imports';
import { loadPreferences, savePreferences } from './browser-storage';

describe('preference storage', () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps consecutive choices in the synchronous mirror and database', async () => {
    const first = { ...blankPreferences(), hardwareAcceleration: false, updatedAt: '2026-11-13T10:00:00.000Z' };
    const second = { ...first, importRoute: 'direct' as const, updatedAt: '2026-11-13T10:00:01.000Z' };
    const firstWrite = savePreferences(first);
    const secondWrite = savePreferences(second);
    expect(JSON.parse(window.localStorage.getItem('jaswa-preferences')!)).toEqual(second);
    await Promise.all([firstWrite, secondWrite]);
    expect(await loadPreferences()).toEqual(second);
  });

  it('returns the intact mirror when the database cannot be opened', async () => {
    const preferences = { ...blankPreferences(), importRoute: 'direct' as const };
    window.localStorage.setItem('jaswa-preferences', JSON.stringify(preferences));
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    expect(await loadPreferences()).toEqual(preferences);
  });
});
