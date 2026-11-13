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
    const pages = ['artifact-list', 'artifact-maximum-values', 'best-artifact-for-monster', 'best-monster-for-artifact',
      'craft-item-best-use', 'gems-section', 'monster-stats', 'monster-storage', 'relic-list', 'relic-monster-list', 'rune-recommendations'];
    for (const page of pages) {
      const source = readFileSync(`app/components/${page}.tsx`, 'utf8');
      expect(source, page).toContain("from '../lib/filter-selection'");
      expect(source, page).not.toMatch(/if\s*\(\s*!show(?:Inventory|Storage|Engraved)\s*&&/);
    }
  });
});
