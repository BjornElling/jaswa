/**
 * Keep Rune Clean-up free of finite preset quotas.
 *
 * A passing rune may be explained by one preset, but it must never be removed
 * because another rune matched that preset first. This small source-contract
 * check keeps the retired count field and the old post-gate quota path from
 * returning under a new UI label during a later refactor.
 */
import { readFileSync } from 'node:fs';

const files = {
  advice: 'app/lib/rune-cleanup-advice.ts',
  presets: 'app/lib/rune-potential-presets.ts',
  section: 'app/components/rune-potential-section.tsx',
};

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, 'utf8')]));
const failures = [];

function forbid(key, pattern, message) {
  if (pattern.test(source[key])) failures.push(message);
}

forbid('advice', /\bruneShare\b/u, 'rune advice must not read a preset quantity field.');
forbid('advice', /\b(?:quota|capacity|eligibleFor|assignments|allocationOrder)\b/iu,
  'rune advice must not contain a finite preset assignment path.');
forbid('advice', /Outside requested preset capacity/u,
  'rune advice must not sell a rune for a requested preset amount.');
forbid('presets', /\b(?:runeShare|presetRuneShare|defaultRuneShare)\b/u,
  'rune presets must not carry a desired quantity field.');
forbid('section', /\b(?:runeShare|presetRuneShare|runeShareLabel|preset-rune-share)\b/u,
  'the rune preset editor must not expose a desired quantity control.');

for (const required of [
  ['advice', /keepMoreForLargerSets/u, 'the 4-set retention preference must remain in the calculation.'],
  ['advice', /intangibleRunes/u, 'the Intangible retention preference must remain in the calculation.'],
  ['advice', /retentionShare/u, 'set preferences must widen a retained share rather than allocate a finite pool.'],
]) {
  if (!required[1].test(source[required[0]])) failures.push(required[2]);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log('PASS: Rune Clean-up has no finite preset quota and retains both relative set preferences.');
