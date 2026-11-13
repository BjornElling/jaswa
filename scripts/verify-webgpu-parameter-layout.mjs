/**
 * The scoring shader's uniform block, checked against the bytes the backend
 * uploads into it.
 *
 * This is worth a script because the failure has no symptom a reader would
 * recognise. WebGPU does not throw when a uniform binding is smaller than the
 * struct it feeds: it rejects the bind group, drops the pass, and hands back the
 * output buffer untouched — every score zero. The recommendation view then
 * reports that no artifact scores above 0 % for any monster, while the CPU
 * columns beside it stay correct, so the calculation looks half-working rather
 * than switched off. A `padding: vec3<f32>` member added to the struct did
 * exactly this: vec3 aligns to 16 bytes, which pushed the block to 48 against
 * the 32 uploaded.
 *
 * Nothing else can catch it. The shader compiles, the types agree, and the
 * browsers Playwright drives here expose no WebGPU at all, so every existing
 * check runs the CPU reference and passes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shader = readFileSync(new URL('../app/platform/gpu/shaders/artifact-score-shader.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../app/platform/gpu/backends/webgpu-artifact-score-backend.ts', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/platform/gpu/layouts/artifact-score-layout.ts', import.meta.url), 'utf8');

/* WGSL's own alignment and size table, for the types this struct may use. A
   vec3 is the trap: it is 12 bytes wide but aligns to 16. */
const types = {
  u32: { align: 4, size: 4, writer: 'setUint32' },
  i32: { align: 4, size: 4, writer: 'setInt32' },
  f32: { align: 4, size: 4, writer: 'setFloat32' },
  'vec2<f32>': { align: 8, size: 8, writer: null },
  'vec3<f32>': { align: 16, size: 12, writer: null },
  'vec4<f32>': { align: 16, size: 16, writer: null },
};

const roundUp = (alignment, value) => Math.ceil(value / alignment) * alignment;

const structMatch = shader.match(/struct Parameters \{([^}]*)\}/);
assert.ok(structMatch, 'the shader must declare a Parameters struct');
const members = structMatch[1]
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, '').trim().replace(/,$/, ''))
  .filter(Boolean)
  .map((line) => {
    const [name, type] = line.split(':').map((part) => part.trim());
    assert.ok(types[type], `Parameters.${name} has type "${type}", which this check does not know`);
    return { name, type };
  });
assert.ok(members.length > 0, 'the Parameters struct must have members');

/* The uniform address space rounds a struct's alignment up to 16, and its size
   up to that alignment. That is what makes five scalars occupy 32 bytes. */
let offset = 0;
for (const member of members) {
  const { align, size } = types[member.type];
  member.offset = roundUp(align, offset);
  offset = member.offset + size;
}
const structAlign = roundUp(16, Math.max(...members.map((member) => types[member.type].align)));
const structSize = roundUp(structAlign, offset);

const bufferMatch = backend.match(/const parameters = new ArrayBuffer\((\d+)\)/);
assert.ok(bufferMatch, 'the backend must allocate its parameter buffer as an ArrayBuffer');
const bufferSize = Number(bufferMatch[1]);
assert.equal(bufferSize, structSize,
  `the parameter buffer is ${bufferSize} bytes and the uniform block needs ${structSize}: `
  + 'a smaller binding is rejected silently and every score reads back as zero');

/* Every member is written, at its own offset, with the writer its type asks
   for. A member the upload forgets would arrive as zero — an acceptable worth
   of nothing, or a significance band the shader never applies. */
const writes = [...backend.matchAll(/parameterView\.(set\w+)\((\d+),/g)]
  .map(([, writer, at]) => ({ writer, offset: Number(at) }));
for (const member of members) {
  const expected = types[member.type].writer;
  assert.ok(expected, `Parameters.${member.name} is a ${member.type}, which the upload has no writer for`);
  const write = writes.find((entry) => entry.offset === member.offset);
  assert.ok(write, `nothing is written at offset ${member.offset}, where Parameters.${member.name} sits`);
  assert.equal(write.writer, expected,
    `Parameters.${member.name} is a ${member.type} but is written with ${write.writer}`);
}
assert.equal(writes.length, members.length,
  'the upload writes a value the Parameters struct does not declare');

/**
 * **The workgroup size, which three readers have to agree on.**
 *
 * `@workgroup_size`, the `WORKGROUP_SIZE` the dispatch preamble multiplies by, and
 * the divisor the backend counts workgroups with. It is the same class of failure as
 * the uniform block above and just as quiet: past 4,194,240 pairs the dispatch splits
 * into a second dimension, and a mismatch there attributes every score in the second
 * row to the wrong artifact/monster pair — in bounds, a real number, and nothing to
 * report it. All three now interpolate one exported constant, and this confirms that
 * none of them has grown a literal again.
 */
const lanesMatch = layout.match(/export const artifactScoreLanes = (\d+);/);
assert.ok(lanesMatch, 'the artifact layout must export artifactScoreLanes');
const lanes = Number(lanesMatch[1]);
assert.ok(new RegExp(`const WORKGROUP_SIZE: u32 = \\$\\{artifactScoreLanes\\}u;`).test(shader),
  'WORKGROUP_SIZE must interpolate artifactScoreLanes rather than restate it');
assert.ok(/@compute @workgroup_size\(\$\{artifactScoreLanes\}\)/.test(shader),
  '@workgroup_size must interpolate artifactScoreLanes rather than restate it');
assert.ok(/workgroups: Math\.ceil\(pairCount \/ artifactScoreLanes\)/.test(backend),
  'the backend must count workgroups with artifactScoreLanes rather than a literal');

console.log('WebGPU scoring parameters');
for (const member of members) {
  console.log(`  ${String(member.offset).padStart(3)}  ${member.name} (${member.type})`);
}
console.log(`  block ${structSize} bytes, upload ${bufferSize} bytes, ${writes.length} values written.`);
console.log(`  ${lanes} lanes per workgroup, in the shader and the dispatch alike.`);
console.log('All checks passed.');
