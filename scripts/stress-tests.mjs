import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const options = { repeats: 3, workers: 6 };
for (const argument of process.argv.slice(2)) {
  const match = /^--(repeats|workers)=([1-9]\d*)$/.exec(argument);
  if (!match || !Number.isSafeInteger(Number(match[2]))) {
    throw new Error(`Unknown option: ${argument}. Use --repeats=N or --workers=N (positive integers).`);
  }
  options[match[1]] = Number(match[2]);
}
if (!process.env.npm_execpath) throw new Error('Run this check through npm run test:stress.');

const directory = resolve('work', 'test-stress', new Date().toISOString().replace(/[:.]/g, '-') + `-${process.pid}`);
await mkdir(directory, { recursive: true });
console.log(`Stress results: ${directory}`);
console.log(`${options.repeats} domain passes alongside ${options.repeats} browser passes with ${options.workers} workers; no retries.`);

async function run(name, args, env = {}) {
  const started = Date.now();
  const log = createWriteStream(resolve(directory, `${name}.log`));
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, ...env },
  });
  let skipped = 0;
  let line = '';
  child.stdout.on('data', (chunk) => {
    // Skips must remain visible even when npm reports success for a missing capture.
    line += chunk.toString();
    const lines = line.split(/\r?\n/);
    line = lines.pop();
    for (const value of lines) if (value.startsWith('Skipped:')) {
      skipped += 1;
      console.log(`${name}: ${value}`);
    }
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let launchError;
  child.once('error', (error) => { launchError = error.message; log.write(`${error.stack}\n`); });
  const result = await new Promise((done) => child.once('close', (code, signal) => done({ code, signal })));
  await new Promise((done, reject) => {
    log.once('error', reject);
    log.end(done);
  });
  const answer = { name, ...result, skipped, durationMs: Date.now() - started, ...(launchError ? { launchError } : {}) };
  console.log(`${name}: ${result.code === 0 ? 'passed' : 'FAILED'} (${Math.round(answer.durationMs / 1000)}s, ${skipped} skips)`);
  return answer;
}

// Continue after a failed pass so its frequency is measured; each pass still
// runs the normal domain chain and preserves its original failure in its log.
const [domain, browser] = await Promise.all([
  (async () => {
    const results = [];
    for (let pass = 1; pass <= options.repeats; pass += 1) {
      results.push(await run(`domain-${pass}`, [process.env.npm_execpath, 'run', 'test:domain']));
    }
    return results;
  })(),
  run('browser', ['node_modules/@playwright/test/cli.js', 'test',
    `--workers=${options.workers}`, `--repeat-each=${options.repeats}`, '--retries=0',
    `--output=${resolve(directory, 'browser-results')}`, '--trace=retain-on-failure', '--reporter=line,json'],
  { PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(directory, 'browser.json') }),
]);
const results = [...domain, browser];
let browserStats;
let reportError;
try {
  ({ stats: browserStats } = JSON.parse(await readFile(resolve(directory, 'browser.json'), 'utf8')));
  if (!browserStats) throw new Error('The browser report has no test statistics.');
  console.log(`Browser results: ${browserStats.expected} passed, ${browserStats.unexpected} failed, ${browserStats.skipped} skipped.`);
} catch (error) {
  reportError = error.message;
  console.error(`Could not read browser results: ${reportError}`);
}
await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ options, results, browserStats, reportError }, null, 2) + '\n');
process.exitCode = !reportError && results.every((result) => result.code === 0) ? 0 : 1;
