/**
 * Whether this browser can hand JASWA the graphics card, and which one it got.
 *
 * The heavy work ahead — scoring every rune in an account against every preset,
 * and searching six slots for a combination — is the same short calculation run
 * hundreds of thousands of times. A GPU runs those in parallel; the processor
 * runs them one after another. So the connection is opened once, on the page
 * that offers the setting, and the answer is remembered for the workspaces that
 * will use it.
 *
 * WebGPU is the surface: it is the only one that gives a browser page general
 * computation on the card rather than drawing. Where it is missing, or the
 * browser answers with no adapter, that is an honest "no" and is reported as
 * such — never as a silent fall back to the processor.
 */

/* Typed here rather than pulled from a package: the whole of WebGPU is one
   method and two fields away, and everything else in `@webgpu/types` would be
   dependency for its own sake. Only what is actually read is declared. */
type GpuAdapterInfo = { vendor?: string; architecture?: string; device?: string; description?: string };
type GpuAdapter = { info?: GpuAdapterInfo; requestAdapterInfo?: () => Promise<GpuAdapterInfo> };
type Gpu = { requestAdapter: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<GpuAdapter | null> };

/**
 * `checking` is the state the page opens in, not a transient to be skipped:
 * asking the card for an adapter is asynchronous, and a box that showed
 * "unavailable" for one frame first would be wrong before it was right.
 */
export type AccelerationState = 'checking' | 'disabled' | 'ready' | 'unavailable';

export type AccelerationStatus = { state: AccelerationState; adapterName: string; detail: string };

/**
 * The name to put under the verdict. Chrome reports a full description
 * ("NVIDIA GeForce RTX 4070"); other browsers deliberately report less, down to
 * a bare vendor, to keep the card from being one more thing a page can
 * fingerprint. Whatever comes back is shown as-is rather than dressed up.
 */
function adapterName(info: GpuAdapterInfo | undefined): string {
  if (!info) return 'Graphics card reported no name';
  const parts = [info.description, info.device, [info.vendor, info.architecture].filter(Boolean).join(' ')];
  return parts.find((part) => typeof part === 'string' && part.trim().length > 0)?.trim() ?? 'Graphics card reported no name';
}

export async function detectGraphicsCard(): Promise<AccelerationStatus> {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) return {
    state: 'unavailable',
    adapterName: 'No graphics card connected',
    detail: 'This browser does not offer WebGPU. Calculations will run on the processor.',
  };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return {
      state: 'unavailable',
      adapterName: 'No graphics card connected',
      detail: 'The browser supports WebGPU but offered no adapter. Calculations will run on the processor.',
    };
    /* `adapter.info` is the current shape; `requestAdapterInfo()` was the
       earlier one and is still all some shipped browsers have. A card without
       either is still a working card, so neither is required. */
    const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : undefined);
    return { state: 'ready', adapterName: adapterName(info), detail: 'Connected. Heavy calculations will run on the graphics card.' };
  } catch {
    return {
      state: 'unavailable',
      adapterName: 'No graphics card connected',
      detail: 'The connection to the graphics card failed. Calculations will run on the processor.',
    };
  }
}

export const disabledStatus: AccelerationStatus = {
  state: 'disabled',
  adapterName: 'Not connected',
  detail: 'Hardware acceleration is switched off. Calculations will run on the processor.',
};
