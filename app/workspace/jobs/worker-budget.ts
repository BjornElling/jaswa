/** One capacity budget across foreground calculations and background reference preparation. */
export function createWorkerBudget(capacity: number, interactiveLane = false) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Worker capacity must be positive.');
  let active = 0;
  const queue: Array<{ background: boolean; interactive: boolean; start: (release: () => void) => void }> = [];
  function drain() {
    while (queue.length) {
      const interactive = queue.findIndex((entry) => entry.interactive);
      const regular = queue.findIndex((entry) => !entry.background);
      if (active >= capacity && (!interactiveLane || active > capacity || interactive < 0)) break;
      const next = interactive >= 0 ? interactive : Math.max(0, regular);
      const [entry] = queue.splice(next, 1);
      active += 1;
      let held = true;
      entry.start(() => {
        if (!held) return;
        held = false;
        active -= 1;
        drain();
      });
    }
  }
  return {
    request(start: (release: () => void) => void, background = false, interactive = false) {
      const entry = { start, background, interactive };
      queue.push(entry);
      drain();
      return () => { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); };
    },
    active: () => active,
  };
}

export type WorkerBudget = ReturnType<typeof createWorkerBudget>;

/** Idle workers retain their bounded caches, but hold no processor reservation.
 * Each terminal reply returns capacity before the caller may enqueue more work,
 * so a reference pool cannot reclaim every core ahead of a foreground job. */
export function budgetedWorker(create: () => Worker, budget: WorkerBudget, background = false, interactive = false): Worker {
  const target = new EventTarget();
  let native: Worker | undefined;
  let release: (() => void) | undefined;
  let cancelWaiting: (() => void) | undefined;
  let terminated = false;
  let outstanding = 0;
  let queued: unknown[] = [];
  const finish = () => { const held = release; release = undefined; held?.(); };
  const wrapper = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    terminate() {
      terminated = true;
      cancelWaiting?.();
      queued = [];
      native?.terminate();
      native = undefined;
      finish();
    },
    postMessage(message: { type?: string }) {
      if (terminated) return;
      const control = message.type === 'bar' || message.type === 'stop';
      if (control && outstanding === 0) { native?.postMessage(message); return; }
      if (!control) outstanding += 1;
      if (release && native) {
        try { native.postMessage(message); } catch { queueMicrotask(fail); }
        return;
      }
      queued.push(message);
      if (cancelWaiting) return;
      cancelWaiting = () => {};
      const cancel = budget.request((giveBack) => {
        cancelWaiting = undefined;
        release = giveBack;
        try {
          if (!native) {
            native = create();
            native.addEventListener('message', (event: MessageEvent) => {
              if (terminated) return;
              if (['result', 'error', 'prepared'].includes(event.data.type)) {
                outstanding -= 1;
                if (outstanding === 0) finish();
              }
              const forwarded = new MessageEvent('message', { data: event.data });
              wrapper.onmessage?.(forwarded);
              target.dispatchEvent(forwarded);
            });
            native.addEventListener('error', () => fail());
            native.addEventListener('messageerror', () => fail());
          }
          const messages = queued;
          queued = [];
          for (const entry of messages) native.postMessage(entry);
        } catch { queueMicrotask(fail); }
      }, background, interactive);
      if (cancelWaiting) cancelWaiting = cancel;
    },
  };
  function fail() {
    if (terminated) return;
    native?.terminate();
    native = undefined;
    outstanding = 0;
    finish();
    const event = new Event('error');
    wrapper.onerror?.(event);
    target.dispatchEvent(event);
  }
  return wrapper as unknown as Worker;
}
