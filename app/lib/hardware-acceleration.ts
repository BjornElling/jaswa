/**
 * Whether this browser can hand JASWA the graphics card, and which one it got.
 *
 * The heavy work ahead — scoring every rune in an account against every role,
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
 * The card's model, lifted out of a WebGL renderer string.
 *
 * Chrome wraps the name in the translation layer it reached the card through,
 * and the wrapper is not the card:
 *
 *   ANGLE (AMD, AMD Radeon RX 9070 XT (0x00007550) Direct3D11 vs_5_0 ps_5_0, D3D11)
 *   ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x000027A0) Direct3D11 …, D3D11)
 *   ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)
 *   ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)
 *
 * The middle field is the model, so the vendor field and the backend field are
 * dropped, then the PCI device id and the shader levels after it. The last
 * example is a software renderer wearing the same shape — there is no card
 * behind it, so it is not reported as one. Exported for its own test.
 */
export function graphicsCardModel(renderer: string): string | undefined {
  /* No `s` flag: a renderer string is one line, and the project targets ES2017
     where the flag is not available. */
  const wrapped = renderer.match(/^ANGLE \(([\s\S]*)\)$/);
  let model = renderer;
  if (wrapped) {
    /* Split on the commas of the wrapper itself, not on any inside a nested
       parenthesis: the SwiftShader form carries one, and splitting blindly cut
       the string in the middle of it. */
    const fields: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < wrapped[1].length; index += 1) {
      const character = wrapped[1][index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (character === ',' && depth === 0) { fields.push(wrapped[1].slice(start, index)); start = index + 1; }
    }
    fields.push(wrapped[1].slice(start));
    model = (fields.length >= 2 ? fields[1] : wrapped[1]).trim();
  }
  /* The id first: stripping it is what leaves the shader levels at the end of
     the string where the next expression can find them.

     Only a backend named at a word boundary *after* the model is dropped. An
     earlier attempt matched "Metal" anywhere and cut Apple's "ANGLE Metal
     Renderer: Apple M2 Pro" down to "ANGLE", so the pattern requires that text
     or shader levels that follow a real backend name. */
  model = model
    .replace(/\s*\(0x[0-9a-f]+\)/i, '')
    .replace(/\s+(Direct3D|OpenGL ES|OpenGL|Vulkan|D3D)\s*[\d.]*(\s+(vs|ps)_[\d_]+)*\s*$/i, '')
    /* Apple's form names the renderer before the chip — "ANGLE Metal Renderer:
       Apple M2 Pro" — and the half before the colon is the same translation
       layer the wrapper already accounted for. */
    .replace(/^ANGLE\s+\w+\s+Renderer:\s*/i, '')
    .trim();
  /* A renderer with no hardware behind it is not a graphics card, and saying
     "SwiftShader" where the user expects a model would be worse than saying
     nothing and letting WebGPU answer. */
  if (/swiftshader|llvmpipe|softwarerasterizer|microsoft basic render/i.test(model)) return undefined;
  return model || undefined;
}

/**
 * The model, from WebGL rather than from WebGPU.
 *
 * WebGPU deliberately reports the architecture and not the product — an RX 9070
 * XT answers `vendor: "amd", architecture: "rdna-4"`, which names the engine
 * inside the card rather than the card the user bought. WebGL's
 * `WEBGL_debug_renderer_info` still gives the whole string, and it is the same
 * hardware either way, so the model is read from there:
 *
 *   ANGLE (AMD, AMD Radeon RX 9070 XT (0x00007550) Direct3D11 vs_5_0 ps_5_0, D3D11)
 *
 * The ANGLE wrapper, the PCI device id and the Direct3D shader levels are how
 * the browser reached the card, not which card it is, so the model is lifted out
 * of the middle. Where the extension is missing — Firefox hides it behind a
 * preference, and Safari has removed it — this returns nothing and the WebGPU
 * answer is used instead.
 */
function modelFromWebGl(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return undefined;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return undefined;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    if (typeof renderer !== 'string' || !renderer.trim()) return undefined;

    return graphicsCardModel(renderer);
  } catch {
    /* A context is a resource the browser may refuse — too many live already, or
       a machine with acceleration switched off system-wide. Not knowing the
       model is not a reason to report the card as missing. */
    return undefined;
  }
}

/**
 * The name to put under the verdict: the model where the browser will say it,
 * and whatever WebGPU offered otherwise — down to a bare vendor, since some
 * browsers report as little as they can to keep the card from being one more
 * thing a page can fingerprint.
 */
function adapterName(info: GpuAdapterInfo | undefined): string {
  const model = modelFromWebGl();
  if (model) return model;
  if (!info) return 'Graphics card reported no name';
  const parts = [info.description, info.device, [info.vendor, info.architecture].filter(Boolean).join(' ')];
  return parts.find((part) => typeof part === 'string' && part.trim().length > 0)?.trim() ?? 'Graphics card reported no name';
}

export async function detectGraphicsCard(): Promise<AccelerationStatus> {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  /* Each detail says why, in one line. The consequence is the same in all three
     — the processor does the work — and saying so three times over would be
     three lines of the same sentence. */
  if (!gpu) return {
    state: 'unavailable',
    adapterName: 'No graphics card connected',
    detail: 'This browser does not offer WebGPU. Calculations run on the processor.',
  };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return {
      state: 'unavailable',
      adapterName: 'No graphics card connected',
      detail: 'The browser offered no adapter. Calculations run on the processor.',
    };
    /* `adapter.info` is the current shape; `requestAdapterInfo()` was the
       earlier one and is still all some shipped browsers have. A card without
       either is still a working card, so neither is required. */
    const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : undefined);
    return { state: 'ready', adapterName: adapterName(info), detail: 'Heavy calculations run on the graphics card.' };
  } catch {
    return {
      state: 'unavailable',
      adapterName: 'No graphics card connected',
      detail: 'The connection failed. Calculations run on the processor.',
    };
  }
}

export const disabledStatus: AccelerationStatus = {
  state: 'disabled',
  adapterName: 'Not connected',
  detail: 'Switched off. Calculations run on the processor.',
};
