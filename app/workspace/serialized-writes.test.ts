import { expect, it } from 'vitest';
import { createSerializedWriter } from './serialized-writes';

it('serializes account commands and continues after a failed command', async () => {
  const write = createSerializedWriter();
  const calls: string[] = [];
  let release: () => void = () => {};
  let markStarted: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const first = write(async () => { calls.push('first'); markStarted(); await gate; calls.push('first done'); });
  const failure = write(async () => { calls.push('failure'); throw new Error('failed'); });
  const last = write(async () => { calls.push('last'); return 3; });
  await started;
  expect(calls).toEqual(['first']);
  release();
  await first;
  await expect(failure).rejects.toThrow('failed');
  await expect(last).resolves.toBe(3);
  expect(calls).toEqual(['first', 'first done', 'failure', 'last']);
});
