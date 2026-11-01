import type { Page } from '@playwright/test';

/** Expose the pending interval deterministically, even on a fast processor. */
export async function holdWorkerRequests(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const held: Array<() => void> = [];
    const control = { hold: false, release: () => { control.hold = false; held.splice(0).forEach((send) => send()); } };
    Object.assign(window, { calculationWorkerControl: control });
    window.Worker = class extends NativeWorker {
      override postMessage(message: unknown) {
        const send = () => super.postMessage(message);
        if (control.hold) held.push(send); else send();
      }
    };
  });
  return {
    hold: () => page.evaluate(() => {
      (window as unknown as { calculationWorkerControl: { hold: boolean } }).calculationWorkerControl.hold = true;
    }),
    release: () => page.evaluate(() => {
      (window as unknown as { calculationWorkerControl: { release: () => void } }).calculationWorkerControl.release();
    }),
  };
}
