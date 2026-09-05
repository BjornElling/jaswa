/**
 * The recommendation view's filters and its slot summary, checked against a
 * real import (`ARTIFACT-CANONICAL.md` §17.9 and §17.10).
 *
 * Three properties, each of which the user can verify by eye and would
 * therefore notice breaking:
 *
 * - Location before reads the import; Location after reads the plan. Each
 *   partitions the rows, so the two halves sum to the whole.
 * - Already matching / Hide removes exactly the Keep rows, and restores them.
 * - The slot figures reconcile: filled plus the named remainder is the total.
 *   This one existed as a bug — the summary reported "558 of 558 filled" while
 *   warning about 2 further slots — so it is asserted rather than assumed.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JASWA_URL ?? 'http://localhost:3000/';
const importPath = process.env.JASWA_IMPORT ?? `${process.env.TEMP}/claude/shots/game.json`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const rowCount = () => page.locator('.artifact-recommendation-table tbody tr').count();
const group = (label) => page.locator(`.filter-group[aria-label="${label}"]`);

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file][accept*="json"]', importPath);
  await page.waitForTimeout(1200);
  const replaceImport = page.getByRole('button', { name: /replace/i });
  if (await replaceImport.isVisible().catch(() => false)) await replaceImport.click();

  await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  await page.getByText('Recommendations', { exact: true }).click();
  await page.getByRole('button', { name: /Calculate recommendations/ }).click();
  await page.locator('.artifact-recommendation-table').waitFor({ timeout: 180000 });

  const all = await rowCount();

  /* "Location after" splits the rows in two: a row is either allocated to a
     monster (equipped) or it is not (inventory, the Sell advice). */
  await group('Location after').getByRole('button', { name: 'Equipped' }).click();
  const plannedEquipped = await rowCount();
  const sellShown = await page.locator('.artifact-recommendation-table tbody tr td:nth-child(7)')
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Sell').length);
  assert.equal(sellShown, 0, 'Location after / Equipped still shows rows the plan would not equip.');

  await group('Location after').getByRole('button', { name: 'Equipped' }).click();
  await group('Location after').getByRole('button', { name: 'Inventory' }).click();
  const plannedInventory = await rowCount();
  const nonSell = await page.locator('.artifact-recommendation-table tbody tr td:nth-child(7)')
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() !== 'Sell').length);
  assert.equal(nonSell, 0, 'Location after / Inventory shows rows the plan would equip.');
  assert.equal(plannedEquipped + plannedInventory, all,
    `Location after does not partition the rows: ${plannedEquipped} + ${plannedInventory} != ${all}.`);
  await group('Location after').getByRole('button', { name: 'Inventory' }).click();

  /* "Already matching / Hide" removes exactly the Keep rows — the ones whose
     current wearer is the monster the plan names. */
  const keepRows = await page.locator('.artifact-recommendation-table tbody tr td:nth-child(7)')
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  await group('Already matching').getByRole('button', { name: 'Hide' }).click();
  const hidden = await rowCount();
  assert.equal(hidden, all - keepRows,
    `Already matching / Hide removed ${all - hidden} rows, expected the ${keepRows} Keep rows.`);
  const keepLeft = await page.locator('.artifact-recommendation-table tbody tr td:nth-child(7)')
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  assert.equal(keepLeft, 0, 'Already matching / Hide left a row that is already on its recommended monster.');
  await group('Already matching').getByRole('button', { name: 'Hide' }).click();
  assert.equal(await rowCount(), all, 'Turning Already matching off did not restore every row.');

  /* "Location before" keeps its old meaning: the imported location. */
  await group('Location before').getByRole('button', { name: 'Inventory' }).click();
  const beforeInventory = await page.locator('.artifact-recommendation-table tbody tr td:nth-child(5)')
    .evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));
  assert(beforeInventory.every((name) => name === 'Inventory'),
    'Location before / Inventory shows an artifact that was equipped at import.');
  await group('Location before').getByRole('button', { name: 'Inventory' }).click();

  /* The slot figures reconcile: filled + the named remainder = the total. */
  const meta = (await page.locator('.artifact-recommendation-meta').textContent()).replace(/\s+/g, ' ');
  const slots = meta.match(/([\d.,]+) of ([\d.,]+) slots filled(?: \(([^)]+)\))?/);
  assert(slots, `The meta line no longer reports slots: ${meta}`);
  const number = (text) => Number(text.replace(/[.,](?=\d{3}\b)/g, ''));
  const remainder = (slots[3] ?? '').split(',').filter(Boolean)
    .reduce((total, part) => total + number(part.trim().split(' ')[0]), 0);
  assert.equal(number(slots[1]) + remainder, number(slots[2]),
    `The slot figures do not add up: ${slots[0]}`);

  console.log(`Verified Location after partitions ${all} rows into ${plannedEquipped} equipped and ${plannedInventory} inventory, Already matching hides the ${keepRows} Keep rows, Location before still reads the import, and "${slots[0]}" reconciles.`);
} finally {
  await browser.close();
}
