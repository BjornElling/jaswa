/**
 * The recommendation view's filters and its slot summary, checked against a
 * real import (`ACCOUNT-TABLES.md` §5 and §6).
 *
 * Four properties, each of which the user can verify by eye and would
 * therefore notice breaking:
 *
 * - The view opens on the work list — the artifacts the plan would engrave, minus
 *   those already on the monster it names — and that opening is exactly its two
 *   default filters applied to the complete plan, not a separate reading of it.
 * - Location before reads the import; Location after reads the plan. Each
 *   partitions the rows, so the two halves sum to the whole.
 * - Already matching / Hide removes exactly the Keep rows, and restores them.
 * - An Intangible row names the §10.1 rule in the conversion column, in gold,
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
  await page.getByText('This is the way', { exact: true }).click();
  await page.getByRole('button', { name: /Calculate recommendations/ }).click();
  await page.locator('.artifact-recommendation-table').waitFor({ timeout: 180000 });

  /* The view opens on the work list: "Location after / Engraved" and
     "Already matching / Hide" are on by default, because a row the plan would
     sell or has already placed asks nothing of the user. Assert that first —
     it is what a user sees on arriving — then clear both to measure the
     filters against the complete plan. */
  const opening = await rowCount();
  const openingSell = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Sell').length);
  const openingKeep = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  assert.equal(openingSell, 0, 'The view does not open on the plan’s engraved rows.');
  assert.equal(openingKeep, 0, 'The view opens showing rows already on their recommended monster.');

  await setFilter('Location after', 'Engraved', false);
  await setFilter('Already matching', 'Hide', false);
  const all = await rowCount();
  assert.ok(all > opening,
    `Clearing the opening filters must restore rows: ${opening} of ${all}.`);

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

  /* "Already matching / Hide" removes exactly the Keep rows — the ones whose
     current monster is the one the plan names. */
  const keepRows = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  await setFilter('Already matching', 'Hide', true);
  const hidden = await rowCount();
  assert.equal(hidden, all - keepRows,
    `Already matching / Hide removed ${all - hidden} rows, expected the ${keepRows} Keep rows.`);
  const keepLeft = await (await columnCells('Plan'))
    .evaluateAll((cells) => cells.filter((cell) => cell.textContent.trim() === 'Keep').length);
  assert.equal(keepLeft, 0, 'Already matching / Hide left a row that is already on its recommended monster.');
  await setFilter('Already matching', 'Hide', false);
  assert.equal(await rowCount(), all, 'Turning Already matching off did not restore every row.');

  /* The opening view is exactly the two filters applied together, which is
     what makes it a view of the plan rather than a separate reading of it. */
  await setFilter('Location after', 'Engraved', true);
  await setFilter('Already matching', 'Hide', true);
  assert.equal(await rowCount(), opening,
    'Applying both opening filters by hand does not reproduce the opening view.');
  await setFilter('Location after', 'Engraved', false);
  await setFilter('Already matching', 'Hide', false);

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
  const goldMarks = await page.locator('.artifact-conversion-intangible').evaluateAll(
    (marks) => marks.map((mark) => getComputedStyle(mark).color));
  /* Probed from `--text-accent`, which is the token the mark is actually
     painted with. It read `--gold` until this check was fixed — a name the
     stylesheet has never defined, so the probe silently inherited the body's
     own colour and held the mark to that instead. The assertion then failed on
     a mark that was the right gold all along. A probe naming a token that does
     not exist cannot fail loudly on its own, so it is worth stating: this is
     the one variable, and it is the one the rule reads. */
  const gold = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--text-accent)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  assert.ok(goldMarks.length > 0, 'at least one Intangible row must name the rule');
  assert.deepEqual([...new Set(goldMarks)], [gold],
    `the Intangible reading must be gold (${gold}).`);
  await setFilter('Restriction', 'Intangible', false);

  /* The slot figures reconcile: filled + the named remainder = the total. */
  /* The slot figures moved into the shared `CalculationStatus` line, which every
     page's calculation reports through; `.artifact-recommendation-meta` was the
     box they used to have of their own. */
  const meta = (await page.locator('.calculation-status').textContent()).replace(/\s+/g, ' ');
  const slots = meta.match(/([\d.,]+) of ([\d.,]+) slots filled(?: \(([^)]+)\))?/);
  assert(slots, `The meta line no longer reports slots: ${meta}`);
  const number = (text) => Number(text.replace(/[.,](?=\d{3}\b)/g, ''));
  const remainder = (slots[3] ?? '').split(',').filter(Boolean)
    .reduce((total, part) => total + number(part.trim().split(' ')[0]), 0);
  assert.equal(number(slots[1]) + remainder, number(slots[2]),
    `The slot figures do not add up: ${slots[0]}`);

  console.log(`Verified the view opens on ${opening} rows of work, Location after partitions ${all} rows into ${plannedEngraved} engraved and ${plannedInventory} inventory, Already matching hides the ${keepRows} Keep rows, Location before still reads the import, ${goldMarks.length} of ${intangibleRows} Intangible rows name the rule in gold, and "${slots[0]}" reconciles.`);
} finally {
  await browser.close();
}
