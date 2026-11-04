/**
 * Keep Rune Clean-up free of finite role quotas.
 *
 * A passing rune may be explained by one role, but it must never be removed
 * because another rune matched that role first. This small source-contract
 * check keeps the retired count field and the old post-gate quota path from
 * returning under a new UI label during a later refactor.
 */
import { readFileSync } from 'node:fs';

const files = {
  advice: 'app/lib/rune-cleanup-advice.ts',
  roles: 'app/lib/rune-roles.ts',
  section: 'app/components/rune-potential-section.tsx',
};

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, 'utf8')]));
const failures = [];

function forbid(key, pattern, message) {
  if (pattern.test(source[key])) failures.push(message);
}

forbid('advice', /\bruneShare\b/u, 'rune advice must not read a role quantity field.');
/* Plurals and inflections too: `capacities` slipped past `capacity` for a variable
   that only counted the calibration sample, and the name still read as a quota. */
forbid('advice', /\b(?:quota\w*|capacit\w*|eligibleFor|assignments?|allocationOrder)\b/iu,
  'rune advice must not contain a finite role assignment path.');
forbid('advice', /Outside requested role capacity/u,
  'rune advice must not sell a rune for a requested role amount.');
forbid('roles', /\b(?:runeShare|roleRuneShare|defaultRuneShare)\b/u,
  'rune roles must not carry a desired quantity field.');
forbid('section', /\b(?:runeShare|roleRuneShare|runeShareLabel|role-rune-share)\b/u,
  'the rune role editor must not expose a desired quantity control.');

for (const required of [
  ['advice', /keepMoreForLargerSets/u, 'the 4-set retention preference must remain in the calculation.'],
  ['advice', /intangibleRunes/u, 'the Intangible retention preference must remain in the calculation.'],
  ['advice', /qualityBar\s*\+\s*\(calibratedFloor\s*-\s*qualityBar\)\s*\/\s*retentionMultiplier/u,
    'set preferences must soften slot correction without undercutting the quality minimum.'],
]) {
  if (!required[1].test(source[required[0]])) failures.push(required[2]);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log('PASS: Rune Clean-up has no finite role quota and retains both relative set preferences.');
