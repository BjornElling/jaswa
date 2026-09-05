/**
 * Names the artifacts the reader rejects, and why.
 *
 * A single unreadable artifact fails the whole import with one sentence and no
 * subject — "This file contains an equipped artifact JASWA cannot read." That
 * message is right to be loud (`AGENTS.md` §0.1) but it cannot say which record
 * or which field, so finding the offender means running the real reader over a
 * real account and reporting what it refused.
 *
 * Usage:
 *   node scripts/diagnose-unreadable-artifacts.mjs <account.json>
 *   node scripts/diagnose-unreadable-artifacts.mjs --helper
 *
 * `--helper` reads the running helper's live snapshot instead of a file, which
 * is the case a JSON export cannot reproduce: the account as the helper
 * captured it.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const HELPER_PROFILE = 'http://127.0.0.1:37654/profile';

async function loadAccount(source) {
  if (source !== '--helper') return JSON.parse(await readFile(source, 'utf8'));
  const response = await fetch(HELPER_PROFILE, { headers: { Origin: 'http://localhost:3000' } });
  if (!response.ok) throw new Error(`The helper answered ${response.status}. Start Summoners War and try again.`);
  return (await response.json()).data;
}

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/diagnose-unreadable-artifacts.mjs <account.json|--helper>');
  process.exit(2);
}

const account = await loadAccount(source);
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });
const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');
const {
  artifactCategoryFromType, artifactGradeFromRank, artifactMainProperties,
  artifactProperty, artifactGrades, artifactElements, artifactArchetypes,
  artifactIntangibleEquipClass,
} = await server.ssrLoadModule('/app/lib/artifact-properties.ts');

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value
  : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

/** Retraces the reader's gates in order and names the first one that closes. */
function explain(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'not an object';
  const type = number(record.type);
  const category = artifactCategoryFromType[type ?? -1];
  if (!category) return `unknown type ${JSON.stringify(record.type)} (expected a value mapping to attribute/type)`;
  const grade = artifactGradeFromRank(record.natural_rank);
  if (!grade) return `unknown natural_rank ${JSON.stringify(record.natural_rank)}`;
  const id = number(record.rid);
  if (id === null || !Number.isSafeInteger(id)) return `unusable rid ${JSON.stringify(record.rid)}`;
  if (!Array.isArray(record.pri_effect)) return `pri_effect is not an array: ${JSON.stringify(record.pri_effect)}`;
  if (!artifactMainProperties[number(record.pri_effect[0]) ?? -1]) return `unknown main property id ${JSON.stringify(record.pri_effect[0])}`;
  if (number(record.pri_effect[1]) === null) return `unreadable main value ${JSON.stringify(record.pri_effect[1])}`;
  const secondary = record.sec_effects;
  if (!Array.isArray(secondary)) return `sec_effects is not an array: ${JSON.stringify(secondary)}`;
  if (secondary.length !== 4) return `sec_effects has ${secondary.length} lines, expected 4`;
  let converted = null;
  for (const [index, entry] of secondary.entries()) {
    const flag = number(Array.isArray(entry) ? entry[4] : null);
    if (flag === null || !Number.isInteger(flag) || flag < 0) return `sec_effects[${index}] conversion flag ${JSON.stringify(Array.isArray(entry) ? entry[4] : entry)} is not a non-negative integer`;
    if (flag > 0) {
      if (converted !== null) return `sec_effects marks two converted lines (${converted} and ${index})`;
      converted = index;
    }
    if (!artifactProperty(Array.isArray(entry) ? entry[0] : null)) return `sec_effects[${index}] unknown property id ${JSON.stringify(Array.isArray(entry) ? entry[0] : entry)}`;
  }
  const powerUps = secondary.reduce((total, entry) => total + (number(entry?.[2]) ?? 0), 0);
  const expected = artifactGrades[grade].naturalRank - 1;
  const equipClassCode = number(category === 'attribute' ? record.attribute : record.unit_style);
  const named = category === 'attribute'
    ? artifactElements[equipClassCode ?? -1] !== undefined
    : artifactArchetypes[equipClassCode ?? -1] !== undefined;
  if (!named && equipClassCode !== artifactIntangibleEquipClass) {
    return `unnamed ${category === 'attribute' ? 'element' : 'archetype'} code ${JSON.stringify(equipClassCode)} (${category === 'attribute' ? 'attribute' : 'unit_style'} field)`;
  }
  if (powerUps !== expected) return `power-ups total ${powerUps} but ${grade} expects ${expected} (date_add ${JSON.stringify(record.date_add)})`;
  return `rejected by a roll-range or duplicate-property rule (date_add ${JSON.stringify(record.date_add)})`;
}

const rows = [];
const units = Array.isArray(account.unit_list) ? account.unit_list : [];
for (const unit of units) {
  for (const artifact of Array.isArray(unit.artifacts) ? unit.artifacts : []) {
    if (readArtifact(artifact) === null) rows.push({ where: `equipped on unit ${unit.unit_id}`, artifact });
  }
}
for (const artifact of Array.isArray(account.artifacts) ? account.artifacts : []) {
  if (readArtifact(artifact) === null) rows.push({ where: 'account artifact list', artifact });
}

if (rows.length === 0) {
  console.log('Every artifact in this account reads cleanly.');
} else {
  console.log(`${rows.length} artifact${rows.length === 1 ? '' : 's'} the reader refuses:\n`);
  for (const { where, artifact } of rows) {
    console.log(`  rid ${artifact.rid} — ${where}`);
    console.log(`    why: ${explain(artifact)}`);
    console.log(`    record: ${JSON.stringify(artifact)}`);
    console.log('');
  }
}

await server.close();
process.exit(rows.length === 0 ? 0 : 1);
