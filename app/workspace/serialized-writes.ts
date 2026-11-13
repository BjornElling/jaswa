/** Account commands read their inputs when they reach the head of the queue. */
export function createSerializedWriter() {
  let tail: Promise<void> = Promise.resolve();
  return function write<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.catch(() => undefined).then(work);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}
