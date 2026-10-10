import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('calculates and shows a verdict for every imported rune', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await expect(cleanup.getByText('Nothing calculated yet.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-empty.png') });

  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  /* Either engine is a pass: the browsers this suite drives expose no WebGPU, so the
     label is always Processor here — but asserting that would make the check a
     statement about the test browser rather than about the page. */
  await expect(page.locator('.calculation-status'))
    .toHaveText(/4 runes judged against [\d,]+ roles · [\d,]+ ms · (Graphics card|Processor)/);
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.getByRole('img', { name: /quality$/ })).toHaveCount(4);
  await expect(page.getByRole('table', { name: 'Rune verdict columns' }).locator('thead th'))
    .toHaveText(['Set', 'Slot', 'Lv.', 'Main', 'Innate', 'Sub properties', 'Location', 'Best role', 'Maxvalue', 'Chance', 'Advice']);
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-calculated.png') });
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

  const quality = page.getByRole('group', { name: 'Filter by rune quality' });
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
  await expect(page.getByText('Nothing to judge until a game file is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const safeguard = page.getByRole('checkbox', { name: 'Never sell if pre-grind spd ≥' });
  const minimum = page.getByRole('textbox', { name: 'Minimum pre-grind speed' });
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(page.getByText('Any role', { exact: true })).toHaveCount(0);
  await expect(safeguard).toBeChecked();
  await expect(minimum).toHaveValue('20');
  await expect(minimum).toHaveCSS('text-align', 'center');
  await safeguard.uncheck();
  await expect(minimum).toBeDisabled();
  const wording = page.locator('.rune-speed-protection label');
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
