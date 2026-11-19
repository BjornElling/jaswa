import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { summarizeRunePlacement, hasRunePlacement, runePlacementLabel } from '../app/domain/placements/rune-placement.ts';

const scenario = { presetId: 'scenario', unitId: '10' };
const arena = { presetId: 'arena-1', unitId: '20' };
const raid = { presetId: 'raid-1', unitId: '30' };

const none = summarizeRunePlacement([]);
assert.equal(hasRunePlacement(none), false, 'a rune with no placements is in Inventory');
assert.deepEqual(runePlacementLabel(none, () => ''), { label: 'Inventory', count: '' });

const scenarioOnly = summarizeRunePlacement([scenario]);
assert.equal(hasRunePlacement(scenarioOnly), true);
assert.deepEqual(runePlacementLabel(scenarioOnly, () => 'Kaimann'), { label: 'Kaimann', count: '' });

const shared = summarizeRunePlacement([scenario, arena, raid]);
assert.equal(hasRunePlacement(shared), true);
assert.equal(shared.count, 3);
assert.deepEqual(runePlacementLabel(shared, () => 'Kaimann'), { label: 'Kaimann', count: '(+ 2)' });

const presetOnly = summarizeRunePlacement([arena]);
assert.deepEqual(runePlacementLabel(presetOnly, () => ''), { label: 'Engraved', count: '× 1' });

/* Standard readers may list every place for their hover, but cannot each decide
   whether a rune is engraved, Scenario-owned, or how many other placements it has. */
const readers = [
  'app/features/rune-cleanup/rune-recommendations.tsx',
  'app/features/runes/rune-overlay.tsx',
  'app/features/craft-advice/craft-item-best-use.tsx',
  'app/domain/runes/cleanup/rune-cleanup-grid.ts',
  'app/domain/runes/cleanup/rune-cleanup-advice.ts',
];
for (const path of readers) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /rune-placement/, `${path} reads the canonical rune placement model`);
  assert.doesNotMatch(source, /\b(?:row\.)?places\.length\b/, `${path} does not recalculate placement count`);
  assert.doesNotMatch(source, /\bplaces\.(?:find|some|filter)\s*\(/, `${path} does not classify placements itself`);
}

const sharedLocation = readFileSync('app/ui/gear/engraved-place.tsx', 'utf8');
assert.match(sharedLocation, /runePlacementLabel/, 'rune locations use the canonical display reading');
assert.match(sharedLocation, /export function EngravedPlace\(\{ runePlacement[\s\S]*?runePlacement: RunePlacementSummary;/,
  'the rune location component accepts only the canonical summary');
assert.match(sharedLocation, /export function ArtifactEngravedPlace\(\{ places[\s\S]*?places: readonly Engraving\[\];/,
  'artifact locations keep a separate all-placements display');
assert.doesNotMatch(sharedLocation, /\bplaces\.(?:find|some|filter)\s*\(/, 'the shared location component does not classify placements itself');

const page = readFileSync('app/shell/root.tsx', 'utf8');
assert.match(page, /summarizeRunePlacement\(places\)/, 'the account boundary builds rune summaries once');
const context = readFileSync('app/ui/presets-context.ts', 'utf8');
assert.match(context, /ReadonlyMap<string, RunePlacementSummary>/, 'rune workspaces receive the canonical summary');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

const placementPredicate = /\b(?:place|entry|engraving)\.presetId\s*(?:===|!==)\s*scenarioPresetId/;
for (const path of sourceFiles('app')) {
  if (path === 'app/domain/placements/rune-placement.ts') continue;
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, placementPredicate, `${path} does not classify Scenario placements itself`);
  assert.doesNotMatch(source, /\b(?:runePlacement|placement|summary)\.(?:elsewhere\.length|scenario\s*(?:===|!==))/, `${path} reads the canonical summary instead of reclassifying it`);
}

console.log('Rune placement summary and single-source readers verified.');
