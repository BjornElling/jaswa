'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasSummonersWarProcess, isSummonersWarRunning } = require('../src/game-process.cjs');

test('recognizes the Steam Summoners War process in tasklist CSV output', () => {
  assert.equal(hasSummonersWarProcess('"SummonersWar.exe","4820","Console","1","312,400 K"\r\n'), true);
  assert.equal(hasSummonersWarProcess('INFO: No tasks are running which match the specified criteria.\r\n'), false);
});

test('does not inspect Windows processes on another platform', async () => {
  const running = await isSummonersWarRunning(async () => { throw new Error('must not run'); }, 'linux');
  assert.equal(running, false);
});

test('checks the exact Steam executable on Windows', async () => {
  let command;
  const running = await isSummonersWarRunning(async (...arguments_) => {
    command = arguments_;
    return { stdout: '"SummonersWar.exe","4820","Console","1","312,400 K"\r\n' };
  }, 'win32');

  assert.equal(running, true);
  assert.deepEqual(command, ['tasklist.exe', ['/FI', 'IMAGENAME eq SummonersWar.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }]);
});
