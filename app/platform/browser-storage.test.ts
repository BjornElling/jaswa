import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import { loadImportedGame, loadPreferences, saveImportedGame, savePreferences, saveWorkspacePair, writeWorkspaceValue } from './browser-storage';
import { PairedCommitUnavailable, PreferenceMirrorUnavailable, PreferenceStoreUnreadable } from '../workspace/ports';
import type { ImportedGame } from '../domain/model';
import type { AccountSnapshot } from '../domain/account/account-snapshot';

const account = (fileName: string): ImportedGame => ({
  fileName, importedAt: '2026-11-13T10:00:00.000Z', data: {}, snapshot: {} as AccountSnapshot,
  report: { valid: true, message: '', knownSections: [], unknownMonsterIds: [] },
});

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

  it.each([false, true])('recovers the %s branch of an interrupted paired commit', async (committed) => {
    const before = { ...blankPreferences(), hardwareAcceleration: false, importRoute: 'file' as const,
      updatedAt: '2026-11-13T10:00:00.000Z' };
    const after = { ...before, importRoute: 'direct' as const };
    const token = 'commit-under-test';
    const beforeCopy = { ...before, __jaswaWriteOrder: 100 };
    const afterCopy = { ...after, __jaswaWriteOrder: 101 };
    await writeWorkspaceValue('preferences', committed ? afterCopy : beforeCopy);
    await writeWorkspaceValue('preference-commit', committed ? token : 'earlier-commit');
    window.localStorage.setItem('jaswa-preferences', JSON.stringify({
      __jaswaPendingCommit: { token, before: beforeCopy, after: afterCopy },
    }));
    vi.resetModules();
    const reloaded = await import('./browser-storage');
    expect(await reloaded.loadPreferences()).toEqual(committed ? after : before);
  });

  it('does not guess a pending commit outcome when its database is unavailable', async () => {
    const before = blankPreferences();
    window.localStorage.setItem('jaswa-preferences', JSON.stringify({
      __jaswaPendingCommit: { token: 'commit-under-test', before, after: { ...before, hardwareAcceleration: false } },
    }));
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    await expect(loadPreferences()).rejects.toThrow('unavailable');
    await expect(savePreferences(before)).rejects.toBeInstanceOf(PreferenceStoreUnreadable);
  });

  it('falls back to the database copy when the pending recovery record is unreadable', async () => {
    const stored = { ...blankPreferences(), hardwareAcceleration: false };
    await savePreferences(stored);
    window.localStorage.setItem('jaswa-preferences', JSON.stringify({ __jaswaPendingCommit: { token: 'broken' } }));
    vi.resetModules();
    const reloaded = await import('./browser-storage');
    expect(await reloaded.loadPreferences()).toEqual(stored);
    await expect(reloaded.savePreferences(blankPreferences())).resolves.toBeUndefined();
  });

  it('does not guess when the pending recovery record is unreadable and the database is too', async () => {
    window.localStorage.setItem('jaswa-preferences', JSON.stringify({ __jaswaPendingCommit: { token: 'broken' } }));
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('unavailable'); } });
    await expect(loadPreferences()).rejects.toThrow('unavailable');
    await expect(savePreferences(blankPreferences())).rejects.toBeInstanceOf(PreferenceStoreUnreadable);
  });

  it('commits a pair and rebases an unrelated preference edit queued while it runs', async () => {
    const before = { ...blankPreferences(), hardwareAcceleration: false, updatedAt: '2026-11-13T10:00:00.000Z' };
    const after = { ...before, importRoute: 'direct' as const };
    await saveImportedGame(account('before'));
    const earlier = savePreferences(before);
    const paired = saveWorkspacePair(account('after'), before, after);
    const later = { ...before, general: { ...before.general, numberFormat: 'american' as const } };
    const following = savePreferences(later, (current) => ({ ...current, general: later.general }));
    await earlier;
    expect((await paired).preferences).toEqual({ ...after, general: later.general });
    await following;
    expect(await loadImportedGame()).toEqual(account('after'));
    expect(await loadPreferences()).toEqual({ ...after, general: later.general });
  });

  it('aborts the whole pair while retaining an unrelated queued preference edit', async () => {
    const before = { ...blankPreferences(), hardwareAcceleration: false };
    const after = { ...before, importRoute: 'direct' as const };
    await saveImportedGame(account('before'));
    await savePreferences(before);
    const put = FakeObjectStore.prototype.put;
    const failing = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: InstanceType<typeof FakeObjectStore>, value, key) {
      if (key === 'preference-commit') throw new Error('injected transaction failure');
      return put.call(this, value, key);
    });
    const paired = saveWorkspacePair(account('after'), before, after);
    const later = { ...before, general: { ...before.general, numberFormat: 'american' as const } };
    const following = savePreferences(later, (current) => ({ ...current, general: later.general }));
    await expect(paired).rejects.toThrow('injected transaction failure');
    failing.mockRestore();
    await following;
    expect(await loadImportedGame()).toEqual(account('before'));
    expect(await loadPreferences()).toEqual(later);
  });

  it('recovers the committed pair when publication of the final mirror fails', async () => {
    const before = blankPreferences();
    const after = { ...before, importRoute: 'direct' as const };
    await saveImportedGame(account('before'));
    await savePreferences(before);
    const setItem = window.localStorage.setItem;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
      if (!value.includes('__jaswaPendingCommit')) throw new Error('mirror unavailable');
      setItem.call(window.localStorage, key, value);
    });
    const result = await saveWorkspacePair(account('after'), before, after);
    expect(result.mirrorSaved).toBe(false);
    vi.resetModules();
    const reloaded = await import('./browser-storage');
    expect(await reloaded.loadImportedGame()).toEqual(account('after'));
    expect(await reloaded.loadPreferences()).toEqual(after);
  });

  it('recovers the preceding pair and unrelated edits when rollback mirror publication fails', async () => {
    const before = blankPreferences();
    const after = { ...before, importRoute: 'direct' as const };
    await saveImportedGame(account('before'));
    await savePreferences(before);
    const setItem = window.localStorage.setItem;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
      if (!value.includes('__jaswaPendingCommit')) throw new Error('mirror unavailable');
      setItem.call(window.localStorage, key, value);
    });
    const put = FakeObjectStore.prototype.put;
    const failing = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: InstanceType<typeof FakeObjectStore>, value, key) {
      if (key === 'preference-commit') throw new Error('injected transaction failure');
      return put.call(this, value, key);
    });
    const paired = saveWorkspacePair(account('after'), before, after);
    const later = { ...before, hardwareAcceleration: false };
    const following = savePreferences(later, (current) => ({ ...current, hardwareAcceleration: false }));
    await expect(paired).rejects.toThrow('injected transaction failure');
    failing.mockRestore();
    await following;
    vi.resetModules();
    const reloaded = await import('./browser-storage');
    expect(await reloaded.loadImportedGame()).toEqual(account('before'));
    expect(await reloaded.loadPreferences()).toEqual(later);
  });

  it('does not begin a pair without a durable pending mirror', async () => {
    const before = blankPreferences();
    await saveImportedGame(account('before'));
    await savePreferences(before);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('mirror unavailable'); });
    await expect(saveWorkspacePair(account('after'), before, { ...before, importRoute: 'direct' })).rejects.toBeInstanceOf(PairedCommitUnavailable);
    expect(await loadImportedGame()).toEqual(account('before'));
    expect(await loadPreferences()).toEqual(before);
  });

  it('keeps a later preference edit after the paired write has committed', async () => {
    const before = { ...blankPreferences(), updatedAt: '2026-11-13T10:00:00.000Z' };
    const after = { ...before, importRoute: 'direct' as const };
    await savePreferences(before);
    const paired = await saveWorkspacePair(account('after'), before, after);
    const later = { ...paired.preferences, hardwareAcceleration: false };
    await savePreferences(later);
    vi.resetModules();
    const reloaded = await import('./browser-storage');
    expect(await reloaded.loadPreferences()).toEqual(later);
    expect(await reloaded.loadImportedGame()).toEqual(account('after'));
  });

  it('refuses a full replacement during a pair when it cannot be rebased safely', async () => {
    const before = blankPreferences();
    await savePreferences(before);
    const paired = saveWorkspacePair(account('after'), before, { ...before, importRoute: 'direct' });
    await expect(savePreferences(before)).rejects.toBeInstanceOf(PairedCommitUnavailable);
    await paired;
    expect((await loadPreferences() as typeof before).importRoute).toBe('direct');
  });
});
