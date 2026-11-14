import { describe, expect, it } from 'vitest';
import fixture from '../../tests/fixtures/rune-optimization-account.json';
import { createImportedGame, readStoredGame, storedGame, validateGameFile, withAccountSnapshot } from './game-export';
import { engraveImportedGame } from '../domain/placements/engrave-rune-build';
import { deleteGamePreset, leadGamePreset } from '../domain/placements/game-preset-edits';
import { readPresets, scenarioPresetId } from '../domain/placements/presets';

function account() {
  const data = { ...structuredClone(fixture), deck_list: [
    { deck_type: 1, deck_seq: 1, unit_id_list: [11, 12], leader_unit_id: 11 },
    { deck_type: 1, deck_seq: 2, unit_id_list: [12, 11], leader_unit_id: 12 },
  ] };
  return createImportedGame('fixture.json', data, validateGameFile(data));
}

describe('immutable observations and local projections', () => {
  it('retains a chosen attack-deck leader when the observation omitted its leader field', () => {
    const data = { ...structuredClone(fixture), deck_list: [{ deck_type: 1, deck_seq: 1, unit_id_list: [11, 12] }] };
    const original = createImportedGame('no-leader.json', data, validateGameFile(data));
    const preset = readPresets(original.data, []).find((entry) => entry.id === 'deck-1-1')!;
    const changed = withAccountSnapshot(leadGamePreset(original, preset, '12'));
    const restored = readStoredGame(storedGame(changed))!;
    expect(readPresets(restored.data, []).find((entry) => entry.id === preset.id)?.leaderUnitId).toBe('12');
    expect((storedGame(restored).data.deck_list as Array<Record<string, unknown>>)[0]).not.toHaveProperty('leader_unit_id');
  });
  it('keeps Scenario, deck engraving, leadership and deletion separate from observed facts across restore', () => {
    const original = account();
    const observation = original.observation;
    const originalJson = JSON.stringify(observation);
    const runeIds = original.snapshot.runes.filter((rune) => rune.occupiedId === '11').map((rune) => rune.id);
    const preset = (id: string, game = original) => readPresets(game.data, []).find((entry) => entry.id === id)!;
    let changed = engraveImportedGame(original, preset(scenarioPresetId), '12', runeIds);
    changed = engraveImportedGame(changed, preset('deck-1-1', changed), '11', runeIds);
    changed = leadGamePreset(changed, preset('deck-1-1', changed), '12');
    changed = deleteGamePreset(changed, preset('deck-1-2', changed));
    const effective = withAccountSnapshot(changed);
    const stored = storedGame(effective);
    expect(JSON.stringify(observation)).toBe(originalJson);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(stored.data).toBe(observation);
    expect(stored.localChanges?.scenarioRuneOwners).toBeDefined();
    expect(stored.localChanges?.gamePresets?.['deck-1-1']).toBeDefined();
    expect(stored.localChanges?.gamePresets?.['deck-1-2']).toBeNull();
    const restored = readStoredGame(structuredClone(stored))!;
    expect(restored.data).toEqual(effective.data);
    expect(restored.snapshot.runes).toEqual(effective.snapshot.runes);
    expect(restored.observation).toEqual(observation);
    expect(storedGame(restored)).toEqual(stored);
  });

  it('drops a malformed local context without losing other contexts or rune choices', () => {
    const original = account();
    const stored = storedGame(original);
    const restored = readStoredGame({ ...stored, localChanges: {
      gamePresets: { 'deck-1-1': { positions: 'bad' }, 'deck-1-2': null },
      scenarioRuneOwners: { '5001': '12' },
    } })!;
    expect(readPresets(restored.data, []).some((preset) => preset.id === 'deck-1-1')).toBe(true);
    expect(readPresets(restored.data, []).some((preset) => preset.id === 'deck-1-2')).toBe(false);
    expect(restored.snapshot.runes.find((rune) => rune.id === '5001')?.occupiedId).toBe('12');
  });

  it('rebuilds capture metadata even when the physical collections have not changed', () => {
    const original = account();
    const coverage = { complete: false, misses: [{ command: 'test', cause: 'unread' as const }] };
    const current = withAccountSnapshot({ ...original, fileName: 'second.json', importedAt: '2026-11-14T00:00:00Z', coverage });
    expect(current.snapshot.source).toEqual({ kind: 'file', fileName: 'second.json' });
    expect(current.snapshot.coverage).toEqual(coverage);
    expect(current.snapshot.importedAt).toBe('2026-11-14T00:00:00Z');
  });
});
