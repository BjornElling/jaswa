import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('calculates and shows a verdict for every imported rune', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await expect(cleanup.getByText('Nothing calculated yet.')).toBeVisible();
  await expect(cleanup.locator('.list-actions')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Use game-sorting' })).toBeVisible();
  const filterPanel = page.locator('.data-table-filter-panel');
  expect(await filterPanel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(await filterPanel.evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  const columnLabels = [['Search', 'Level', 'Slot'], ['Set', 'Main', 'Show only'],
    ['Stars', 'Rarity', 'Location', 'Advice'], ['Never sell if...', 'Use game-sorting']];
  for (const [index, labels] of columnLabels.entries()) {
    await expect(page.locator('.rune-filter-column').nth(index).locator('.filter-label')).toHaveText(labels);
  }
  const filterBoxes = () => page.locator('.rune-filter-strip').evaluate((strip) =>
    Array.from(strip.querySelectorAll('.filter-group, .rune-filter-actions > .button')).map((control) => {
      const { x, y, width, height } = control.getBoundingClientRect();
      return { x, y, width, height };
    }));
  const beforeCalculation = await filterBoxes();
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-empty.png') });

  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  /* Either engine is a pass: the browsers this suite drives expose no WebGPU, so the
     label is always Processor here — but asserting that would make the check a
     statement about the test browser rather than about the page. */
  await expect(page.locator('.calculation-status'))
    .toHaveText(/4 runes judged against [\d,]+ roles\s*[\d,]+ ms · (Graphics card|Processor)/);
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  await expect(table.locator('tbody tr')).toHaveCount(4);
  expect(await filterBoxes()).toEqual(beforeCalculation);
  await expect(table.getByRole('img', { name: /quality$/ })).toHaveCount(4);
  await expect(page.getByRole('table', { name: 'Rune verdict columns' }).locator('thead th'))
    .toHaveText(['Set', 'Slot', 'Lv.', 'Main', 'Innate', 'Sub properties', 'Location', 'Best role', 'Maxvalue', 'Chance', 'Advice']);
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-calculated.png') });
  const quality = cleanup.getByRole('button', { name: 'Quality column' });
  await expect(quality).toHaveAttribute('aria-pressed', 'false');
  await quality.click();
  const heading = cleanup.getByRole('columnheader', { name: 'Quality', exact: true });
  await expect(heading).toBeVisible();
  await heading.getByRole('button').click();
  await expect(heading).toHaveAttribute('aria-sort', 'ascending');
  expect(await filterBoxes()).toEqual(beforeCalculation);
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-quality-column.png') });
  const navigation = page.getByRole('navigation');
  await navigation.getByRole('button', { name: 'Home', exact: true }).click();
  await navigation.getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(quality).toHaveAttribute('aria-pressed', 'true');
  await expect(heading).toHaveAttribute('aria-sort', 'ascending');

});

/**
 * The Use game-sorting dropdown reproduces the game's own orderings, and it shares one
 * sort state with the column headings: choosing an ordering takes the table
 * over and no heading claims to be sorted, and clicking a heading hands
 * ordering back and clears the dropdown.
 *
 * `scripts/verify-rune-game-sort.mjs` owns the orderings themselves and the
 * evidence behind them. This owns the handover between the two controls, which
 * is interface behaviour and only observable in a real page.
 */
test('the game orderings take the table over and hand it back to the headings', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();

  const header = page.getByRole('table', { name: 'Rune verdict columns' });
  const sortBy = page.getByRole('combobox', { name: 'Use game-sorting' });
  const sortedHeading = header.locator('th[aria-sort]');

  /* The table opens in the game's Obtained order, so the dropdown names it and
     no heading claims to be the one ordering the rows. */
  await expect(sortBy).toHaveValue('gameObtained');
  await expect(sortedHeading).toHaveCount(0);

  /* Every ordering the game offers is on the dropdown, in the game's wording. */
  await expect(sortBy.locator('option')).toHaveText(['Not sorted', 'Grade', 'Power-up Lv.', 'Obtained']);

  for (const ordering of ['Grade', 'Power-up Lv.', 'Obtained']) {
    await sortBy.selectOption({ label: ordering });
    /* Taken over: the ordering is the dropdown's, so no column heading may
       still present itself as the one ordering the rows. */
    await expect(sortedHeading).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(4);
  }
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-game-sort.png') });

  /* Handed back: a heading click orders the table again and the dropdown falls
     to its unselected reading rather than lying about an ordering it lost. */
  await header.getByRole('button', { name: 'Lv.' }).click();
  await expect(sortBy).toHaveValue('');
  await expect(sortedHeading).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-heading-sort.png') });

  /* Reset filters puts the opening ordering back too. The dropdown is part of
     the panel's state, so leaving another ordering set after a reset would
     leave the table in an order the panel no longer admits to. */
  await sortBy.selectOption({ label: 'Grade' });
  await expect(sortedHeading).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset runes filters' }).click();
  await expect(sortBy).toHaveValue('gameObtained');
  await expect(sortedHeading).toHaveCount(0);
});

test('filters by Ancient, star count and rune quality', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();

  const table = page.getByRole('table', { name: 'Rune verdicts' });
  const dataRows = () => table.locator('tbody tr').filter({ hasNot: page.locator('.table-empty-state') });
  await expect(dataRows()).toHaveCount(4);
  await expect(dataRows().first().locator('td').nth(1)).toHaveCSS('text-align', 'center');
  const subCells = dataRows().locator('td.rune-subs');
  for (let at = 0; at < await subCells.count(); at += 1) {
    await expect(subCells.nth(at)).toHaveCSS('white-space', 'nowrap');
    const width = await subCells.nth(at).evaluate((element) => ({
      client: element.clientWidth, scroll: element.scrollWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('rune-filters-before.png') });

  await page.getByRole('group', { name: 'Show only Ancient runes' })
    .getByRole('button', { name: 'Ancient', exact: true }).click();
  await expect(dataRows()).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('rune-filters-after-ancient.png') });
  await page.getByRole('group', { name: 'Show only Ancient runes' })
    .getByRole('button', { name: 'Ancient', exact: true }).click();
  await expect(dataRows()).toHaveCount(4);

  const stars = page.getByRole('group', { name: 'Filter by star count' });
  await expect(stars.getByRole('button', { name: '1 star', exact: true })).toBeVisible();
  await expect(stars.getByRole('button', { name: '6 stars', exact: true })).toBeVisible();
  await stars.getByRole('button', { name: '5 stars', exact: true }).click();
  await expect(dataRows()).toHaveCount(0);
  await stars.getByRole('button', { name: '6 stars', exact: true }).click();
  await expect(dataRows()).toHaveCount(4);
  await stars.getByRole('button', { name: '5 stars', exact: true }).click();
  await expect(dataRows()).toHaveCount(4);

  const quality = page.getByRole('group', { name: 'Filter by rune rarity' });
  await expect(quality.getByRole('button', { name: 'Normal', exact: true })).toBeVisible();
  await expect(quality.getByRole('button', { name: 'Rare', exact: true })).toBeVisible();
  await expect(quality.getByRole('button', { name: 'Hero', exact: true })).toBeVisible();
  await expect(quality.getByRole('button', { name: 'Legend', exact: true })).toBeVisible();
  await quality.getByRole('button', { name: 'Hero', exact: true }).click();
  await expect(dataRows()).toHaveCount(0);
  await quality.getByRole('button', { name: 'Hero', exact: true }).click();
  await quality.getByRole('button', { name: 'Legend', exact: true }).click();
  await expect(dataRows()).toHaveCount(3);
  await quality.getByRole('button', { name: 'Legend', exact: true }).click();
  await quality.getByRole('button', { name: 'Rare', exact: true }).click();
  await expect(dataRows()).toHaveCount(1);
});


test('protects current pre-grind speed immediately without moving the filter controls', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(page.getByText('Nothing to judge until account data is imported.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Use game-sorting' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const safeguard = page.getByRole('checkbox', { name: 'Pre-grind SPD ≥' });
  const minimum = page.getByRole('textbox', { name: 'Minimum pre-grind SPD' });
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(page.getByText('Any role', { exact: true })).toHaveCount(0);
  await expect(safeguard).toBeChecked();
  await expect(minimum).toHaveValue('20');
  await expect(minimum).toHaveCSS('text-align', 'center');
  await safeguard.uncheck();
  await expect(minimum).toBeDisabled();
  const wording = page.locator('label').filter({ hasText: 'Pre-grind SPD ≥' });
  await expect(wording).toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: testInfo.outputPath('speed-disabled.png'), fullPage: true });
  await wording.click();
  await expect(safeguard).not.toBeChecked();
  await safeguard.check();
  await expect(minimum).toBeEnabled();
  await minimum.fill('');
  const original = await rows.locator('.rune-verdict').allTextContents();
  const fastFinished = rows.filter({ has: page.getByText('+15', { exact: true }) }).locator('.rune-verdict');
  const fastUnfinished = rows.filter({ has: page.getByText('+9', { exact: true }) }).locator('.rune-verdict');
  const unfinishedOriginal = await fastUnfinished.textContent();
  const boxes = async () => Promise.all([
    page.locator('.rune-speed-protection'), minimum, page.locator('.rune-filter-sort-by'),
    page.getByRole('table', { name: 'Rune verdict columns' }),
  ].map((control) => control.boundingBox()));
  const before = await boxes();
  const labelBox = await wording.boundingBox();
  const checkboxBox = await safeguard.boundingBox();
  const numberBox = await minimum.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(checkboxBox).not.toBeNull();
  expect(numberBox).not.toBeNull();
  const centre = (box: { y: number; height: number } | null) => box ? box.y + box.height / 2 : 0;
  expect(Math.abs(centre(labelBox) - centre(checkboxBox))).toBeLessThanOrEqual(1);
  expect(Math.abs(centre(labelBox) - centre(numberBox))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('speed-empty-before.png'), fullPage: true });
  await safeguard.check();
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  await minimum.fill('05');
  await expect(fastFinished).toHaveText('Keep');
  await expect(fastUnfinished).toHaveText('Power up');
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('speed-filled-after.png'), fullPage: true });
  await minimum.fill('06');
  await expect(fastFinished).toHaveText('Keep');
  await expect(fastUnfinished).toHaveText(unfinishedOriginal ?? '');
  await minimum.fill('99');
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  expect(await boxes()).toEqual(before);
  await minimum.fill('00');
  await expect(fastFinished).toHaveText('Keep');
  await expect(fastUnfinished).toHaveText('Power up');
  await minimum.fill('');
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  await minimum.fill('05');
  await safeguard.uncheck();
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  await safeguard.check();
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(safeguard).toBeChecked();
  await expect(minimum).toHaveValue('5');
});


test('potential protection saves both choices and keeps independent filter columns still', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(page.getByText('Nothing to judge until account data is imported.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Use game-sorting' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('potential-no-import.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  const protectedAccount = JSON.parse(readFileSync(account, 'utf8'));
  protectedAccount.unit_list[0].runes[0].sec_eff = [[2, 8, 0, 0], [4, 8, 0, 0], [8, 30, 0, 0], [9, 6, 0, 0]];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'craft-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(protectedAccount)),
  });
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const potential = page.getByRole('checkbox', { name: 'Potential value ≥' });
  const minimum = page.getByRole('textbox', { name: 'Minimum potential value' });
  const speed = page.getByRole('checkbox', { name: 'Pre-grind SPD ≥' });
  await expect(potential).toBeChecked();
  await expect(minimum).toHaveValue('90');
  await speed.uncheck();
  await potential.uncheck();
  await expect(minimum).toBeDisabled();
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const original = await rows.locator('.rune-verdict').allTextContents();
  const boxes = () => page.locator('.rune-filter-column .filter-group').evaluateAll((groups) => groups.map((group) => {
    const { x, y, width, height } = group.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await boxes();
  await potential.check();
  await minimum.fill('');
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  await page.screenshot({ path: testInfo.outputPath('potential-empty.png'), fullPage: true });
  await minimum.fill('0');
  for (const row of await rows.all()) {
    const chance = await row.locator('td').nth(9).textContent();
    if (chance && /^\d+ %$/.test(chance.trim()) && parseInt(chance) >= 1) {
      await expect(row.locator('.rune-verdict')).toHaveText(/^(Keep|Power up)$/);
    }
  }
  await expect(rows.filter({ has: page.getByText('+15', { exact: true }) }).locator('.rune-verdict')).toHaveText('Keep');
  expect(await boxes()).toEqual(before);
  await speed.check();
  await page.getByRole('textbox', { name: 'Minimum pre-grind SPD' }).fill('99');
  await minimum.fill('999');
  await expect(rows.locator('.rune-verdict')).toHaveText(original);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('potential-full.png'), fullPage: true });
  const main = await page.locator('.rune-filter-main').boundingBox();
  const set = await page.locator('.rune-filter-set').boundingBox();
  expect(main!.x).toBe(set!.x);
  const scale = main!.width / 260;
  expect(main!.y).toBeCloseTo(set!.y + set!.height + 16 * scale, 1);
  const adviceGroup = await page.locator('.rune-filter-advice').boundingBox();
  const locationGroup = await page.locator('.rune-filter-usage').boundingBox();
  const protection = await page.locator('.rune-speed-protection').boundingBox();
  expect(adviceGroup!.y).toBeCloseTo(locationGroup!.y + locationGroup!.height + 16 * scale, 1);
  const widths = await Promise.all([
    page.locator('.rune-filter-main .token-choice-line'),
    page.locator('.rune-filter-set .token-choice-line'),
    page.getByRole('combobox', { name: 'Use game-sorting' }),
  ].map((control) => control.boundingBox()));
  expect(widths[0]!.width).toBe(widths[1]!.width);
  expect(widths[2]!.width).toBeCloseTo(widths[0]!.width * 180 / 260, 1);
  await expect(page.getByRole('combobox', { name: 'Use game-sorting' })).toHaveCSS('width', '180px');
  const summary = await page.locator('.rune-filter-status').boundingBox();
  const strip = await page.locator('.rune-filter-strip').boundingBox();
  const stars = await page.locator('.rune-filter-stars').boundingBox();
  /* The shared calculation column: Calculate at the top right, its report
     under it, and the count with its reset at the foot. */
  expect(summary!.x + summary!.width).toBeCloseTo(strip!.x + strip!.width, 1);
  expect(stars!.y).toBe(strip!.y);
  const ordering = await page.locator('.rune-filter-sort-by').boundingBox();
  expect(ordering!.x).toBe(protection!.x);
  const calculateBox = await page.getByRole('button', { name: 'Calculate', exact: true }).boundingBox();
  expect(calculateBox!.x + calculateBox!.width).toBeCloseTo(strip!.x + strip!.width, 1);
  expect(calculateBox!.y).toBeCloseTo(strip!.y, 1);
  const progressBox = await page.locator('.rune-filter-actions .calculation-actions-status').boundingBox();
  expect(progressBox!.y).toBeGreaterThan(calculateBox!.y + calculateBox!.height);
  expect(summary!.y).toBeGreaterThan(progressBox!.y + progressBox!.height);
  const resets = await page.locator('.rune-filter-actions .calculation-actions-resets').boundingBox();
  expect(resets!.y + resets!.height).toBeCloseTo(strip!.y + strip!.height, 1);
  expect(ordering!.y + ordering!.height).toBeCloseTo(strip!.y + strip!.height, 1);
  await expect(page.locator('.rune-filter-actions')).toHaveCSS('border-left-width', '0px');
  await minimum.fill('90');
  await potential.uncheck();
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(potential).not.toBeChecked();
  await expect(minimum).toHaveValue('90');
  await expect(speed).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Minimum pre-grind SPD' })).toHaveValue('99');
});


test('keeps the filter panel visible when calculation prerequisites are missing', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const missingReference = JSON.parse(readFileSync(account, 'utf8'));
  for (const unit of missingReference.unit_list) unit.unit_level = 1;
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'missing-reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(missingReference)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(page.getByText('No monster has reached level 40.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(page.locator('.rune-filter-strip')).toBeVisible();
  const filterPanel = page.locator('.data-table-filter-panel');
  expect(await filterPanel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(await filterPanel.evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  await page.screenshot({ path: testInfo.outputPath('no-reference.png'), fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace data', exact: true }).click();
  await page.getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Roles' }).click();
  const roleNames = await page.locator('.role-card .role-name').allTextContents();
  expect(roleNames.length).toBeGreaterThan(0);
  for (const name of roleNames) {
    await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete role', exact: true }).click();
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(page.getByText('There are no roles to judge runes against.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(page.locator('.rune-filter-strip')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('no-roles.png'), fullPage: true });
});
