import { describe, expect, it } from 'vitest';
import { createImportedGame, validateGameFile } from './game-export';
import { monsterBaseStats } from '../domain/combat/monster-stats';
import { referenceMonsters } from '../domain/reference/rune-reference-stats';
import gearFixture from '../../tests/fixtures/monster-overlay-account.json';
import relicFixture from '../../tests/fixtures/relic-account.json';

const rune = {
  rune_id: 101, set_id: 1, slot_no: 1, class: 6, rank: 5, extra: 5, upgrade_curr: 0,
  occupied_type: 2, occupied_id: 0, pri_eff: [3, 22], prefix_eff: [0, 0], sec_eff: [],
};
const stats = { con: 600, atk: 600, def: 600, spd: 100, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0 };
const minimalExport = () => ({
  unit_list: [{ ...stats, unit_id: 1, unit_master_id: 10101 }],
  runes: [rune],
});

describe('game export validation issues', () => {
  it.each(['1', '01'])('refuses a source unit identity %s that numeric preset readers cannot resolve', (unit_id) => {
    expect(validateGameFile({ ...minimalExport(), unit_list: [{ ...minimalExport().unit_list[0], unit_id }] }).valid).toBe(false);
  });
  it.each([undefined, 'invalid', -5, NaN, Infinity, 0])('refuses unusable monster speed %s before calculation', (spd) => {
    const unit = { ...minimalExport().unit_list[0], unit_level: 40, spd };
    expect(validateGameFile({ ...minimalExport(), unit_list: [unit] }).issues[0])
      .toMatchObject({ code: 'unreadable-monster', sourcePath: 'unit_list[0]', entityId: '1' });
    expect(() => monsterBaseStats(unit)).toThrow(/unavailable/);
    expect(referenceMonsters({ unit_list: [unit] })).toEqual([]);
  });

  it('keeps an awarded Rainbowmon and its zero base speed', () => {
    const data = minimalExport();
    const rainbowmon = {
      ...stats, unit_id: 2, unit_master_id: 14314, unit_level: 1, class: 4,
      con: 4, atk: 4, def: 4, spd: 0, critical_rate: 0, critical_damage: 0, resist: 0,
    };
    const account = { ...data, unit_list: [...data.unit_list, rainbowmon] };
    const report = validateGameFile(account);
    expect(report.valid).toBe(true);
    expect(createImportedGame('test.json', account, report).data.unit_list).toContainEqual(expect.objectContaining(rainbowmon));
    expect(monsterBaseStats(rainbowmon)[3]).toBe(0);
    expect(validateGameFile({ ...account, unit_list: [{ ...rainbowmon, spd: undefined }] }).valid).toBe(false);
  });

  it('refuses contradictory physical copies with both source paths', () => {
    const engraved = { ...rune, occupied_type: 1, occupied_id: 1 };
    const data = { ...minimalExport(), unit_list: [{ ...minimalExport().unit_list[0], runes: [engraved] }],
      runes: [{ ...engraved, upgrade_curr: 12 }] };
    const report = validateGameFile(data);
    expect(report.valid).toBe(false);
    expect(report.issues[0].explanation).toContain('runes[0] and unit_list[0].runes[0]');
  });

  it('derives monster gear from the canonical physical collection', () => {
    const engraved = { ...rune, occupied_type: 1, occupied_id: 1 };
    const data = { ...minimalExport(), unit_list: [{ ...minimalExport().unit_list[0], runes: [{ ...engraved }] }], runes: [engraved] };
    const game = createImportedGame('test.json', data, validateGameFile(data));
    expect((game.data.unit_list as Array<{ runes: unknown[] }>)[0].runes[0]).toBe((game.data.runes as unknown[])[0]);
  });

  it('compares the artifact main magnitude even though scoring deliberately drops it', () => {
    const data = structuredClone(gearFixture);
    const artifact = data.unit_list[0].artifacts?.[0];
    if (!artifact) throw new Error('The fixture needs an engraved artifact.');
    const changed = { ...artifact, pri_effect: [artifact.pri_effect[0], artifact.pri_effect[1] + 1] };
    const report = validateGameFile({ ...data, artifacts: [changed] });
    expect(report.valid).toBe(false);
    expect(report.issues[0].explanation).toContain('physical item facts disagree');
  });

  it('refuses contradictory relic copies instead of hiding one behind its shared identity', () => {
    const data = structuredClone(relicFixture);
    data.relics[1] = { ...data.relics[0], rid: data.relics[1].rid };
    const report = validateGameFile(data);
    expect(report.valid).toBe(false);
    expect(report.issues[0].explanation).toContain('physical item facts disagree');
  });
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
      unit_list: [{ ...stats, unit_id: 1, unit_master_id: 10101 }, { ...stats, unit_id: 1, unit_master_id: 10102 }],
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
