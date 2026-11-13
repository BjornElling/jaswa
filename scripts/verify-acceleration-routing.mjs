/**
 * **One door onto the graphics card, and one rule about when to open it.**
 *
 * `docs/HARDWARE-ACCELERATION.md` is the contract. This is the check, and it reads
 * source text rather than behaviour for the same reason
 * `verify-rune-craft-single-source.mjs` does: a second copy of a decision that happens
 * to agree today is still a second copy.
 *
 * The decision drifted once already and nothing failed. Artifact scoring asked the
 * card, fell back on any failure, and reported which one answered. Rune Clean-up
 * hard-coded its answer as the processor and said in a comment that it had no card
 * backend — true when it was written, and exactly the kind of statement that stops
 * being true without anything breaking. Everything else simply never asked.
 *
 * Three things are held:
 *
 * 1. **Only `gpu/gpu-context.ts` asks the browser for an adapter or a device.** A
 *    second requester would open a second device in one worker, compile the same
 *    pipelines twice, and — worse — could answer a request without the error scope
 *    that turns a rejected pass into a fall back instead of a matrix of zeros. The
 *    detection the Home page shows is the one exception, and it is display only.
 * 2. **No worker acts on the user's setting itself.** It may hand it on, to
 *    `runAccelerated` or to an engine module that calls it, but the weighing happens
 *    once for the whole program and not once per calculation.
 * 3. **Every worker reports the engine that answered**, and none of them decides in
 *    advance what to report — a fall back the user cannot see is the failure this
 *    whole arrangement exists to make visible.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const compute = join('app', 'platform', 'compute');
const gpu = join('app', 'platform', 'gpu');

/** The one module allowed to open a device, and the one allowed to detect a card. */
const deviceOwners = new Set([
  join(gpu, 'gpu-context.ts'),
  /* Display only: the Home page's Connected box. It gates nothing, which is why it is
     allowed to ask a question of its own. */
  join('app', 'platform', 'hardware-acceleration.ts'),
]);

/**
 * Workers with no card path at all, each with its reason. Rule 3 is about a fall back
 * the user cannot see; a worker that only ever runs on the processor has none, and a
 * `backend` it could only ever fill with one value would be the hard-coding rule 3
 * forbids. Each belongs under "Everything else" in the contract's §5.
 */
const processorOnlyWorkers = new Map([
  /* A piece of Rune Clean-up's slot calibration, counted on every core. The odds it
     feeds are reported by the chance worker that answers them. */
  [join(compute, 'rune-calibration-worker.ts'), 'Rune Clean-up slot calibration'],
]);

/** The one module allowed to decide whether the card is used at all. */
const decisionOwner = join(compute, 'accelerated-calculation.ts');

/**
 * The file with its comments taken out.
 *
 * A comment that *describes* the rule is the opposite of a breach, and a check that
 * cannot tell the two apart teaches people to stop writing the description.
 */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*/gm, '$1 ');

function everyFile(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...everyFile(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

const offences = [];
const workers = [];
for (const path of everyFile(join(root, 'app'))) {
  const name = relative(root, path).split('/').join(sep);
  const source = code(readFileSync(path, 'utf8'));
  if (/\brequestAdapter\b|\brequestDevice\b/.test(source) && !deviceOwners.has(name)) {
    offences.push(`${name} asks the browser for a graphics device of its own`);
  }
  /* The request client also ends in -worker.ts; it forwards results on the
     page and owns no calculation or engine report. */
  if (name.endsWith('-worker.ts') && name !== join('app', 'platform', 'cancellable-worker.ts')) workers.push({ name, source });
}

const rule = code(readFileSync(join(root, decisionOwner), 'utf8'));
if (!rule.includes('export async function runAccelerated')) {
  offences.push(`${decisionOwner} no longer states the rule it owns`);
}

for (const { name, source } of workers) {
  /* Handing the preference on is fine. Testing it is the drift. */
  if (/\bpreferWebGpu\b\s*(\?|&&|\|\||===|!==|==|!=)/.test(source)
    || /(if|while)\s*\([^)]*\bpreferWebGpu\b/.test(source)) {
    offences.push(`${name} branches on preferWebGpu instead of handing it to the rule`);
  }
  if (processorOnlyWorkers.has(name)) {
    if (/\bpreferWebGpu\b|\brunAccelerated\b/.test(source)) {
      offences.push(`${name} is listed as processor-only but has started to reach for the card`);
    }
    continue;
  }
  if (!/\bbackend\b/.test(source)) {
    offences.push(`${name} never reports which engine answered`);
  }
  if (/backend:\s*'(cpu|webgpu|mixed)'/.test(source)) {
    offences.push(`${name} hard-codes the engine it reports instead of reporting the one that answered`);
  }
}

if (offences.length > 0) {
  console.error('The rule about the graphics card has started to spread:');
  for (const offence of offences) console.error(`  ${offence}`);
  console.error('\ndocs/HARDWARE-ACCELERATION.md is the contract; runAccelerated is the one door.');
  process.exit(1);
}

console.log(`PASS: one module opens a device, one weighs the setting, and all ${workers.length - processorOnlyWorkers.size}`
  + ` workers with a card path report the engine that answered (${processorOnlyWorkers.size} processor-only).`);
