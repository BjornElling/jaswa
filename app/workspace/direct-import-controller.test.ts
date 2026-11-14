import { describe, expect, it } from 'vitest';
import { silentHelper } from '../platform/helper-client';
import type { ImportedGame } from '../domain/model';
import type { AccountSnapshot } from '../domain/account/account-snapshot';
import type { HelperConnection, HelperProfileResult } from './ports';
import { createDirectImportController, type DirectImportConfig } from './direct-import-controller';

const account: ImportedGame = {
  fileName: 'helper.json', importedAt: '2026-11-14T10:00:00.000Z', data: { wizard_id: 7 }, snapshot: {} as AccountSnapshot,
  report: { valid: true, message: 'Ready to import.', knownSections: [], unknownMonsterIds: [] },
};

function connection(revision = 1): HelperConnection {
  return { ...silentHelper, state: 'ready', profileReady: true, instanceId: 'test-helper', sessionId: 1, revision, detail: 'ready' };
}

function profile(revision = 1): HelperProfileResult {
  return { state: 'ready', profile: {
    updatedAt: '2026-11-14T10:00:00.000Z', instanceId: 'test-helper', sessionId: 1, revision, source: 'live', data: {},
  } };
}

const base = (overrides: Partial<DirectImportConfig> = {}) => ({
  route: 'direct' as const,
  mode: 'live' as const,
  getGame: () => null,
  checkConnection: async () => connection(),
  readProfile: async () => profile(),
  helperStatusMessage: () => 'helper status',
  createImportedGame: () => account,
  importAccount: async (imported: ImportedGame) => imported,
  onAccepted: () => {},
  onMessage: () => {},
  ...overrides,
});

describe('direct import controller', () => {
  it('does not publish a profile whose request finished after stop', async () => {
    let release!: (result: HelperProfileResult) => void;
    const pending = new Promise<HelperProfileResult>((resolve) => { release = resolve; });
    let imported = 0;
    const controller = createDirectImportController(silentHelper);
    controller.start(base({ readProfile: () => pending, importAccount: async (value) => { imported += 1; return value; } }));
    await Promise.resolve();
    controller.stop();
    release(profile());
    await Promise.resolve();
    await Promise.resolve();
    expect(imported).toBe(0);
  });

  it('reports one deterministic rejection and keeps it visible on the next poll', async () => {
    let messages = 0;
    const unread: HelperProfileResult = { state: 'unreadable', reason: 'Unreadable account', identity: { instanceId: 'test-helper', sessionId: 1, revision: 1 }, data: {} };
    const controller = createDirectImportController(silentHelper);
    controller.start(base({ readProfile: async () => unread, onMessage: () => { messages += 1; } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().importStopped).toBe('Unreadable account');
    expect(messages).toBe(1);
    await controller.refresh();
    expect(messages).toBe(1);
    controller.stop();
  });

  it('does not combine health coverage with a profile from another revision', async () => {
    let imported = 0;
    let checks = 0;
    const controller = createDirectImportController(silentHelper);
    controller.start(base({
      checkConnection: async () => { checks += 1; return connection(1); },
      readProfile: async () => profile(2),
      importAccount: async (value) => { imported += 1; return value; },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checks).toBe(2);
    expect(imported).toBe(0);
    controller.stop();
  });
});
