import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankPreferences } from '../ingest/preferences';
import { loadPreferences, PreferenceMirrorUnavailable, PreferenceStoreUnreadable, savePreferences, writeWorkspaceValue } from './browser-storage';

describe('preference storage', () => {
  beforeEach(async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    } });
    await loadPreferences();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps consecutive choices in the synchronous mirror and database', async () => {
    const first = { ...blankPreferences(), hardwareAcceleration: false, updatedAt: '2026-11-13T10:00:00.000Z' };
    const second = { ...first, importRoute: 'direct' as const, updatedAt: '2026-11-13T10:00:01.000Z' };
    const firstWrite = savePreferences(first);
    const secondWrite = savePreferences(second);
    expect(JSON.parse(window.localStorage.getItem('jaswa-preferences')!)).toMatchObject(JSON.parse(JSON.stringify(second)));
    await Promise.all([firstWrite, secondWrite]);
    expect(await loadPreferences()).toEqual(second);
  });

  it('returns the intact mirror when the database cannot be opened', async () => {
    const preferences = { ...blankPreferences(), importRoute: 'direct' as const };
    window.localStorage.setItem('jaswa-preferences', JSON.stringify(preferences));
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    expect(await loadPreferences()).toEqual(preferences);
    await expect(savePreferences({ ...preferences, hardwareAcceleration: false })).rejects.toBeInstanceOf(PreferenceStoreUnreadable);
    expect(JSON.parse(window.localStorage.getItem('jaswa-preferences')!)).toEqual(JSON.parse(JSON.stringify(preferences)));
  });

  it('reports a database failure when there is no readable mirror', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    await expect(loadPreferences()).rejects.toThrow('unavailable');
    window.localStorage.setItem('jaswa-preferences', '{invalid');
    await expect(loadPreferences()).rejects.toThrow('unavailable');
  });

  it('keeps independent choices in a mirror with a missing or invalid timestamp', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    for (const updatedAt of [undefined, 'invalid']) {
      const mirror = { hardwareAcceleration: false, importRoute: 'direct', updatedAt };
      window.localStorage.setItem('jaswa-preferences', JSON.stringify(mirror));
      expect(await loadPreferences()).toEqual(JSON.parse(JSON.stringify(mirror)));
    }
  });

  it.each(['2026-11-13T10:00:00.000Z', '2025-01-01T00:00:00.000Z'])(
    'selects a later database write even when its timestamp is %s and its mirror fails',
    async (laterTimestamp) => {
      const first = { ...blankPreferences(), hardwareAcceleration: false, updatedAt: '2026-11-13T10:00:00.000Z' };
      const second = { ...first, importRoute: 'direct' as const, updatedAt: laterTimestamp };
      await savePreferences(first);
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('mirror unavailable'); });
      await expect(savePreferences(second)).rejects.toBeInstanceOf(PreferenceMirrorUnavailable);
      expect(await loadPreferences()).toEqual(second);
      vi.resetModules();
      const reloaded = await import('./browser-storage');
      expect(await reloaded.loadPreferences()).toEqual(second);
      vi.mocked(window.localStorage.setItem).mockRestore();
      const third = { ...second, hardwareAcceleration: true };
      await reloaded.savePreferences(third);
      expect(await reloaded.loadPreferences()).toEqual(third);
    },
  );

  it('returns the newer synchronous mirror before queued database writes settle', async () => {
    const first = { ...blankPreferences(), updatedAt: '2026-11-13T10:00:00.000Z' };
    const second = { ...first, importRoute: 'direct' as const, updatedAt: '2025-01-01T00:00:00.000Z' };
    await savePreferences(first);
    const writing = savePreferences(second);
    expect(await loadPreferences()).toEqual(second);
    await writing;
  });

  it('preserves existing unordered choices using their timestamps before the first ordered write', async () => {
    const first = { ...blankPreferences(), updatedAt: '2026-11-13T10:00:00.000Z' };
    const second = { ...first, importRoute: 'direct' as const, updatedAt: '2026-11-13T10:00:01.000Z' };
    await writeWorkspaceValue('preferences', first);
    window.localStorage.setItem('jaswa-preferences', JSON.stringify(second));
    expect(await loadPreferences()).toEqual(second);
    await savePreferences(second);
    expect(await loadPreferences()).toEqual(second);
  });

  it('initializes standalone writes before ordering two consecutive requests', async () => {
    const first = { ...blankPreferences(), hardwareAcceleration: false };
    const second = { ...first, importRoute: 'direct' as const };
    vi.resetModules();
    const fresh = await import('./browser-storage');
    const writes = [fresh.savePreferences(first), fresh.savePreferences(second)];
    await Promise.all(writes);
    expect(await fresh.loadPreferences()).toEqual(second);
  });
});
