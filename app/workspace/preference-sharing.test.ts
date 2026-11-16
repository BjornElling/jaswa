import { describe, expect, it } from 'vitest';
import { mergePreferenceChoices, PreferenceConflict, sameChoice } from './preference-sharing';

describe('sharing individual preference choices', () => {
  it('merges independent fields, deletions and empty lists while retaining unknown shared fields', () => {
    const base = { general: { clock: '12', numbers: 'us' }, roles: [1], monsters: { a: { name: 'A' } } };
    const local = { general: { clock: '24', numbers: 'us' }, roles: [], monsters: {} };
    const remote = { ...base, general: { clock: '12', numbers: 'eu' }, futureChoice: { x: 42 } };
    expect(mergePreferenceChoices(base, local, base, remote)).toEqual({
      general: { clock: '24', numbers: 'eu' }, roles: [], monsters: {}, futureChoice: { x: 42 },
    });
  });

  it('refuses divergent edits to one choice, including ordered lists and deletion against an edit', () => {
    expect(() => mergePreferenceChoices(1, 2, 1, 3)).toThrow(PreferenceConflict);
    expect(() => mergePreferenceChoices([1], [], [1], [2])).toThrow(PreferenceConflict);
    expect(() => mergePreferenceChoices({ a: 1 }, {}, { a: 1 }, { a: 2 })).toThrow(PreferenceConflict);
  });

  it('does not mistake object key order for a change or cap oversized values', () => {
    expect(sameChoice({ a: 1, b: [] }, { b: [], a: 1 })).toBe(true);
    expect(mergePreferenceChoices({ x: 1 }, { x: 999999 }, { x: 1 }, { x: 1 })).toEqual({ x: 999999 });
  });

  it('merges different choices added under a formerly absent group', () => {
    expect(mergePreferenceChoices({}, { scenario: { a: { name: 'A' } } }, {}, { scenario: { b: { name: 'B' } } }))
      .toEqual({ scenario: { a: { name: 'A' }, b: { name: 'B' } } });
  });

  it('retains unknown shared fields when the shared copy has not changed since acknowledgement', () => {
    const localBase = { general: { clock: '12' }, updatedAt: 'before' };
    const sharedBase = { general: { clock: '12', future: 'keep' }, futureSection: [42], updatedAt: 'before' };
    expect(mergePreferenceChoices(localBase, { general: { clock: '24' }, updatedAt: 'after' }, sharedBase, sharedBase))
      .toEqual({ general: { clock: '24', future: 'keep' }, futureSection: [42], updatedAt: 'before' });
  });

  it('merges role and preset fields by identity without losing another build’s choices inside a list', () => {
    const base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const raw = [{ id: 'a', name: 'A', futureChoice: 42 }, { id: 'b', name: 'B' }];
    const local = [{ id: 'a', name: 'Renamed' }, { id: 'b', name: 'B' }];
    expect(mergePreferenceChoices(base, local, raw, raw)).toEqual([
      { id: 'a', name: 'Renamed', futureChoice: 42 }, { id: 'b', name: 'B' },
    ]);
    expect(mergePreferenceChoices(base, local, raw, [{ ...raw[1], name: 'Remote name' }, raw[0]])).toEqual([
      { id: 'b', name: 'Remote name' }, { id: 'a', name: 'Renamed', futureChoice: 42 },
    ]);
  });

  it('refuses an edited record deleted remotely, incompatible orders and ambiguous unkeyed records', () => {
    const base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(() => mergePreferenceChoices(base, [{ ...base[0], name: 'Changed' }, base[1]], base, [base[1]])).toThrow(PreferenceConflict);
    expect(() => mergePreferenceChoices(base, [base[1], base[0]], base, [base[0]])).toThrow(PreferenceConflict);
    expect(() => mergePreferenceChoices([{ name: 'A' }], [{ name: 'B' }], [{ name: 'A', future: true }], [{ name: 'A', future: true }]))
      .toThrow(PreferenceConflict);
  });
});
