import { describe, expect, it } from 'vitest';
import { validateGameFile } from './game-export';

const rune = {
  rune_id: 101, set_id: 1, slot_no: 1, class: 6, rank: 5, extra: 5, upgrade_curr: 0,
  occupied_type: 2, occupied_id: 0, pri_eff: [3, 22], prefix_eff: [0, 0], sec_eff: [],
};
const minimalExport = () => ({
  unit_list: [{ unit_id: 1, unit_master_id: 10101 }],
  runes: [rune],
});

describe('game export validation issues', () => {
  it('reports no issues for a valid minimal export', () => {
    const report = validateGameFile(minimalExport());

    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('locates an unreadable rune and preserves its id', () => {
    const report = validateGameFile({
      ...minimalExport(),
      runes: [rune, { ...rune, rune_id: 102 }, { ...rune, rune_id: 39184720, set_id: 999 }],
    });

    expect(report.valid).toBe(false);
    expect(report.issues[0]).toMatchObject({
      code: 'unreadable-rune', sourcePath: 'runes[2]', entityId: '39184720',
    });
    expect(report.message).toBe('This file contains a rune JASWA cannot read (runes[2], rune_id 39184720).');
  });

  it('locates the second record with a duplicate unit id', () => {
    const report = validateGameFile({
      ...minimalExport(),
      unit_list: [{ unit_id: 1, unit_master_id: 10101 }, { unit_id: 1, unit_master_id: 10102 }],
    });

    expect(report.valid).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: 'unreadable-monster', sourcePath: 'unit_list[1]', entityId: '1' });
    expect(report.issues[0].explanation).toContain('duplicated');
  });

  it('reports a non-object root', () => {
    const report = validateGameFile(null);

    expect(report.valid).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: 'not-an-object', sourcePath: '$' });
  });
});