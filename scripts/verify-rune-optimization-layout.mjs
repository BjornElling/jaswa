/**
 * The Rune Optimization shader must read exactly what the backend writes.
 *
 * The same guard as `verify-rune-chance-layout.mjs`, for the same failure: a misread
 * buffer is not rejected by WebGPU, because every offset is inside the buffer and
 * every value is a number. Here that would be a shortlist computed from the wrong
 * accumulators — a card that quietly leaves the best build off it — and the search
 * would never look at that build again.
 *
 * Neither side writes an offset of its own: both take them from
 * `rune-optimization-layout.ts`, and the shader interpolates them. This confirms that
 * every constant the layout declares reaches the shader with its value, that the
 * accumulator and figure positions are the stat sheet's own, that the bindings are the
 * four inputs and one output the backend uploads in that order, and that the shader
 * has not grown a bare numeric index into a buffer.
 *
 * `verify-rune-optimization-card.mjs` is what executes the shader; this is what holds
 * it when no card is at hand.
 */
import assert from 'node:assert/strict';
import { effectSlot, effectSlotCount, targetFigureCount, targetFigureKeys } from '../app/lib/monster-stats.ts';
import { runeOptimizationShader } from '../app/lib/compute/webgpu/rune-optimization-shader.ts';
import {
  optimizationLanes, questionBarAt, questionFloorsAt, questionLength, questionRankAt, rangeStride,
  runeOptimizationConstants, runeOptimizationFloatConstants, survivorBytes, survivorCapacity, survivorStride, survivorsAt,
} from '../app/lib/compute/webgpu/rune-optimization-layout.ts';

/* 1. The question fits its length, and the stat sheet's positions are the ones declared. */
assert.ok(questionBarAt < questionLength, `the question ends at ${questionBarAt} but is ${questionLength} long`);
assert.equal(questionFloorsAt + targetFigureCount, questionRankAt, 'the floors run into the rank field');
assert.equal(runeOptimizationConstants.ACC_STRIDE, effectSlotCount, 'a candidate is not the stat sheet\'s twelve accumulators');
for (const [name, slot] of Object.entries(effectSlot)) {
  const declared = `ACC_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  assert.equal(runeOptimizationConstants[declared], slot, `${declared} is not the stat sheet's ${name}`);
}
targetFigureKeys.forEach((key, at) => {
  const declared = `FIGURE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  assert.equal(runeOptimizationConstants[declared], at, `${declared} is not figure ${at} (${key})`);
});
assert.equal(rangeStride, 4, 'a range is two groups, a start and a count each');
assert.equal(survivorStride, 2, 'a survivor is a block and a pair');
assert.equal(survivorBytes, (survivorsAt + survivorCapacity * survivorStride) * 4, 'the answer buffer is not the size the survivors need');

/* 2. Every constant the layout declares reaches the shader, once, with its value — and is read. */
for (const [name, value] of Object.entries(runeOptimizationConstants)) {
  const declared = new RegExp(`^const ${name}: u32 = (\\d+)u;$`, 'm').exec(runeOptimizationShader);
  assert.ok(declared, `the shader does not declare ${name}`);
  assert.equal(Number(declared[1]), value, `the shader declares ${name} as ${declared[1]}, not ${value}`);
  const uses = runeOptimizationShader.split(new RegExp(`\\b${name}\\b`)).length - 1;
  assert.ok(uses >= 2, `the shader declares ${name} but never reads it`);
}
for (const [name, value] of Object.entries(runeOptimizationFloatConstants)) {
  const declared = new RegExp(`^const ${name}: f32 = ([0-9.e-]+);$`, 'm').exec(runeOptimizationShader);
  assert.ok(declared, `the shader does not declare ${name}`);
  assert.equal(Number(declared[1]), value, `the shader declares ${name} as ${declared[1]}, not ${value}`);
  assert.ok(runeOptimizationShader.split(name).length - 1 >= 2, `the shader declares ${name} but never reads it`);
}

/* 3. The workgroup size on the entry point is the one the backend dispatches. */
const workgroup = /@compute @workgroup_size\((\d+)\)/.exec(runeOptimizationShader);
assert.ok(workgroup, 'the shader has no compute entry point');
assert.equal(Number(workgroup[1]), optimizationLanes, 'the shader runs a different number of lanes than a block is given');
assert.equal(runeOptimizationConstants.WORKGROUP_SIZE, optimizationLanes, 'the index preamble and the entry point disagree');

/* 4. The bindings the backend uploads, in the order it uploads them. */
const bindings = [...runeOptimizationShader.matchAll(/@group\(0\) @binding\((\d+)\) var<storage, (read|read_write)> (\w+)/g)]
  .map(([, index, access, name]) => ({ index: Number(index), access, name }));
assert.deepEqual(bindings, [
  { index: 0, access: 'read', name: 'question' },
  { index: 1, access: 'read', name: 'candidates' },
  { index: 2, access: 'read', name: 'bases' },
  { index: 3, access: 'read', name: 'ranges' },
  { index: 4, access: 'read_write', name: 'survivors' },
], 'the shader\'s bindings are not the four inputs and one output the backend uploads');

/* 5. No bare numeric index into a buffer. A field's position may only be named. */
const bare = [...runeOptimizationShader.matchAll(/(question|candidates|bases|ranges|survivors)\[[^\]]*?[+-]\s*\d+u?\s*\]/g)];
assert.deepEqual(bare.map(([text]) => text), [], 'the shader indexes a buffer by a literal offset instead of a named one');

console.log(`PASS: the optimization shader reads the ${Object.keys(runeOptimizationConstants).length} offsets the backend`
  + ' writes, and its accumulators and figures are the stat sheet\'s own.');
