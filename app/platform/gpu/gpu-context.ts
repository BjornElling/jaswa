/**
 * **The one way JASWA talks to the graphics card.**
 *
 * Every accelerated calculation wants the same six things — an adapter, a device, a
 * compiled pipeline, some buffers uploaded, a pass dispatched, an answer read back —
 * and the first one to want them wrote all six inline. This is that plumbing, once,
 * so a second calculation is a shader and a packing function rather than another
 * hundred lines of buffer bookkeeping with its own bugs.
 *
 * ## What it is careful about
 *
 * **A rejected pass does not throw.** WebGPU drops the commands and leaves the output
 * buffer exactly as it was created, so a mismatch between what was uploaded and what
 * the shader declares reads back as a block of zeros — an answer the interface has no
 * way to tell from a real one. Every dispatch therefore runs inside a validation
 * error scope, and a rejection becomes a thrown error, which the caller answers by
 * falling back to the processor.
 *
 * **A device can be lost** — a driver reset, a laptop switching cards, a browser
 * reclaiming memory. The context notices and refuses further work rather than
 * dispatching into nothing, and the next request builds a fresh one.
 *
 * **The device is opened once.** Requesting an adapter is slow and the answer does
 * not change, so a worker that judges an account eight times over does it once. The
 * pipeline is cached on the shader's own name for the same reason.
 *
 * ## The binding convention
 *
 * Inputs occupy bindings `0…n-1` in the order they are given, and the output is
 * binding `n`. Every shader in `app/platform/gpu/shaders/` follows it, and a shader
 * that does not is rejected by the error scope above rather than answering zeros.
 */

/* Typed here rather than pulled from a package, as `hardware-acceleration.ts`
   already does for the detection half: only what is actually called is declared. */
type GpuBuffer = {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type GpuComputePass = {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(x: number, y?: number): void;
  end(): void;
};
type GpuEncoder = {
  beginComputePass(): GpuComputePass;
  copyBufferToBuffer(source: GpuBuffer, sourceOffset: number, target: GpuBuffer, targetOffset: number, size: number): void;
  finish(): unknown;
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
  createCommandEncoder(): GpuEncoder;
};
type GpuAdapter = { requestDevice(): Promise<GpuDevice> };
type WebGpu = { requestAdapter(options?: { powerPreference: 'high-performance' }): Promise<GpuAdapter | null> };
type Pipeline = { getBindGroupLayout(index: number): unknown };

export const gpuBufferUsage = {
  mapRead: 1, copySource: 4, copyDestination: 8, uniform: 64, storage: 128,
} as const;

/** One buffer's worth of input. `uniform` is for the small fixed parameter block. */
export type GpuInput = { data: AllowSharedBufferSource; kind?: 'storage' | 'uniform' };

export type GpuDispatch = {
  /** A stable name. The pipeline is compiled once per name for the device's life. */
  readonly shader: string;
  readonly code: string;
  readonly inputs: readonly GpuInput[];
  readonly outputBytes: number;
  /** How many workgroups to run. Split across two dimensions where it has to be. */
  readonly workgroups: number;
};

/** WebGPU requires every buffer size to be a multiple of four bytes. */
const alignedByteLength = (byteLength: number): number => Math.max(4, Math.ceil(byteLength / 4) * 4);

/** The floor every WebGPU implementation guarantees for one dispatch dimension. */
const workgroupsPerDimension = 65535;

export class GpuContext {
  private device: GpuDevice | undefined;
  private opening: Promise<GpuDevice | undefined> | undefined;
  private lost = false;
  private refused = false;
  private readonly pipelines = new Map<string, Pipeline>();

  /**
   * **Which device this is.**
   *
   * It counts up every time a device is opened, so anything holding a judgement about
   * *this card* — the agreement gate above all — can tell a driver reset or a laptop
   * switching from discrete to integrated from an ordinary second request. Evidence
   * gathered on one device says nothing about the next one.
   */
  generation = 0;

  /** Whether this worker can use a card at all. Asked once; the answer is kept. */
  async ready(): Promise<boolean> {
    return (await this.open()) !== undefined;
  }

  private async open(): Promise<GpuDevice | undefined> {
    if (this.device && !this.lost) return this.device;
    /* No WebGPU, no adapter, a device the browser would not hand over: that is the
       card's refusal and it does not change between one request and the next.
       Asking again per calculation would pay for `requestAdapter` every time on
       precisely the machines where it is slowest. A *lost* device is different —
       `this.lost` is set instead, and the next request opens a fresh one. */
    if (this.refused) return undefined;
    if (this.opening) return this.opening;
    const opening = (async () => {
      try {
        const gpu = (self.navigator as Navigator & { gpu?: WebGpu }).gpu;
        if (!gpu) return undefined;
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) return undefined;
        const device = await adapter.requestDevice();
        this.lost = false;
        this.generation += 1;
        /* A lost device is not an error to report: the next request opens a new one,
           and the calculation in flight falls back to the processor. */
        void device.lost.then(() => { this.lost = true; this.device = undefined; this.pipelines.clear(); });
        this.device = device;
        return device;
      } catch {
        return undefined;
      } finally {
        this.opening = undefined;
      }
    })();
    this.opening = opening;
    const opened = await opening;
    if (opened === undefined) this.refused = true;
    return opened;
  }

  private async pipelineFor(device: GpuDevice, shader: string, code: string): Promise<Pipeline> {
    const found = this.pipelines.get(shader);
    if (found) return found;
    const module = device.createShaderModule({ code });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto', compute: { module, entryPoint: 'main' },
    }) as Pipeline;
    /* Only if this device is still the one in hand. A device lost during the compile
       above has already emptied the cache, and storing the dead device's pipeline
       afterwards would leave an entry the next device rejects on every request and
       nothing ever evicts — a single unlucky loss turning the card off for good. */
    if (this.device === device) this.pipelines.set(shader, pipeline);
    return pipeline;
  }

  /**
   * Run one pass and hand back its output buffer.
   *
   * Throws where the card is unavailable, lost, or rejected the pass. Every caller
   * answers that the same way — by running the processor's version — which is what
   * `accelerated-calculation.ts` is for.
   */
  async run(dispatch: GpuDispatch): Promise<ArrayBuffer> {
    const device = await this.open();
    if (!device) throw new Error('No graphics card is available to this worker.');
    const pipeline = await this.pipelineFor(device, dispatch.shader, dispatch.code);
    const outputBytes = alignedByteLength(dispatch.outputBytes);
    const buffers: GpuBuffer[] = [];
    /* The scope opens before the first buffer exists. A buffer the device refuses to
       create — one past a limit, or one asked of a device already lost — reports a
       validation error rather than throwing, so a buffer created outside the scope
       would leave that error to the browser's own handler instead of becoming this
       call's diagnosable message. */
    device.pushErrorScope('validation');
    let scopeOpen = true;
    let mapped = false;
    let output: GpuBuffer | undefined;
    let readback: GpuBuffer | undefined;
    try {
      output = device.createBuffer({ size: outputBytes, usage: gpuBufferUsage.storage | gpuBufferUsage.copySource });
      readback = device.createBuffer({ size: outputBytes, usage: gpuBufferUsage.mapRead | gpuBufferUsage.copyDestination });
      const entries = dispatch.inputs.map((input, index) => {
        const usage = (input.kind === 'uniform' ? gpuBufferUsage.uniform : gpuBufferUsage.storage)
          | gpuBufferUsage.copyDestination;
        const buffer = device.createBuffer({ size: alignedByteLength(input.data.byteLength), usage });
        device.queue.writeBuffer(buffer, 0, input.data);
        buffers.push(buffer);
        return { binding: index, resource: { buffer } };
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [...entries, { binding: dispatch.inputs.length, resource: { buffer: output } }],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      /* One dimension holds 65,535 workgroups, and a whole account's worth of work
         passes that. The second dimension carries the overflow, and the shader
         recombines the two into one index. */
      const rows = Math.ceil(dispatch.workgroups / workgroupsPerDimension);
      pass.dispatchWorkgroups(Math.min(dispatch.workgroups, workgroupsPerDimension), rows);
      pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, outputBytes);
      device.queue.submit([encoder.finish()]);
      scopeOpen = false;
      const failure = await device.popErrorScope();
      if (failure) throw new Error(`The graphics card rejected the ${dispatch.shader} pass: ${failure.message}`);
      if (this.lost) throw new Error('The graphics card was lost during the calculation.');
      await readback.mapAsync(gpuBufferUsage.mapRead);
      mapped = true;
      return readback.getMappedRange().slice(0, dispatch.outputBytes);
    } finally {
      /* The scope is closed whatever happened, and its own rejection is swallowed:
         this path is reached precisely when something has already gone wrong, and a
         floating rejection here would be an unhandled error in the worker on top of
         a failure the caller is about to answer by using the processor. */
      if (scopeOpen) void device.popErrorScope().catch(() => {});
      if (mapped) readback?.unmap();
      for (const buffer of buffers) buffer.destroy();
      output?.destroy();
      readback?.destroy();
    }
  }
}

/**
 * One context per worker.
 *
 * A device is a real resource and two of them in one worker would compile the same
 * pipelines twice, so the calculations share it. Workers do not share memory, so
 * each one opens its own — which is what makes this a module constant rather than
 * something that has to be threaded through every call.
 */
let shared: GpuContext | undefined;

export function sharedGpuContext(): GpuContext {
  if (!shared) shared = new GpuContext();
  return shared;
}

/** The dispatch helper a shader's `main` uses to undo the two-dimensional split. */
export const gpuIndexPreamble = /* wgsl */`
// The dispatch is split across two dimensions once it passes 65,535 workgroups, so
// every shader recovers its one-dimensional index the same way. WORKGROUP_SIZE is
// declared by the shader itself, beside its own @workgroup_size attribute.
fn flatIndex(invocation: vec3<u32>) -> u32 {
  return (invocation.y * ${workgroupsPerDimension}u * WORKGROUP_SIZE) + invocation.x;
}
`;
