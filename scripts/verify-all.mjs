import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Keep the existing aliases authoritative until their assertions have been
// moved to the new runner. Running them separately prevents one failure from
// concealing the rest of the domain checks.
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const chain = manifest.scripts['test:domain'].split(' && ');
const checks = chain.map((part) => {
  const match = /^npm run (verify:[\w-]+)$/.exec(part);
  if (!match || !manifest.scripts[match[1]]) throw new Error(`Unrecognized domain check: ${part}`);
  return match[1];
});
if (!checks.length || new Set(checks).size !== checks.length) throw new Error('Domain checks must be non-empty and unique.');
checks.push('test:e2e');
if (!process.env.npm_execpath) throw new Error('Run this command through npm run verify:all.');

const results = [];
for (const name of checks) {
  console.log(`\n--- ${name} ---`);
  const child = spawn(process.execPath, [process.env.npm_execpath, 'run', name], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    const value = chunk.toString();
    output += value;
    (stream === child.stdout ? process.stdout : process.stderr).write(value);
  });
  let error;
  child.on('error', (cause) => { error = cause.message; });
  const result = await new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  const skips = output.split(/\r?\n/).filter((line) => /\bskip(?:ped)?\b/i.test(line));
  results.push({ name, ...result, error, skips });
}
console.log('\nVerification summary:');
for (const result of results) {
  console.log(`${result.code === 0 && !result.error ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}${result.signal ? ` (${result.signal})` : ''}`);
  for (const skip of result.skips) console.log(`  ${skip.trim()}`);
}
console.log('NOT RUN: private-capture audits, real-card checks and Windows helper integration; run these separately when their prerequisites are available.');
process.exitCode = results.some((result) => result.code !== 0 || result.error) ? 1 : 0;
