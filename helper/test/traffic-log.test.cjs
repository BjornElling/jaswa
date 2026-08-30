'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TrafficLog, trafficLogPath } = require('../src/traffic-log.cjs');

async function temporaryDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'jaswa-traffic-'));
}

async function readLines(directory) {
  const contents = await fs.readFile(trafficLogPath(directory), 'utf8');
  return contents.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('records nothing until it is switched on', async () => {
  const directory = await temporaryDirectory();
  const log = new TrafficLog({ directory });

  assert.equal(log.isEnabled(), false);
  log.record('GetStatistics', { command: 'GetStatistics' }, { unit_id: 1 });
  await log.flush();

  await assert.rejects(fs.readFile(trafficLogPath(directory), 'utf8'));
  assert.equal(log.status().entries, 0);
});

test('writes one parseable line per exchange, in order', async () => {
  const directory = await temporaryDirectory();
  const log = new TrafficLog({ directory });
  log.setEnabled(true);

  log.record('First', { command: 'First' }, { value: 1 });
  log.record('Second', { command: 'Second' }, { value: 2 });
  await log.flush();

  const lines = await readLines(directory);
  assert.deepEqual(lines.map((line) => line.command), ['First', 'Second']);
  assert.deepEqual(lines.map((line) => line.response.value), [1, 2]);
  assert.deepEqual(lines[0].request, { command: 'First' });
  assert.equal(typeof lines[0].at, 'string');
  assert.equal(log.status().entries, 2);
});

test('switching on again starts a fresh file rather than appending to the last session', async () => {
  const directory = await temporaryDirectory();
  const log = new TrafficLog({ directory });

  log.setEnabled(true);
  log.record('Old', {}, {});
  await log.flush();
  log.setEnabled(false);

  log.setEnabled(true);
  log.record('New', {}, {});
  await log.flush();

  const lines = await readLines(directory);
  assert.deepEqual(lines.map((line) => line.command), ['New']);
  assert.equal(log.status().entries, 1);
});

test('stops recording at its size limit and says so', async () => {
  const directory = await temporaryDirectory();
  const log = new TrafficLog({ directory, maximumBytes: 200 });
  log.setEnabled(true);

  log.record('Big', {}, { padding: 'x'.repeat(300) });
  log.record('Dropped', {}, {});
  await log.flush();

  const lines = await readLines(directory);
  assert.deepEqual(lines.filter((line) => line.command).map((line) => line.command), ['Big']);
  assert.equal(lines.at(-1).note, 'Log limit reached. Recording stopped.');
  assert.equal(log.status().full, true);
});

test('a missing command is recorded as null rather than invented', async () => {
  const directory = await temporaryDirectory();
  const log = new TrafficLog({ directory });
  log.setEnabled(true);

  log.record(undefined, { no: 'command' }, {});
  await log.flush();

  assert.equal((await readLines(directory))[0].command, null);
});

test('a write failure is reported and never thrown at the import', async () => {
  const directory = await temporaryDirectory();
  /* A file where the directory should be makes every write fail, which is the
     realistic shape of a disk or permission fault. */
  await fs.writeFile(path.join(directory, 'blocked'), '', 'utf8');
  const log = new TrafficLog({ directory: path.join(directory, 'blocked') });
  log.setEnabled(true);

  assert.doesNotThrow(() => log.record('Any', {}, {}));
  await log.flush();

  assert.equal(typeof log.status().lastError, 'string');
});
