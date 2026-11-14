import { describe, expect, it } from 'vitest';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import type { Preferences, StoredGame } from '../domain/model';
import { createImportedGame, readStoredGame, storedGame, validateGameFile } from '../ingest/game-export';
import { WorkspaceReadOnly } from './ports';
import type { WorkspaceRepository, WriterCoordination, WriterRole } from './ports';
import { createWorkspaceStore } from './workspace-store';

const exportData = { wizard_id: 1, unit_list: [], runes: [] };
const account = createImportedGame('export.json', exportData, validateGameFile(exportData));

function memoryRepository() {
  const saved: { game: StoredGame | null; preferences: Preferences[] } = { game: null, preferences: [] };
  const repository: WorkspaceRepository = {
    loadGame: async () => saved.game,
    loadPreferences: async () => saved.preferences.at(-1) ?? null,
    canSavePreferences: () => true,
    saveGame: async (game) => { saved.game = game; },
    clearGame: async () => { saved.game = null; },
    savePreferences: async (preferences) => { saved.preferences.push(preferences); },
    saveGamePair: async (game, _before, after) => { saved.game = game; saved.preferences.push(after); return { preferences: after, mirrorSaved: true }; },
  };
  return { repository, saved };
}

function fixedRole(role: WriterRole, coordinated = true) {
  let commits = 0;
  const coordination: WriterCoordination = {
    ready: async () => role,
    getRole: () => role,
    isCoordinated: () => coordinated,
    onRoleChange: () => () => {},
    announceCommit: () => { commits += 1; },
    onRemoteCommit: () => () => {},
  };
  return { coordination, commits: () => commits };
}

describe('workspace store', () => {
  it('builds rapid preference changes on each other and stores each in order', async () => {
    const { repository, saved } = memoryRepository();
    const { coordination } = fixedRole('writer');
    const store = createWorkspaceStore(repository, coordination);
    await store.restore();
    await coordination.ready();
    store.changePreferences((current) => ({ ...current, hardwareAcceleration: false }));
    store.changePreferences((current) => ({ ...current, importRoute: 'direct' }));
    expect(store.getSnapshot().preferences).toMatchObject({ hardwareAcceleration: false, importRoute: 'direct' });
    await Promise.resolve();
    expect(saved.preferences.map((entry) => [entry.hardwareAcceleration, entry.importRoute]))
      .toEqual([[false, 'file'], [false, 'direct']]);
  });

  it('stores an account before showing it, without what derives from it, and announces the commit', async () => {
    const { repository, saved } = memoryRepository();
    const writer = fixedRole('writer');
    const store = createWorkspaceStore(repository, writer.coordination);
    await store.restore();
    const accepted = await store.importAccount(account);
    expect(accepted).toBe(account);
    expect(saved.game).toEqual(storedGame(account));
    expect(saved.game).not.toHaveProperty('snapshot');
    expect(saved.game).not.toHaveProperty('report');
    expect(store.getSnapshot().game).toBe(account);
    expect(writer.commits()).toBe(1);
  });

  it('restores a stored account with its snapshot and report derived again', async () => {
    const { repository, saved } = memoryRepository();
    saved.game = storedGame(account);
    const store = createWorkspaceStore(repository, fixedRole('writer').coordination);
    await store.restore();
    const restored = store.getSnapshot().game;
    expect(restored?.snapshot.accountId).toBe('1');
    expect(restored?.snapshot.runes).toEqual([]);
    expect(restored?.report.valid).toBe(true);
    expect(store.getSnapshot().storageNotice).toBeNull();
  });

  it('keeps a reader tab from changing anything and says so after restore', async () => {
    const { repository, saved } = memoryRepository();
    const store = createWorkspaceStore(repository, fixedRole('reader').coordination);
    await store.restore();
    expect(store.getSnapshot().storageNotice?.tone).toBe('warn');
    expect(store.changePreferences((current) => ({ ...current, hardwareAcceleration: false }))).toBe(false);
    await expect(store.importAccount(account)).rejects.toBeInstanceOf(WorkspaceReadOnly);
    expect(saved.game).toBeNull();
    expect(saved.preferences).toEqual([]);
    expect(store.getSnapshot().preferences).toEqual({ ...blankPreferences(), updatedAt: store.getSnapshot().preferences.updatedAt });
  });
  it('keeps uncoordinated tabs read-only instead of permitting competing saves', async () => {
    const { repository } = memoryRepository();
    const store = createWorkspaceStore(repository, fixedRole('writer', false).coordination);
    await store.restore();
    expect(store.getSnapshot().storageNotice?.message).toMatch(/cannot coordinate/);
    expect(store.changePreferences((current) => ({ ...current, hardwareAcceleration: false }))).toBe(false);
    await expect(store.importAccount(account)).rejects.toBeInstanceOf(WorkspaceReadOnly);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getSnapshot().storageNotice?.message).toMatch(/cannot coordinate/);
  });
});

describe('stored game', () => {
  it('costs a malformed lock only that lock, never the account', () => {
    const restored = readStoredGame({ ...storedGame(account), runeLocks: 'not a lock map' });
    expect(restored?.data).toEqual(account.data);
    expect(restored?.runeLocks).toBeUndefined();
  });

  it('refuses an account whose capture facts are unreadable', () => {
    expect(readStoredGame({ ...storedGame(account), coverage: { complete: true, misses: [{ command: 'x', cause: 'unread' }] } })).toBeNull();
    expect(readStoredGame({ ...storedGame(account), coverage: undefined })).toBeNull();
  });

  it('refuses an account whose observation no longer passes the import contract', () => {
    expect(readStoredGame({ ...storedGame(account), data: { unit_list: [] } })).toBeNull();
  });
});
