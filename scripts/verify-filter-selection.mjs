import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterIncludes, filterIncludesAny, filterPair } from '../app/lib/filter-selection.ts';

const options = ['inventory', 'storage', 'shrine'];
for (let mask = 0; mask < 8; mask += 1) {
  const selected = options.filter((_, index) => mask & (1 << index));
  for (const value of [...options, null, 'unclassified']) {
    const expected = mask === 0 || mask === 7 || selected.includes(value);
    assert.equal(filterIncludes(selected, value, options), expected);
    assert.equal(filterIncludesAny(selected, value === null ? [] : [value], options), expected);
  }
}
assert.equal(filterIncludesAny(['storage'], ['inventory', 'storage'], options), true);
assert.equal(filterIncludesAny(['shrine'], ['inventory', 'storage'], options), false);
for (const first of [false, true]) for (const second of [false, true]) for (const inFirst of [false, true]) {
  assert.equal(filterPair(inFirst, first, second), first === second || (inFirst ? first : second));
}
const pages = ['artifact-list', 'artifact-maximum-values', 'best-artifact-for-monster', 'best-monster-for-artifact',
  'craft-item-best-use', 'gems-section', 'monster-stats', 'monster-storage', 'relic-list', 'relic-monster-list', 'rune-recommendations'];
for (const page of pages) {
  const source = readFileSync(`app/components/${page}.tsx`, 'utf8');
  assert.ok(source.includes("from '../lib/filter-selection'"), `${page} does not read the shared rule`);
  assert.doesNotMatch(source, /if\s*\(\s*!show(?:Inventory|Storage|Engraved)\s*&&/, `${page} carries an exclusive Location rule`);
}
console.log(`PASS: empty, partial and complete inclusive selections agree across ${pages.length} workspaces, including multi-location and unstated fields.`);
