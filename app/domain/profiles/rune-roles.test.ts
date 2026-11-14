import { describe, expect, it } from 'vitest';
import { createRuneRole, readRuneRoles } from './rune-roles';

describe('rune role preference reading', () => {
  it('keeps blank targets absent, explicit zero targets present, and salvages choices by entry', () => {
    const role = createRuneRole('Zero bomber');
    const [read] = readRuneRoles([{
      ...role,
      sets: {
        preferred: ['Violent', 'Unknown set', 'Violent'],
        acceptable: ['Blade', 'Violent', 'Unknown set', 'Blade'],
      },
      slots: {
        ...role.slots,
        slot2: {
          preferred: ['Spd', 'Unknown main', 'Spd'],
          acceptable: ['HP%', 'Spd', 'HP%'],
        },
      },
      targets: { hp: 0, atk: 0, def: 0, criRate: 0, criDmg: 0 },
    }]);

    expect(read.sets).toEqual({ preferred: ['Violent'], acceptable: ['Blade'] });
    expect(read.slots.slot2).toEqual({ preferred: ['Spd'], acceptable: ['HP%'] });
    expect(read.targets).toMatchObject({ hp: 0, atk: 0, def: 0, criRate: 0, criDmg: 0, dmg: 0, ehp: 0, ehpD: 0 });
    expect(read.targets).not.toHaveProperty('spd');
  });

  it('uses the blank choice only when a choice object itself is malformed', () => {
    const role = createRuneRole('Partial choices');
    const [read] = readRuneRoles([{
      ...role,
      sets: { preferred: ['Violent'], acceptable: 'not a list' },
      slots: { ...role.slots, slot4: { preferred: ['CtD%'], acceptable: null } },
    }]);

    expect(read.sets).toEqual(role.sets);
    expect(read.slots.slot4).toEqual(role.slots.slot4);
  });
});
