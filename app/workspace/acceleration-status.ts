/* What the Home card says about the graphics card. The probe that finds out is
   the browser's (`app/platform/hardware-acceleration.ts`) and reaches the page
   through the shell; it describes the card and never decides whether a
   calculation uses it — `accelerated-calculation.ts` does that
   (`HARDWARE-ACCELERATION.md`). */

/**
 * `checking` is the state the page opens in, not a transient to be skipped:
 * asking the card for an adapter is asynchronous, and a box that showed
 * "unavailable" for one frame first would be wrong before it was right.
 */
export type AccelerationState = 'checking' | 'disabled' | 'ready' | 'unavailable';

export type AccelerationStatus = { state: AccelerationState; adapterName: string; detail: string };

export type GraphicsCardProbe = () => Promise<AccelerationStatus>;

export const disabledStatus: AccelerationStatus = {
  state: 'disabled',
  adapterName: 'Not connected',
  detail: 'Switched off. Calculations run on the processor.',
};
