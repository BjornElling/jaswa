import { describe, expect, it } from 'vitest';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import type { ImportedGame, Preferences } from '../domain/model';
import { WorkspaceReadOnly } from './ports';
import type { WorkspaceRepository, WriterCoordination, WriterRole } from './ports';
import { createWorkspaceStore } from './workspace-store';

const account: ImportedGame = {
  fileName: 'export.json', importedAt: '2026-11-13T10:00:00.000Z', data: { wizard_id: 1 },
  report: { valid: true, message: '', knownSections: [], unknownMonsterIds: [] },
};

function memoryRepository() {
  const saved: { game: ImportedGame | null; preferences: Preferences[] } = { game: null, preferences: [] };
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

function fixedRole(role: WriterRole) {
  let commits = 0;
  const coordination: WriterCoordination = {
    ready: async () => role,
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

  it('stores an account before showing it and announces the commit', async () => {
    const { repository, saved } = memoryRepository();
    const writer = fixedRole('writer');
    const store = createWorkspaceStore(repository, writer.coordination);
    await store.restore();
    expect(await store.importAccount(account)).toEqual(account);
    expect(saved.game).toEqual(account);
    expect(store.getSnapshot().game).toEqual(account);
    expect(writer.commits()).toBe(1);
  });

  it('keeps a reader tab from changing anything', async () => {
    const { repository, saved } = memoryRepository();
    const store = createWorkspaceStore(repository, fixedRole('reader').coordination);
    await store.restore();
    await Promise.resolve();
    expect(store.changePreferences((current) => ({ ...current, hardwareAcceleration: false }))).toBe(false);
    await expect(store.importAccount(account)).rejects.toBeInstanceOf(WorkspaceReadOnly);
    expect(saved.game).toBeNull();
    expect(saved.preferences).toEqual([]);
    expect(store.getSnapshot().preferences).toEqual({ ...blankPreferences(), updatedAt: store.getSnapshot().preferences.updatedAt });
    expect(store.getSnapshot().storageNotice?.tone).toBe('warn');
  });
});
