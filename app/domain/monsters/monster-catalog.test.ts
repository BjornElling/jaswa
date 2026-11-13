import { describe, expect, it } from 'vitest';
import snapshot from '../../data/swarfarm-monsters.json';
import { monsterCatalogueArchetype } from './monster-catalog';

describe('monster catalogue archetypes', () => {
  it('returns the source classification for every exact form', () => {
    for (const monster of snapshot.monsters) {
      expect(monsterCatalogueArchetype(monster.com2us_id)).toBe(monster.archetype);
    }
  });

  it('keeps an unknown form unknown', () => {
    expect(monsterCatalogueArchetype(-1)).toBeUndefined();
  });
});
