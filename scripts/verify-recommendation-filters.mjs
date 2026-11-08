/**
 * The recommendation view's filters and its slot summary, checked against a
 * real import (`ACCOUNT-TABLES.md` §5 and §6).
 *
 * Four properties, each of which the user can verify by eye and would
 * therefore notice breaking:
 *
 * - The view opens on the artifacts the plan would engrave, and that opening is
 *   exactly its default filter applied to the complete plan, not a separate
 *   reading of it.
 * - Location before reads the import; Location after reads the plan. Each
 *   partitions the rows, so the two halves sum to the whole.
 * - Already matching / Yes shows exactly the Keep rows and No the rest, and
 *   it combines with Conversion by the And/Or switch between them.
 * - An Intangible row names the §10.1 rule in the conversion column, in plain text,
 *   rather than reporting a judgement JASWA never made.
 * - The slot figures reconcile: filled plus the named remainder is the total.
 *   This one existed as a bug — the summary reported "558 of 558 filled" while
 *   warning about 2 further slots — so it is asserted rather than assumed.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.JASWA_URL ?? 'http://localhost:3000/';
const importPath = process.env.JASWA_IMPORT ?? `${process.env.TEMP}/claude/shots/game.json`;

/* The import is a real account, personal data no checkout carries. Without one
   this check has measured nothing: it says so and steps aside, a skip and not
   a pass, so the gate it sits in still runs everything behind it. */
if (!existsSync(importPath)) {
  console.log(`Skipped: no account export at ${importPath} (set JASWA_IMPORT) — the recommendation filters went unchecked.`);
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const rowCount = () => page.locator('.artifact-recommendation-table tbody tr').count();
const group = (label) => page.locator(`.filter-group[aria-label="${label}"]`);

/* Set a filter button to a state rather than toggling it blind. The view opens
   with some filters already on — it lands on the work list, not the whole plan
   — so a bare click means "on" only if the button happened to be off. Reading
   `aria-pressed` first makes each step below say what it wants, and keeps this
   test measuring the filters rather than the defaults. */
const setFilter = async (label, name, on) => {
  const button = group(label).getByRole('button', { name });
  if (await button.getAttribute('aria-pressed') !== String(on)) await button.click();
};

/* The cells of one column, found by its heading rather than by a hard-coded
   position. Columns come and go from this table — the restriction column was
   dropped once already, silently shifting every index below it and breaking
   these assertions in a way that read as a filter bug. Naming the column makes
   such a change fail loudly here, or not at all. */
const columnCells = async (heading) => {
  /* The label sits in its own span: the cell also carries the sort mark and,
     on the unlabelled columns, a visually hidden name. */
  const index = await page.locator('.artifact-recommendation-table thead th')
    .evaluateAll((cells, name) => cells.findIndex((cell) => (
      cell.querySelector('.sort-button-label') ?? cell
    ).textContent.trim().toLowerCase() === name.toLowerCase()), heading);
  assert.notEqual(index, -1, `The recommendation table has no "${heading}" column.`);
  return page.locator(`.artifact-recommendation-table tbody tr td:nth-child(${index + 1})`);
};

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file][accept*="json"]', importPath);
  await page.waitForTimeout(1200);
  const replaceImport = page.getByRole('button', { name: /replace/i });
  if (await replaceImport.isVisible().catch(() => false)) await replaceImport.click();

  await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  await page.getByText('Recommendations', { exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await page.locator('.artifact-recommendation-table').waitFor({ timeout: 180000 });

  /* The view opens on the plan's engravings: "Location after / Engraved" is
     on by default, because a row the plan would sell asks nothing of the
     user. Assert that first — it is what a user sees on arriving — then clear
     it to measure the filters against the complete plan. */
  const opening = await rowCount();
  const openingSell = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Sell').length);
  assert.equal(openingSell, 0, 'The view does not open on the plan’s engraved rows.');
  for (const name of ['Yes', 'No']) {
    assert.equal(await group('Already matching').getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'false',
      `Already matching / ${name} starts pressed.`);
  }

  await setFilter('Location after', 'Engraved', false);
  const all = await rowCount();
  assert.ok(all > opening,
    `Clearing the opening filter must restore rows: ${opening} of ${all}.`);

  /* "Location after" splits the rows in two: a row is either allocated to a
     monster (engraved) or it is not (inventory, the Sell advice). */
  await setFilter('Location after', 'Engraved', true);
  const plannedEngraved = await rowCount();
  const sellShown = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Sell').length);
  assert.equal(sellShown, 0, 'Location after / Engraved still shows rows the plan would not engrave.');

  await setFilter('Location after', 'Engraved', false);
  await setFilter('Location after', 'Inventory', true);
  const plannedInventory = await rowCount();
  const nonSell = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() !== 'Sell').length);
  assert.equal(nonSell, 0, 'Location after / Inventory shows rows the plan would engrave.');
  assert.equal(plannedEngraved + plannedInventory, all,
    `Location after does not partition the rows: ${plannedEngraved} + ${plannedInventory} != ${all}.`);
  await setFilter('Location after', 'Inventory', false);

  /* "Already matching" splits the rows in two: Yes is exactly the Keep rows —
     the ones whose current monster is the one the plan names — and No the
     rest. */
  const keepRows = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  await setFilter('Already matching', 'Yes', true);
  const matchingYes = await rowCount();
  assert.equal(matchingYes, keepRows,
    `Already matching / Yes shows ${matchingYes} rows, expected the ${keepRows} Keep rows.`);
  await setFilter('Already matching', 'Yes', false);
  await setFilter('Already matching', 'No', true);
  const matchingNo = await rowCount();
  const keepLeft = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  assert.equal(keepLeft, 0, 'Already matching / No left a row that is already on its recommended monster.');
  assert.equal(matchingYes + matchingNo, all,
    `Already matching does not partition the rows: ${matchingYes} + ${matchingNo} != ${all}.`);
  await setFilter('Already matching', 'No', false);
  assert.equal(await rowCount(), all, 'Clearing Already matching did not restore every row.');

  /* "And": the two advice questions narrow together. Each Conversion answer
     with each matching answer is a quarter of the plan, and the four
     quarters add up to the whole — an OR would count rows twice. */
  let quarters = 0;
  for (const conversion of ['Yes', 'No']) {
    for (const matched of ['Yes', 'No']) {
      await setFilter('Conversion', conversion, true);
      await setFilter('Already matching', matched, true);
      quarters += await rowCount();
      await setFilter('Conversion', conversion, false);
      await setFilter('Already matching', matched, false);
    }
  }
  assert.equal(quarters, all, `Conversion And Already matching does not partition the rows: ${quarters} != ${all}.`);

  /* "Or": the union, counted by inclusion and exclusion from the And reading
     of the same pair. A group left unset takes no part, so Conversion / Yes
     alone reads the same under either join. */
  await setFilter('Conversion', 'Yes', true);
  const conversionYes = await rowCount();
  await setFilter('Already matching', 'Yes', true);
  const bothYes = await rowCount();
  await setFilter('Conversion', 'Yes', false);
  const matchedYes = await rowCount();
  const join = page.getByRole('group', { name: 'Join Conversion and Already matching', exact: true });
  await join.getByRole('button', { name: 'Or', exact: true }).click();
  assert.equal(await rowCount(), matchedYes, 'Or let an unset Conversion group show every row.');
  await setFilter('Conversion', 'Yes', true);
  assert.equal(await rowCount(), conversionYes + matchedYes - bothYes,
    'Conversion Or Already matching is not the union of the two.');
  await setFilter('Conversion', 'Yes', false);
  await setFilter('Already matching', 'Yes', false);
  await join.getByRole('button', { name: 'And', exact: true }).click();

  /* The opening view is exactly the default filter applied by hand, which is
     what makes it a view of the plan rather than a separate reading of it. */
  await setFilter('Location after', 'Engraved', true);
  assert.equal(await rowCount(), opening,
    'Applying the opening filter by hand does not reproduce the opening view.');
  await setFilter('Location after', 'Engraved', false);

  /* "Location before" keeps its old meaning: the imported location. */
  await setFilter('Location before', 'Inventory', true);
  const beforeInventory = await (await columnCells('Location'))
    .evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));
  assert(beforeInventory.every((name) => name === 'Inventory'),
    'Location before / Inventory shows an artifact that was engraved at import.');
  await setFilter('Location before', 'Inventory', false);

  /* An Intangible cannot be converted at all (§10.1), and the conversion
     column says so rather than reading "No conversion" — which would state a
     judgement about the piece instead of the rule that forbids it. The rows
     the plan sells show a dash, having no allocation to describe. */
  await setFilter('Restriction', 'Intangible', true);
  const intangibleRows = await page.locator('.artifact-recommendation-table tbody tr').count();
  assert.ok(intangibleRows > 0, 'the import must hold Intangible artifacts for this check');
  const intangibleConversions = await (await columnCells('Best conversions'))
    .evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));
  const unexplained = intangibleConversions.filter((text) => text !== 'Intangible' && text !== '—');
  assert.deepEqual(unexplained, [],
    'an Intangible row must read "Intangible", or a dash where the plan sells it.');
  const intangibleMarks = await page.locator('.artifact-conversion-intangible').evaluateAll(
    (marks) => marks.map((mark) => getComputedStyle(mark).color));
  /* Probed from `--text`, the token the mark is painted with: plain text,
     because gold means "you can act on this" and an Intangible offers nothing
     to act on. A probe naming a token that does not exist would silently
     inherit the body's colour and could not fail loudly, so the one variable
     is named here. */
  const plain = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--text)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  assert.ok(intangibleMarks.length > 0, 'at least one Intangible row must name the rule');
  assert.deepEqual([...new Set(intangibleMarks)], [plain],
    `the Intangible reading must be plain text (${plain}).`);
  await setFilter('Restriction', 'Intangible', false);

  /* The slot figures reconcile: filled + the named remainder = the total. */
  /* The slot figures are in the shared `CalculationStatus` line, in the panel's
     calculation column; the other panels' columns have report lines of their own. */
  const meta = (await page.locator('.artifact-recommendation-actions .calculation-status').textContent()).replace(/\s+/g, ' ');
  const slots = meta.match(/([\d.,]+) of ([\d.,]+) slots filled(?: \(([^)]+)\))?/);
  assert(slots, `The meta line no longer reports slots: ${meta}`);
  const number = (text) => Number(text.replace(/[.,](?=\d{3}\b)/g, ''));
  const remainder = (slots[3] ?? '').split(',').filter(Boolean)
    .reduce((total, part) => total + number(part.trim().split(' ')[0]), 0);
  assert.equal(number(slots[1]) + remainder, number(slots[2]),
    `The slot figures do not add up: ${slots[0]}`);

  console.log(`Verified the view opens on ${opening} rows of work, Location after partitions ${all} rows into ${plannedEngraved} engraved and ${plannedInventory} inventory, Already matching splits off the ${keepRows} Keep rows and combines with Conversion by And and by Or, Location before still reads the import, ${intangibleMarks.length} of ${intangibleRows} Intangible rows name the rule in plain text, and "${slots[0]}" reconciles.`);
} finally {
  await browser.close();
}
