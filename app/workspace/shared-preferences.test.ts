import { describe, expect, it } from 'vitest';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import type { Preferences } from '../domain/model';
import type { WorkspaceRepository, WriterCoordination, WriterRole } from './ports';
import { createWorkspaceStore } from './workspace-store';
import { createPreferenceSharing } from './shared-preferences';
import { SharingUnavailable } from './preference-sharing';
import type { PreferenceCheckpoint, PreferenceSharingPort, SharedPreferenceCopy } from './shared-preferences';

async function fixture(local = blankPreferences(), shared: SharedPreferenceCopy | null = null, writer: WriterRole = 'writer') {
  let saved = local;
  const repository: WorkspaceRepository = {
    loadGame: async () => null, loadPreferences: async () => saved, canSavePreferences: () => true,
    savePreferences: async (next) => { saved = next; }, saveGame: async () => {}, clearGame: async () => {},
    saveGamePair: async (_game, _before, after) => ({ preferences: after, mirrorSaved: true }),
  };
  const role: WriterCoordination = {
    ready: async () => writer, getRole: () => writer, isCoordinated: () => true,
    onRoleChange: () => () => {}, onRemoteCommit: () => () => {}, announceCommit: () => {},
  };
  const store = createWorkspaceStore(repository, role);
  await store.restore();
  let base: PreferenceCheckpoint | null = null;
  let writes = 0;
  const port: PreferenceSharingPort = {
    read: async () => shared,
    write: async (token, preferences) => {
      if (token !== (shared?.token ?? null)) return null;
      shared = { token: String(++writes), preferences: structuredClone(preferences) };
      return shared;
    },
    checkpoint: async () => base,
    save: async (preferences, checkpoint) => { saved = preferences; base = checkpoint; },
  };
  return { store, port, sharing: createPreferenceSharing(store, port),
    remote: () => shared!, writes: () => writes, saved: () => saved,
    setRemote: (preferences: Record<string, unknown>) => { shared = { token: `external-${++writes}`, preferences }; },
  };
}

describe('automatic local helper preference sharing', () => {
  it('seeds an empty helper, restores into a fresh browser and does not echo a pull back', async () => {
    const first = await fixture({ ...blankPreferences(), runeRoles: [], hardwareAcceleration: false });
    await first.sharing.synchronize();
    expect(first.remote().preferences.runeRoles).toEqual([]);
    const second = await fixture(blankPreferences(), first.remote());
    await second.sharing.synchronize();
    expect(second.store.getSnapshot().preferences.runeRoles).toEqual([]);
    expect(second.store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
    await second.sharing.synchronize();
    expect(second.writes()).toBe(0);
    expect(second.sharing.getSnapshot().state).toBe('shared');
  });

  it('keeps two pre-existing differing copies intact until the user chooses one', async () => {
    const local = { ...blankPreferences(), runeRoles: [] };
    const remote = { ...blankPreferences(), hardwareAcceleration: false };
    const f = await fixture(local, { token: 'original', preferences: remote });
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('conflict');
    expect(f.saved().runeRoles).toEqual([]);
    expect(f.writes()).toBe(0);
    await f.sharing.synchronize('shared');
    expect(f.store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
    expect(f.writes()).toBe(0);
  });

  it('merges offline edits with independent remote edits, retaining choices unknown to this build', async () => {
    const f = await fixture();
    await f.sharing.synchronize();
    f.port.read = async () => { throw new Error('Helper is closed'); };
    f.store.changePreferences((p) => ({ ...p, general: { ...p.general, hourCycle: 'h23' } }));
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('local');
    expect(f.store.getSnapshot().preferences.general.hourCycle).toBe('h23');
    f.setRemote({ ...f.remote().preferences, hardwareAcceleration: false, futureSetting: { keep: true } });
    f.port.read = async () => f.remote();
    await f.sharing.synchronize();
    expect(f.store.getSnapshot().preferences.general.hourCycle).toBe('h23');
    expect(f.store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
    expect(f.remote().preferences.futureSetting).toEqual({ keep: true });
    f.store.changePreferences((p) => ({ ...p, general: { ...p.general, hourCycle: 'h12' } }));
    await f.sharing.synchronize();
    expect(f.remote().preferences.futureSetting).toEqual({ keep: true });
  });

  it('tells a missing helper apart from a helper whose copy could not be joined', async () => {
    const f = await fixture();
    f.port.read = async () => { throw new SharingUnavailable('Helper is closed'); };
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('unavailable');
    f.port.read = async () => { throw new Error('The helper returned unreadable personalization.'); };
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('local');
  });

  it('detects same-field conflicts and supports an explicit choice of the local copy', async () => {
    const f = await fixture();
    await f.sharing.synchronize();
    f.store.changePreferences((p) => ({ ...p, general: { ...p.general, numberFormat: 'european' } }));
    f.setRemote({ ...f.remote().preferences, general: { ...f.store.getSnapshot().preferences.general, numberFormat: 'american' } });
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('conflict');
    expect(f.store.getSnapshot().preferences.general.numberFormat).toBe('european');
    await f.sharing.synchronize('local');
    expect((f.remote().preferences.general as Preferences['general']).numberFormat).toBe('european');
  });

  it('rereads and merges after losing a conditional write race', async () => {
    const f = await fixture();
    await f.sharing.synchronize();
    f.store.changePreferences((p) => ({ ...p, runeRoles: [] }));
    const write = f.port.write;
    let race = true;
    f.port.write = async (token, preferences) => {
      if (race) { race = false; f.setRemote({ ...f.remote().preferences, hardwareAcceleration: false }); return null; }
      return write(token, preferences);
    };
    await f.sharing.synchronize();
    expect(f.remote().preferences.runeRoles).toEqual([]);
    expect(f.remote().preferences.hardwareAcceleration).toBe(false);
  });

  it('applies clicks made during a pull after the pulled document and persists both', async () => {
    const f = await fixture();
    await f.sharing.synchronize();
    f.setRemote({ ...f.remote().preferences, hardwareAcceleration: false });
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const save = f.port.save;
    f.port.save = async (...args) => { started(); await gate; await save(...args); };
    const pulling = f.sharing.synchronize();
    await waiting;
    f.store.changePreferences((p) => ({ ...p, runeRoles: [] }));
    release();
    await pulling;
    expect(f.store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
    expect(f.store.getSnapshot().preferences.runeRoles).toEqual([]);
    expect(f.saved().runeRoles).toEqual([]);
    await f.sharing.synchronize();
    expect(f.remote().preferences.runeRoles).toEqual([]);
  });

  it('never lets a reader tab publish preferences', async () => {
    const f = await fixture(blankPreferences(), null, 'reader');
    await f.sharing.synchronize('local');
    expect(f.sharing.getSnapshot().state).toBe('reader');
    expect(f.writes()).toBe(0);
  });

  it('does not overwrite shared choices when its checkpoint cannot be read', async () => {
    const f = await fixture();
    f.port.checkpoint = async () => ({ broken: true });
    await f.sharing.synchronize();
    expect(f.sharing.getSnapshot().state).toBe('local');
    expect(f.writes()).toBe(0);
  });

  it('keeps an explicit choice requested while an automatic poll is in flight', async () => {
    const f = await fixture({ ...blankPreferences(), runeRoles: [] }, {
      token: 'remote', preferences: { ...blankPreferences(), hardwareAcceleration: false },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = f.port.read;
    f.port.read = async () => { await gate; return read(); };
    const poll = f.sharing.synchronize();
    const choose = f.sharing.synchronize('shared');
    release();
    await Promise.all([poll, choose]);
    expect(f.sharing.getSnapshot().state).toBe('shared');
    expect(f.store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
  });
});
