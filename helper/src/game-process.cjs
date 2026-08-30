'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const summonersWarExecutable = 'SummonersWar.exe';

function hasSummonersWarProcess(output) {
  return output.split(/\r?\n/).some((line) => /^"SummonersWar\.exe",/i.test(line.trim()));
}

async function isSummonersWarRunning(execute = run, platform = process.platform) {
  if (platform !== 'win32') return false;
  const { stdout } = await execute('tasklist.exe', ['/FI', `IMAGENAME eq ${summonersWarExecutable}`, '/FO', 'CSV', '/NH'], { windowsHide: true });
  return hasSummonersWarProcess(stdout);
}

module.exports = { hasSummonersWarProcess, isSummonersWarRunning, summonersWarExecutable };
