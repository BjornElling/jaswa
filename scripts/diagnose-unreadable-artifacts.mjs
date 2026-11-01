/**
 * Names artifact records whose wire shape the reader cannot render, and why.
 *
 * Roll ranges never belong here: game-issued values are authoritative, even
 * when a conversion changes an encoding JASWA has not observed before. This
 * utility is only for the structural boundary needed to render safely.
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
import { createVerificationServer as createServer } from './verification-server.mjs';

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
  artifactProperty, artifactElements, artifactArchetypes,
  artifactIntangibleEngraveClass,
} = await server.ssrLoadModule('/app/lib/artifact-properties.ts');

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value
  : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

/** Retraces the reader's gates in order and names the first one that closes. */
function explain(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'not an object';
  const type = number(record.type);
  const category = artifactCategoryFromType[type ?? -1];
  if (!category) return `unknown type ${JSON.stringify(record.type)} (expected a value mapping to attribute/type)`;
  if (!artifactGradeFromRank(record.natural_rank)) return `unknown natural_rank ${JSON.stringify(record.natural_rank)}`;
  const id = number(record.rid);
  if (id === null || !Number.isSafeInteger(id)) return `unusable rid ${JSON.stringify(record.rid)}`;
  if (!Array.isArray(record.pri_effect)) return `pri_effect is not an array: ${JSON.stringify(record.pri_effect)}`;
  if (!artifactMainProperties[number(record.pri_effect[0]) ?? -1]) return `unknown main property id ${JSON.stringify(record.pri_effect[0])}`;
  if (number(record.pri_effect[1]) === null) return `unreadable main value ${JSON.stringify(record.pri_effect[1])}`;
  const secondary = record.sec_effects;
  if (!Array.isArray(secondary)) return `sec_effects is not an array: ${JSON.stringify(secondary)}`;
  if (secondary.length !== 4) return `sec_effects has ${secondary.length} lines, expected 4`;
  for (const [index, entry] of secondary.entries()) {
    const flag = number(Array.isArray(entry) ? entry[4] : null);
    if (flag === null || !Number.isInteger(flag) || flag < 0) return `sec_effects[${index}] conversion flag ${JSON.stringify(Array.isArray(entry) ? entry[4] : entry)} is not a non-negative integer`;
    if (!artifactProperty(Array.isArray(entry) ? entry[0] : null)) return `sec_effects[${index}] unknown property id ${JSON.stringify(Array.isArray(entry) ? entry[0] : entry)}`;
  }
  const engraveClassCode = number(category === 'attribute' ? record.attribute : record.unit_style);
  const named = category === 'attribute'
    ? artifactElements[engraveClassCode ?? -1] !== undefined
    : artifactArchetypes[engraveClassCode ?? -1] !== undefined;
  if (!named && engraveClassCode !== artifactIntangibleEngraveClass) {
    return `unnamed ${category === 'attribute' ? 'element' : 'archetype'} code ${JSON.stringify(engraveClassCode)} (${category === 'attribute' ? 'attribute' : 'unit_style'} field)`;
  }
  return `unrecognised structural shape (date_add ${JSON.stringify(record.date_add)})`;
}

const rows = [];
const units = Array.isArray(account.unit_list) ? account.unit_list : [];
for (const unit of units) {
  for (const artifact of Array.isArray(unit.artifacts) ? unit.artifacts : []) {
    if (readArtifact(artifact) === null) rows.push({ where: `engraved on unit ${unit.unit_id}`, artifact });
  }
}
for (const artifact of Array.isArray(account.artifacts) ? account.artifacts : []) {
  if (readArtifact(artifact) === null) rows.push({ where: 'account artifact list', artifact });
}

if (rows.length === 0) {
  console.log('Every artifact in this account reads cleanly.');
} else {
  console.log(`${rows.length} artifact${rows.length === 1 ? '' : 's'} with an unreadable structural shape:\n`);
  for (const { where, artifact } of rows) {
    console.log(`  rid ${artifact.rid} — ${where}`);
    console.log(`    why: ${explain(artifact)}`);
    console.log(`    record: ${JSON.stringify(artifact)}`);
    console.log('');
  }
}

await server.close();
process.exit(rows.length === 0 ? 0 : 1);
