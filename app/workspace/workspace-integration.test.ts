import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import exportData from '../../tests/fixtures/rune-optimization-account.json';
import { browserWorkspaceRepository, loadImportedGame, loadPreferences, savePreferences } from '../platform/browser-storage';
import { silentHelper } from '../platform/helper-client';
import { createImportedGame, storedGame, validateGameFile } from '../ingest/game-export';
import { blankPreferences } from '../domain/profiles/preference-defaults';
import { profileRequirements } from '../domain/runes/optimization/rune-optimization-requirements';
import { readPresets, scenarioPresetId } from '../domain/placements/presets';
import { engravingQuestionKey } from './engraving-question';
import type { BuildEngraving } from '../domain/runes/optimization/rune-optimization-refresh';
import type { Preferences } from '../domain/model';
import type { WriterCoordination, WriterRole } from './ports';
import { WorkspaceReadOnly } from './ports';
import { createWorkspaceStore } from './workspace-store';
import { createDirectImportController } from './direct-import-controller';
import { craftResultMemory } from './jobs/craft-result-memory';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function gate() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), open: () => release() };
}
function coordination(initial: WriterRole = 'writer') {
  let role = initial;
  let listener: (role: WriterRole) => void = () => {};
  const port: WriterCoordination = {
    ready: async () => role, getRole: () => role, isCoordinated: () => true,
    onRoleChange: (next) => { listener = next; return () => {}; },
    announceCommit: () => {}, onRemoteCommit: () => () => {},
  };
  return { port, takeOver: () => { role = 'writer'; listener(role); } };
}
const imported = () => createImportedGame('optimization.json', exportData, validateGameFile(exportData));

describe('workspace commands with the browser repository', () => {
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

  it('releases account-derived results on account removal', async () => {
    const store = createWorkspaceStore(browserWorkspaceRepository, coordination().port);
    await store.restore();
    await store.importAccount(imported());
    craftResultMemory.remember({} as NonNullable<ReturnType<typeof craftResultMemory.getSnapshot>>);
    await store.removeAccount();
    expect(craftResultMemory.getSnapshot()).toBeNull();
  });

  it('keeps results through an unidentified account’s live revision, and clears them for another source session', async () => {
    const store = createWorkspaceStore(browserWorkspaceRepository, coordination().port);
    await store.restore();
    store.changePreferences((current) => ({ ...current, importRoute: 'direct' }));
    const game = (sessionId: number) => createImportedGame('helper.json', exportData, validateGameFile(exportData), { instanceId: 'test', sessionId });
    await store.importAccount(game(1));
    const result = {} as NonNullable<ReturnType<typeof craftResultMemory.getSnapshot>>;
    craftResultMemory.remember(result);
    await store.importAccount(game(1));
    expect(craftResultMemory.getSnapshot()).toBe(result);
    await store.importAccount(game(2));
    expect(craftResultMemory.getSnapshot()).toBeNull();
  });

  it('rebases a click during a pending preference-file replacement in state and storage', async () => {
    const pending = gate();
    const store = createWorkspaceStore({ ...browserWorkspaceRepository,
      savePreferences: async (preferences, rebase) => {
        if (!rebase) await pending.promise;
        return savePreferences(preferences, rebase);
      },
    }, coordination().port);
    await store.restore();
    const replacement = store.replacePreferences({ ...blankPreferences(), hardwareAcceleration: false });
    await tick();
    expect(store.changePreferences((current) => ({ ...current, importRoute: 'direct' }))).toBe(true);
    pending.open();
    await replacement;
    expect(store.getSnapshot().preferences).toMatchObject({ hardwareAcceleration: false, importRoute: 'direct' });
    expect(await loadPreferences()).toMatchObject({ hardwareAcceleration: false, importRoute: 'direct' });
  });

  it('refuses writes throughout takeover restoration', async () => {
    const pending = gate();
    let delayed = false;
    const writer = coordination('reader');
    const store = createWorkspaceStore({ ...browserWorkspaceRepository,
      loadPreferences: async () => { if (delayed) await pending.promise; return loadPreferences(); },
    }, writer.port);
    await store.restore();
    await savePreferences({ ...blankPreferences(), hardwareAcceleration: false });
    delayed = true;
    writer.takeOver();
    expect(store.getSnapshot().ready).toBe(true);
    expect(store.getSnapshot().writer).toBeNull();
    expect(store.changePreferences((current) => ({ ...current, importRoute: 'direct' }))).toBe(false);
    await expect(store.importAccount(imported())).rejects.toBeInstanceOf(WorkspaceReadOnly);
    pending.open();
    await vi.waitFor(() => expect(store.getSnapshot().writer).toBe('writer'));
    expect(store.getSnapshot().preferences.hardwareAcceleration).toBe(false);
    expect(await loadPreferences()).toMatchObject({ hardwareAcceleration: false, importRoute: 'file' });
  });

  it('keeps a click after the last of two queued preference-file loads', async () => {
    const pending = gate();
    const store = createWorkspaceStore({ ...browserWorkspaceRepository,
      savePreferences: async (preferences, rebase) => {
        if (!rebase) await pending.promise;
        return savePreferences(preferences, rebase);
      },
    }, coordination().port);
    await store.restore();
    const first = store.replacePreferences({ ...blankPreferences(), hardwareAcceleration: false });
    const second = store.replacePreferences({ ...blankPreferences(), hardwareAcceleration: true });
    store.changePreferences((current) => ({ ...current, importRoute: 'direct' }));
    pending.open();
    await Promise.all([first, second]);
    expect(store.getSnapshot().preferences).toMatchObject({ hardwareAcceleration: true, importRoute: 'direct' });
    expect(await loadPreferences()).toMatchObject({ hardwareAcceleration: true, importRoute: 'direct' });
  });

  it('cancels a helper import already awaiting its repository commit when the controller stops', async () => {
    const pending = gate();
    const entered = gate();
    const store = createWorkspaceStore({ ...browserWorkspaceRepository,
      saveGame: async (game, signal) => { entered.open(); await pending.promise; return browserWorkspaceRepository.saveGame(game, signal); },
    }, coordination().port);
    await store.restore();
    store.changePreferences((current) => ({ ...current, importRoute: 'direct' }));
    const controller = createDirectImportController(silentHelper);
    const connection = { ...silentHelper, profileReady: true, instanceId: 'test', sessionId: 1, revision: 1 };
    controller.start({
      route: 'direct', mode: 'live', getGame: () => store.getSnapshot().game,
      checkConnection: async () => connection,
      readProfile: async () => ({ state: 'ready', profile: { instanceId: 'test', sessionId: 1, revision: 1,
        updatedAt: new Date().toISOString(), source: 'live', data: exportData } }),
      helperStatusMessage: () => '', createImportedGame: () => ({ ...imported(), helperSession: { instanceId: 'test', sessionId: 1 } }),
      importAccount: store.importAccount, onAccepted: () => { throw new Error('Stopped import was published.'); }, onMessage: () => {},
    });
    await entered.promise;
    controller.stop();
    store.changePreferences((current) => ({ ...current, importRoute: 'file' }));
    pending.open();
    await tick(); await tick();
    expect(store.getSnapshot().game).toBeNull();
    expect(await loadImportedGame()).toBeNull();
  });

  it.each(['source', 'lock', 'excluded', 'own', 'failed-save', 'own-failed-save', 'valid', 'own-valid', 'duplicate', 'profile', 'stock'])(
    'revalidates an engrave against the latest state: %s', async (change) => {
      const store = createWorkspaceStore(browserWorkspaceRepository, coordination().port);
      await store.restore();
      const game = await store.importAccount(imported());
      const runes = game!.snapshot.runes.filter((rune) => rune.occupiedId === '11');
      expect(runes).toHaveLength(6);
      const candidate: BuildEngraving = {
        accountId: game!.snapshot.accountId,
        questionKey: '',
        requirements: { ...profileRequirements('12', 10132, undefined).requirements, allowBroken: true, allowIntangible: true },
        before: { runes: new Map(runes.map((rune) => [rune.id, rune])), items: new Map() },
        build: { identity: 'test', picks: [], figures: [], moves: 6, runes: runes.map((rune) => ({
          runeId: rune.id, slot: rune.slot, setId: rune.setId, mainValue: rune.mainValue,
          lines: rune.subProperties, gemmedAt: -1, groundAt: [], spends: [], moves: true, locked: false,
        })) },
      };
      const edit = (change: (preferences: Preferences) => Preferences) => { store.changePreferences(change); };
      edit((preferences) => ({ ...preferences, runeOptimization: { ...preferences.runeOptimization, runesOnOtherMonsters: true, includeHigherPriority: true } }));
      let presetId = scenarioPresetId;
      if (change.startsWith('own')) {
        presetId = 'own:test';
        edit((preferences) => ({ ...preferences, presets: [{ id: presetId, name: 'Test', content: null, members: ['11', '12'], leaderUnitId: null, gear: null }],
          runeOptimization: { ...preferences.runeOptimization, runesOnOtherMonsters: change !== 'own' } }));
      } else if (change === 'source') edit((preferences) => ({ ...preferences, runeOptimization: { ...preferences.runeOptimization, runesOnOtherMonsters: false } }));
      else if (change === 'lock') await store.lockRune(presetId, '11', runes[0].id, 'locked');
      else if (change === 'excluded') await store.lockRune(presetId, '12', runes[0].id, 'excluded');
      const preferences = store.getSnapshot().preferences;
      candidate.questionKey = engravingQuestionKey(preferences, readPresets(game!.data, preferences.presets), presetId, '12');
      if (change === 'profile') edit((preferences) => ({ ...preferences,
        monsterPreferences: { scenario: { '12': { unitId: '12', statTargets: { spd: 500 } } } } }));
      if (change === 'stock') {
        const stone = game!.snapshot.craftItems.find((item) => item.id === '7003')!;
        candidate.before.items = new Map([[stone.id, stone]]);
        const picked = candidate.build.runes[0];
        const line = runes[0].subProperties.findIndex((line) => line.statId === stone.statId);
        picked.lines = picked.lines.map((entry, at) => at === line ? { ...entry, grind: 4 } : entry);
        picked.groundAt = [line];
        picked.spends = [stone.id];
        edit((preferences) => ({ ...preferences, runeOptimization: { ...preferences.runeOptimization, grindUse: 'owned' } }));
        const depleted = structuredClone(exportData);
        depleted.rune_craft_item_list = depleted.rune_craft_item_list.filter((item) => String(item.craft_item_id) !== stone.id);
        await store.importAccount(createImportedGame('depleted.json', depleted, validateGameFile(depleted)));
      }
      if (change === 'duplicate') candidate.build.runes[1] = candidate.build.runes[0];
      const before = storedGame(store.getSnapshot().game!);
      const preferencesBefore = store.getSnapshot().preferences;
      const fail = change === 'failed-save' ? vi.spyOn(browserWorkspaceRepository, 'saveGame').mockRejectedValueOnce(new Error('disk full'))
        : change === 'own-failed-save' ? vi.spyOn(browserWorkspaceRepository, 'saveGamePair').mockRejectedValueOnce(new Error('disk full')) : null;
      if (change.endsWith('valid')) {
        await store.engraveBuild(presetId, '12', candidate);
        const current = store.getSnapshot();
        if (change === 'valid') expect(current.game!.snapshot.runes.filter((rune) => rune.occupiedId === '12')).toHaveLength(6);
        else expect(current.preferences.presets[0].gear?.['12'].runeIds).toEqual(runes.map((rune) => rune.id));
        return;
      }
      await expect(store.engraveBuild(presetId, '12', candidate)).rejects.toThrow();
      fail?.mockRestore();
      expect(store.getSnapshot().preferences).toBe(preferencesBefore);
      expect(storedGame(store.getSnapshot().game!)).toEqual(before);
      expect(await loadImportedGame()).toEqual(before);
    },
  );
});
