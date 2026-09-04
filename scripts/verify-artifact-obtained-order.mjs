/**
 * The recommendation table's Obtained ordering must be the game's own.
 *
 * `date_add` looks like the field for it and is not: it resolves only to the
 * second, and the game grants artifacts in bulk, so a whole dungeon run shares
 * one timestamp and the date decides nothing inside it. `rid` is the account's
 * acquisition sequence — a strict refinement of the date — and is what
 * `Artifact.obtainedOrder` carries.
 *
 * This checks the two properties that make it the right key: it never
 * contradicts a recorded date, and it is unique so it needs no tiebreak. It
 * runs against the live traffic-log snapshot when one is present, because the
 * property is a claim about real game data, and falls back to synthetic
 * records so the check still means something on a machine without the helper.
 */
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';

function defaultTrafficLogPath() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'JASWA Helper', 'traffic.log');
  }
  return path.join(os.homedir(), '.jaswa-helper', 'traffic.log');
}

async function readLatestSnapshot(logPath) {
  let snapshot;
  try {
    const stream = createInterface({ input: createReadStream(logPath), crlfDelay: Infinity });
    for await (const line of stream) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const response = entry?.response;
      if (!response || typeof response !== 'object') continue;
      if (entry.command === 'HubUserLogin' || entry.command === 'GuestLogin') snapshot = response;
    }
  } catch { return undefined; }
  return snapshot;
}

/* `date_add` arrives space-separated on old records and ISO on new ones. Read
   as UTC either way: this check only compares dates with each other. */
const parseDate = (value) => Date.parse(String(value).replace(' ', 'T').replace(/Z?$/, 'Z'));

const server = await createServer({ configFile: false, server: { middlewareMode: true } });

try {
  const { readArtifact, readArtifacts } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  /* A legal record, and the rids that cannot carry an order or an identity.
     A float or an unsafe magnitude must be rejected rather than mis-sorted. */
  const legal = {
    rid: 1000, type: 1, attribute: 1, natural_rank: 3, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 6, 1, 0, 0], [301, 6, 1, 0, 0], [302, 3, 0, 0, 0], [303, 3, 0, 0, 0]],
    date_add: '2026-08-30 12:00:00',
  };
  const control = readArtifact(legal);
  assert.ok(control, 'the control record must be readable');
  assert.equal(control.obtainedOrder, 1000, 'the obtained order is the record id read as a number');
  assert.equal(control.obtainedAt, undefined, 'the superseded date field must not be carried on the model');
  for (const rid of [1.5, 2 ** 53 + 2, '1000', null]) {
    assert.equal(readArtifact({ ...legal, rid }), null,
      `a record id of ${String(rid)} cannot order or identify an artifact and must be rejected`);
  }

  /* The batch case, which is the whole point: four artifacts granted in the
     same second, handed to the reader in an order that is not their
     acquisition order. Only `obtainedOrder` recovers it. */
  const batch = [1004, 1001, 1003, 1002].map((rid) => ({ ...legal, rid, date_add: '2026-08-30 15:51:38' }));
  const read = readArtifacts({ artifacts: batch });
  assert.equal(read.length, 4, 'every record in the batch must be readable');
  assert.deepEqual([...read].sort((left, right) => left.obtainedOrder - right.obtainedOrder)
    .map((artifact) => artifact.obtainedOrder), [1001, 1002, 1003, 1004],
  'artifacts sharing one timestamp must still order by acquisition');

  const logPath = process.env.JASWA_TRAFFIC_LOG ?? defaultTrafficLogPath();
  const snapshot = await readLatestSnapshot(logPath);
  if (!snapshot) {
    console.log('Obtained ordering holds on synthetic records; no traffic-log snapshot to check against.');
  } else {
    const records = [...new Map([
      ...(Array.isArray(snapshot.artifacts) ? snapshot.artifacts : []),
      ...(Array.isArray(snapshot.unit_list) ? snapshot.unit_list : []).flatMap((unit) => unit.artifacts ?? []),
    ].map((record) => [record.rid, record])).values()];
    const artifacts = readArtifacts({ artifacts: records });
    assert(artifacts.length > 0, 'the snapshot must yield artifacts');

    const orders = artifacts.map((artifact) => artifact.obtainedOrder);
    assert.equal(new Set(orders).size, orders.length,
      'the acquisition order must be unique, so ordering by it needs no tiebreak');

    /* The property that makes rid the right key rather than merely a different
       one: it is a refinement of the date, never a contradiction of it. */
    const dateById = new Map(records.map((record) => [String(record.rid), parseDate(record.date_add)]));
    const ascending = [...artifacts].sort((left, right) => left.obtainedOrder - right.obtainedOrder);
    for (let index = 1; index < ascending.length; index += 1) {
      const previous = dateById.get(ascending[index - 1].id);
      const current = dateById.get(ascending[index].id);
      if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
      assert(previous <= current,
        `acquisition order contradicts the recorded date at ${ascending[index].id}`);
    }

    /* And that the account actually exercises the batches, so this check is
       testing the real defect rather than an empty case. */
    const byDate = new Map();
    for (const record of records) byDate.set(record.date_add, (byDate.get(record.date_add) ?? 0) + 1);
    const batched = [...byDate.values()].filter((count) => count > 1);
    const inBatches = batched.reduce((total, count) => total + count, 0);
    assert(inBatches > 0, 'the account must contain at least one same-second batch');
    console.log(`Obtained ordering follows acquisition across ${artifacts.length} artifacts: `
      + `${inBatches} of them share a timestamp with another (largest batch ${Math.max(...batched)}), `
      + 'and acquisition order never contradicts the recorded date.');
  }
} finally {
  await server.close();
}
