import { artifactPropertyAvailability, scoredArtifactProperties } from '../artifact-score-schema';
import type { ArtifactScoreRequest } from '../artifact-score-protocol';
import { artifactScoreGpuLayout, artifactScoreShader } from '../webgpu/artifact-score-shader';
import type { ArtifactScoreBackend } from './artifact-score-backend';

type GpuBuffer = {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type GpuDevice = {
  queue: { writeBuffer(buffer: GpuBuffer, offset: number, data: AllowSharedBufferSource): void; submit(commands: unknown[]): void };
  lost: Promise<unknown>;
  pushErrorScope(filter: 'validation'): void;
  popErrorScope(): Promise<{ message: string } | null>;
  createBuffer(descriptor: { size: number; usage: number }): GpuBuffer;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipelineAsync(descriptor: unknown): Promise<unknown>;
  createBindGroup(descriptor: unknown): unknown;
  createCommandEncoder(): {
    beginComputePass(): { setPipeline(pipeline: unknown): void; setBindGroup(index: number, group: unknown): void; dispatchWorkgroups(count: number): void; end(): void };
    copyBufferToBuffer(source: GpuBuffer, sourceOffset: number, target: GpuBuffer, targetOffset: number, size: number): void;
    finish(): unknown;
  };
};
type GpuAdapter = { requestDevice(): Promise<GpuDevice> };
type WebGpu = { requestAdapter(options?: { powerPreference: 'high-performance' }): Promise<GpuAdapter | null> };

const bufferUsage = { mapRead: 1, copySource: 4, copyDestination: 8, uniform: 64, storage: 128 } as const;

/* Class codes run 0 (Intangible) through 5 (Dark), the widest of the two
   numberings, so one table shape serves both categories. */
const equipClassRows = 6;

function alignedByteLength(byteLength: number): number {
  return Math.max(4, Math.ceil(byteLength / 4) * 4);
}

function floatBuffer(values: number[]): Float32Array {
  return new Float32Array(values);
}

/**
 * WebGPU is kept behind the same backend contract as the CPU reference. The
 * device and pipeline live for the worker's lifetime; calculation calls only
 * upload the changing packed matrix and read back its scores.
 */
export class WebGpuArtifactScoreBackend implements ArtifactScoreBackend {
  readonly type = 'webgpu' as const;
  private device: GpuDevice | undefined;
  private pipeline: unknown;
  private lost = false;

  async initialize(): Promise<void> {
    const gpu = (self.navigator as Navigator & { gpu?: WebGpu }).gpu;
    if (!gpu) throw new Error('WebGPU is unavailable in this browser.');
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('The browser did not provide a WebGPU adapter.');
    const device = await adapter.requestDevice();
    device.lost.then(() => { this.lost = true; });
    const shaderModule = device.createShaderModule({ code: artifactScoreShader });
    this.pipeline = await device.createComputePipelineAsync({
      layout: 'auto', compute: { module: shaderModule, entryPoint: 'main' },
    });
    this.device = device;
  }

  async calculate(request: ArtifactScoreRequest): Promise<Float32Array> {
    if (!this.device || !this.pipeline || this.lost) throw new Error('The WebGPU device is not ready.');
    const device = this.device;
    /* The order here *is* the shader's stride layout — see `artifactStride` and
       `monsterStride` in artifact-score-shader.ts. A field added to one and not
       the other misreads every row after it, silently. */
    const artifactData = floatBuffer(request.artifacts.flatMap((artifact) => [
      artifact.category, artifact.restriction, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subPropertyIndexes, ...artifact.subPropertyRollPoints,
      /* A stride is fixed width, so an absent list is written as the zeroes it
         means rather than omitted — one short row would misalign every row
         after it, and the scores would be wrong rather than missing. */
      ...(artifact.subPropertyValueHundredths ?? [-1, -1, -1, -1]),
    ]));
    const monsterData = floatBuffer(request.monsters.flatMap((monster) => [
      monster.element, monster.archetype, ...monster.mainPreferences,
      ...monster.subPropertyPreferences,
      ...(monster.subPropertyMinimums ?? scoredArtifactProperties.map(() => 0)),
    ]));
    /* One row of flags per equip class, indexed by the class code the artifacts
       carry, because a stone converts only the class it was engraved for. The
       table is sized to the highest class code rather than to the number of
       classes, so row 0 — the Intangible code — is simply never written and
       never read: an Intangible cannot be converted (§10.1). */
    const owned = new Int32Array(equipClassRows * scoredArtifactProperties.length);
    for (const [classCode, indexes] of Object.entries(request.ownedConversionPropertyIndexesByClass)) {
      const row = Number(classCode);
      if (!Number.isInteger(row) || row < 0 || row >= equipClassRows) continue;
      for (const propertyIndex of indexes) {
        if (propertyIndex >= 0 && propertyIndex < scoredArtifactProperties.length) {
          owned[row * scoredArtifactProperties.length + propertyIndex] = 1;
        }
      }
    }
    const parameters = new ArrayBuffer(32);
    const parameterView = new DataView(parameters);
    parameterView.setUint32(0, request.artifacts.length, true);
    parameterView.setUint32(4, request.monsters.length, true);
    parameterView.setUint32(8, request.conversionMode, true);
    parameterView.setFloat32(12, request.acceptableWorth / 100, true);
    parameterView.setFloat32(16, request.insignificantDifference, true);
    const resultByteLength = alignedByteLength(request.artifacts.length * request.monsters.length * Float32Array.BYTES_PER_ELEMENT);
    const artifacts = this.createUploadBuffer(device, artifactData, bufferUsage.storage);
    const monsters = this.createUploadBuffer(device, monsterData, bufferUsage.storage);
    const availability = this.createUploadBuffer(device, new Int32Array(artifactPropertyAvailability), bufferUsage.storage);
    const ownedProperties = this.createUploadBuffer(device, owned, bufferUsage.storage);
    const conversionRollFractions = this.createUploadBuffer(device, new Float32Array(request.conversionRollFractions), bufferUsage.storage);
    const parameterBuffer = this.createUploadBuffer(device, new Uint8Array(parameters), bufferUsage.uniform);
    const output = device.createBuffer({ size: resultByteLength, usage: bufferUsage.storage | bufferUsage.copySource });
    const readback = device.createBuffer({ size: resultByteLength, usage: bufferUsage.mapRead | bufferUsage.copyDestination });
    /* WebGPU does not throw when it rejects a binding or a pass: it drops the
       commands and leaves the output buffer as it was created, so a mismatch
       between this upload and the shader's own layout reads back as a matrix of
       zeros — a silent "no artifact fits any monster" that the interface has no
       way to tell from an answer. The scope turns that into a rejection, which
       the worker answers by falling back to the CPU reference. */
    device.pushErrorScope('validation');
    let scopeOpen = true;
    let mapped = false;
    try {
      const bindGroup = device.createBindGroup({
        layout: (this.pipeline as { getBindGroupLayout(index: number): unknown }).getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: artifacts } }, { binding: 1, resource: { buffer: monsters } },
          { binding: 2, resource: { buffer: availability } }, { binding: 3, resource: { buffer: ownedProperties } },
          { binding: 4, resource: { buffer: conversionRollFractions } }, { binding: 5, resource: { buffer: parameterBuffer } },
          { binding: 6, resource: { buffer: output } },
        ],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bindGroup);
      const pairCount = request.artifacts.length * request.monsters.length;
      pass.dispatchWorkgroups(Math.ceil(pairCount / 64));
      pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, resultByteLength);
      device.queue.submit([encoder.finish()]);
      scopeOpen = false;
      const failure = await device.popErrorScope();
      if (failure) throw new Error(`WebGPU rejected the artifact scoring pass: ${failure.message}`);
      await readback.mapAsync(bufferUsage.mapRead);
      mapped = true;
      return new Float32Array(readback.getMappedRange().slice(0, pairCount * Float32Array.BYTES_PER_ELEMENT));
    } finally {
      if (scopeOpen) void device.popErrorScope();
      if (mapped) readback.unmap();
      artifacts.destroy(); monsters.destroy(); availability.destroy(); ownedProperties.destroy(); conversionRollFractions.destroy(); parameterBuffer.destroy();
      output.destroy(); readback.destroy();
    }
  }

  dispose(): void { this.device = undefined; this.pipeline = undefined; }

  private createUploadBuffer(device: GpuDevice, data: AllowSharedBufferSource, usage: number): GpuBuffer {
    const buffer = device.createBuffer({ size: alignedByteLength(data.byteLength), usage: usage | bufferUsage.copyDestination });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }
}

export const artifactScoreWebGpuPacking = artifactScoreGpuLayout;
