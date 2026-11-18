#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '..');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = manifest.scripts ?? {};
const dryRun = process.argv.includes('--dry-run');
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
if (unexpectedArguments.length) throw new Error(`Unknown argument(s): ${unexpectedArguments.join(', ')}`);

const domainScript = scripts['test:domain'];
if (typeof domainScript !== 'string') throw new Error('package.json is missing test:domain.');
const domainChecks = [...domainScript.matchAll(/\bnpm run ([^\s&]+)/g)].map((match) => match[1]);
if (!domainChecks.length || new Set(domainChecks).size !== domainChecks.length) {
  throw new Error('test:domain must contain non-empty, unique npm run aliases.');
}
for (const name of domainChecks) {
  if (!scripts[name]) throw new Error(`test:domain names missing package script: ${name}`);
}

/* These checks are intentionally outside the ordinary aggregate: their inputs
   are private, their runtime is unusually expensive, or their result depends
   on hardware and a live server. The map is checked against package.json so a
   new verification alias cannot disappear from the top-level report. */
const notRunReasons = {
  'verify:import-graph': 'included by npm run lint',
  'verify:pure-layers': 'included by npm run lint',
  'verify:fast-refresh': 'included by npm run lint',
  'verify:line-endings': 'included by npm run lint',
  'verify:service-worker': 'included by npm run lint',
  'verify:all': 'this is the aggregate command currently running',
  'audit:helper-replay': 'requires the helper Rust replay integration',
  'verify:rune-chance-card': 'requires a live dev server and a graphics card',
  'verify:rune-optimization-card': 'requires a live dev server and a graphics card',
  'verify:craft-recommendations-card': 'requires a live dev server and a graphics card',
  'verify:rune-slot-neutrality:large': 'slow large-run variant; run it separately',
  'verify:rune-chance-stability:large': 'slow large-run variant; run it separately',
  'verify:rune-cleanup-calibration:large': 'slow large-run variant; run it separately',
  'verify:rune-cleanup-preference-monotonic': 'deliberately separate monotonicity check; run it separately',
  'verify:rune-quality-sampling': 'release holdout plus optional private account sensitivity sweep',
  'verify:rune-cleanup-equivalence': 'requires a deliberately captured baseline',
  'audit:import-parity': 'requires a private account capture',
};
const verificationNames = Object.keys(scripts).filter((name) => name.startsWith('verify:') || name.startsWith('audit:'));
const directRunNames = new Set(domainChecks);
const unaccounted = verificationNames.filter((name) => !directRunNames.has(name) && !notRunReasons[name]);
if (unaccounted.length) {
  throw new Error(`verify-all has no run or explicit skip reason for: ${unaccounted.join(', ')}`);
}
const notRunNames = verificationNames.filter((name) => !directRunNames.has(name));

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxExecutable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function npmRun(name) {
  return process.env.npm_execpath
    ? { executable: process.execPath, args: [process.env.npm_execpath, 'run', name], display: `npm run ${name}` }
    : { executable: npmExecutable, args: ['run', name], display: `npm run ${name}` };
}
const steps = [
  { name: 'tsc --noEmit', executable: npxExecutable, args: ['tsc', '--noEmit'], display: 'npx tsc --noEmit' },
  { name: 'lint', ...npmRun('lint') },
  { name: 'build', ...npmRun('build') },
  ...domainChecks.map((name) => ({ name, ...npmRun(name) })),
  { name: 'test:unit', ...npmRun('test:unit') },
  { name: 'test:e2e', ...npmRun('test:e2e') },
];

console.log('Verification plan:');
for (const step of steps) console.log(`  RUN ${step.display}`);
for (const name of notRunNames) console.log(`  NOT RUN ${name}: ${notRunReasons[name]}`);
if (dryRun) {
  console.log('\nDry run: no verification command was started.');
  console.log('\nVerification summary:');
  for (const step of steps) console.log(`NOT RUN ${step.name}: dry run`);
  for (const name of notRunNames) console.log(`NOT RUN ${name}: ${notRunReasons[name]}`);
  process.exit(0);
}

function skipReasons(output) {
  const lines = output.split(/\r?\n/);
  const explicit = lines.filter((line) => line.startsWith('Skipped:')).map((line) => line.trim());
  const summaries = lines.filter((line) => /^\s*Tests\b.*\b[1-9][\d,]*\s+skipped\b/.test(line)
    || /^\s*[1-9][\d,]*\s+skipped\b/.test(line)).map((line) => `test-runner summary: ${line.trim()}`);
  return [...explicit, ...summaries];
}

function run(step) {
  return new Promise((resolveResult) => {
    let child;
    try {
      /* Windows refuses to spawn a .cmd shim without a shell. The arguments are
         this script's own fixed aliases, never outside input, so a shell is safe. */
      child = spawn(step.executable, step.args, {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(step.executable),
      });
    } catch (error) {
      /* A step that cannot start is that step's failure, not the end of the run. */
      resolveResult({ code: null, signal: null, error: error instanceof Error ? error.message : String(error), output: '' });
      return;
    }
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
      const value = chunk.toString();
      output += value;
      (stream === child.stdout ? process.stdout : process.stderr).write(value);
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveResult({ ...result, output });
    };
    child.on('error', (error) => finish({ code: null, signal: null, error: error.message }));
    child.on('close', (code, signal) => finish({ code, signal, error: null }));
  });
}

const results = [];
for (const step of steps) {
  console.log(`\n--- ${step.display} ---`);
  const result = await run(step);
  const skips = skipReasons(result.output);
  let status;
  let reason;
  if (result.error) {
    status = 'FAIL';
    reason = result.error;
  } else if (result.code !== 0 || result.signal) {
    status = 'FAIL';
    reason = result.signal ? `terminated by ${result.signal}` : `exit code ${result.code}`;
  } else if (skips.length) {
    status = 'SKIP';
    reason = skips.join(' | ');
  } else {
    status = 'PASS';
    reason = 'completed with exit code 0';
  }
  results.push({ name: step.name, status, reason });
}

console.log('\nVerification summary:');
for (const result of results) console.log(`${result.status} ${result.name}: ${result.reason}`);
for (const name of notRunNames) console.log(`NOT RUN ${name}: ${notRunReasons[name]}`);
process.exitCode = results.some((result) => result.status === 'FAIL') ? 1 : 0;
