import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterIncludes, filterIncludesAny, filterPair } from './filter-selection';

describe('inclusive filter selection', () => {
  it('treats empty and complete selections as unrestricted', () => {
    const options = ['inventory', 'storage', 'shrine'];
    for (let mask = 0; mask < 8; mask += 1) {
      const selected = options.filter((_, index) => mask & (1 << index));
      for (const value of [...options, null, 'unclassified']) {
        const expected = mask === 0 || mask === 7 || selected.includes(value as string);
        expect(filterIncludes(selected, value, options)).toBe(expected);
        expect(filterIncludesAny(selected, value === null ? [] : [value], options)).toBe(expected);
      }
    }
    expect(filterIncludesAny(['storage'], ['inventory', 'storage'], options)).toBe(true);
    expect(filterIncludesAny(['shrine'], ['inventory', 'storage'], options)).toBe(false);
  });

  it('applies the same rule to two stored booleans', () => {
    for (const first of [false, true]) for (const second of [false, true]) for (const inFirst of [false, true]) {
      expect(filterPair(inFirst, first, second)).toBe(first === second || (inFirst ? first : second));
    }
  });

  it('keeps each workspace on the shared rule', () => {
    const pages = ['artifacts/artifact-list', 'artifacts/artifact-maximum-values', 'artifacts/best-artifact-for-monster',
      'artifacts/best-monster-for-artifact', 'craft-advice/craft-item-best-use', 'craft-advice/gems-section', 'monsters/monster-stats',
      'monsters/monster-storage', 'relics/relic-list', 'relics/relic-monster-list', 'rune-cleanup/rune-recommendations'];
    for (const page of pages) {
      const source = readFileSync(`app/features/${page}.tsx`, 'utf8');
      expect(source, page).toContain("from '../../domain/shared/filter-selection'");
      expect(source, page).not.toMatch(/if\s*\(\s*!show(?:Inventory|Storage|Engraved)\s*&&/);
    }
  });
});
