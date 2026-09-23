/**
 * The Rune Clean-up chance shader must read exactly what the backend writes.
 *
 * This is the WebGPU failure the runtime cannot report. A rejected pass is caught by
 * the validation scope and falls back to the processor; a *misread* buffer is not
 * rejected at all, because every offset is inside the buffer and every value is a
 * number. The card would answer with a matrix of plausible-looking percentages
 * computed from the wrong fields, and nothing on screen would say so.
 *
 * The defence is that neither side writes an offset of its own: both take them from
 * `rune-chance-layout.ts`, and the shader interpolates them rather than restating
 * them. This check confirms that is still true — that every constant the layout
 * declares actually reaches the shader, that no record overruns its own stride, and
 * that the shader has not grown a bare numeric index into a record.
 *
 * `scripts/verify-webgpu-parameter-layout.mjs` is the same idea for the artifact
 * scorer's uniform block, and its header says why that one exists: the browsers
 * Playwright drives here expose no WebGPU at all, so nothing else in the repository
 * ever executes a shader.
 */
import assert from 'node:assert/strict';
import { runeChanceShader } from '../app/lib/compute/webgpu/rune-chance-shader.ts';
import {
  chanceLanes, gemEntryStride, maxGemOptions, maxLines, maxPool, poolEntryStride,
  runeChanceConstants, runeRecordEnd, runeStride, scoringRecordEnd, scoringStride, statIdBound,
} from '../app/lib/compute/webgpu/rune-chance-layout.ts';

/* 1. Every record fits inside the stride the backend allocates for it. */
assert.ok(runeRecordEnd <= runeStride,
  `a rune record ends at ${runeRecordEnd} but the stride is ${runeStride}`);
assert.ok(scoringRecordEnd <= scoringStride,
  `a scoring record ends at ${scoringRecordEnd} but the stride is ${scoringStride}`);
assert.equal(statIdBound, 13, 'the effect ids run 1 to 12, so a table of them is 13 long');
assert.ok(maxPool >= 11 && maxGemOptions >= 11 && maxLines >= 4,
  'a slot can offer eleven effect ids and a rune ends with four lines');
assert.equal(gemEntryStride, 3, 'a Gem option is an effect id, a value and a bare roll');
assert.equal(poolEntryStride, 3, 'a pool entry is an effect id and an interval');

/* 2. Every constant the layout declares reaches the shader, once, with its value. */
for (const [name, value] of Object.entries(runeChanceConstants)) {
  const declared = new RegExp(`^const ${name}: u32 = (\\d+)u;$`, 'm').exec(runeChanceShader);
  assert.ok(declared, `the shader does not declare ${name}`);
  assert.equal(Number(declared[1]), value, `the shader declares ${name} as ${declared[1]}, not ${value}`);
  /* Declared is not enough: a constant nobody reads is a field the shader has
     quietly stopped honouring. Two mentions means the declaration and one use. */
  const uses = runeChanceShader.split(name).length - 1;
  assert.ok(uses >= 2, `the shader declares ${name} but never reads it`);
}

/* 3. The workgroup size on the entry point is the one the backend dispatches. */
const workgroup = /@compute @workgroup_size\((\d+)\)/.exec(runeChanceShader);
assert.ok(workgroup, 'the shader has no compute entry point');
assert.equal(Number(workgroup[1]), chanceLanes,
  'the shader runs a different number of lanes than the backend counts back');
assert.equal(runeChanceConstants.WORKGROUP_SIZE, chanceLanes,
  'the index preamble and the entry point disagree about the workgroup size');

/* 4. The bindings the backend uploads, in the order it uploads them. */
const bindings = [...runeChanceShader.matchAll(/@group\(0\) @binding\((\d+)\) var<storage, (read|read_write)> (\w+)/g)]
  .map(([, index, access, name]) => ({ index: Number(index), access, name }));
assert.deepEqual(bindings, [
  { index: 0, access: 'read', name: 'runes' },
  { index: 1, access: 'read', name: 'scorings' },
  { index: 2, access: 'read', name: 'jobs' },
  { index: 3, access: 'read', name: 'targets' },
  { index: 4, access: 'read_write', name: 'counts' },
], 'the shader\'s bindings are not the four inputs and one output the backend uploads');

/* 5. No bare numeric index into a record.
   A field's position may only be named, never written out — `runes[runeAt + 9u]`
   compiles and reads the wrong thing forever. Reading one step on from a named
   offset is how the interval halves of a line are read, and that is allowed. */
const bare = [...runeChanceShader.matchAll(/(runes|scorings|jobs)\[[^\]]*?[+-]\s*(\d+)u/g)]
  .filter(([, , offset]) => Number(offset) > 4);
assert.deepEqual(bare.map(([text]) => text), [],
  'the shader indexes a record by a literal offset instead of a named one');

console.log(`PASS: the chance shader reads the ${Object.keys(runeChanceConstants).length} offsets`
  + ' the backend writes, and no record overruns its stride.');
