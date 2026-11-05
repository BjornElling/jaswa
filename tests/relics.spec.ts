import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Six relics chosen to reach every state the page can be in: a strong
   pair and a poor one, a relic at the ceiling, a relic whose durability ran out
   below it, a neutral fit, and two copies of one pair so the duplicate rule has
   something to decide. */
const relicAccount = fileURLToPath(new URL('./fixtures/relic-account.json', import.meta.url));

async function importAccount(page: Page, file: string) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText(basename(file))).toBeVisible();
}

async function openRelics(page: Page) {
  await page.getByRole('button', { name: 'Relic Optimization', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
}

const rows = (page: Page) => page.getByRole('table', { name: 'Relic library', exact: true }).locator('tbody tr');

/** The row for one relic, found by the effect line only that relic carries. */
const rowFor = (page: Page, effect: string) => rows(page).filter({ hasText: effect });

test('every relic in the import reaches the table', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByLabel('6 of 6 relics shown')).toBeVisible();
});

test('the unique property reads in the game’s own words', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The name is two rules — the family is what it grants, the prefix the stat
     it reads — so every one of the sixteen is a different pair. */
  const primal = rowFor(page, 'per 125 SPD');
  await expect(primal).toContainText('Nimble Primal');
  await expect(primal).toContainText('MAX HP +2 % per 125 SPD');
  await expect(rowFor(page, 'per 500 ATK')).toContainText('Sharp Conquest');
  await expect(rowFor(page, 'per 500 ATK')).toContainText('DMG dealt +1 % per 500 ATK');
  /* Named, never quantified: the main column is the stat and nothing else. */
  await expect(primal.locator('td').nth(1)).toHaveText('HP');
});

test('the unique property carries the threshold its level and stat call for', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The threshold is what a power-up moves, and it steps every three levels:
     an ATK-reading property is 2,500 at +0, 2,000 at +5 and 1,000 at +9, and a
     SPD-reading one is 150 at +9 and 125 at +12. */
  await expect(rowFor(page, 'per 2,500 ATK')).toContainText('+0');
  await expect(rowFor(page, 'per 2,000 ATK')).toContainText('+5');
  await expect(rowFor(page, 'per 1,000 ATK')).toContainText('+9');
  await expect(rowFor(page, 'per 125 SPD')).toContainText('+12');
});

test('the page claims nothing it cannot show', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Synergy is a table, not a measurement, and the power-up rates are the
     game's own — neither needs a paragraph on the page saying so. Both belong
     to `docs/RELIC-CANONICAL.md`, where they can be argued with. */
  await expect(page.getByText('Synergy is measured')).toHaveCount(0);
  await expect(page.getByText('Power-up rates are the game')).toHaveCount(0);
});

test('the table opens on synergy, best fit first', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The account has three Excellent relics; its one Poor pair closes the list. */
  await expect(rows(page).first()).toContainText('Excellent');
  await expect(rows(page).last()).toContainText('Poor');
});

test('every synergy band draws one mark in one box, before its name', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* One shape per band and one mark each: a band that drew two would be wider
     than its neighbours and re-measure the column (rule 2). */
  const marks = await page.locator('.relic-grid .relic-synergy').evaluateAll((entries) => entries.map((entry) => {
    const svgs = entry.querySelectorAll('svg');
    const label = entry.querySelector('.relic-synergy-label')?.getBoundingClientRect();
    const box = svgs[0]?.parentElement?.getBoundingClientRect();
    return { count: svgs.length, width: box?.width ?? 0, before: !!box && !!label && box.right < label.left };
  }));
  expect(marks.length).toBeGreaterThan(0);
  for (const mark of marks) {
    expect(mark.count).toBe(1);
    expect(mark.width).toBeCloseTo(marks[0].width, 3);
    expect(mark.before).toBe(true);
  }
});

test('synergy filters use neutral mark-only chips with accessible names', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const group = page.getByRole('group', { name: 'Filter by synergy' });
  const strongest = group.getByRole('button', { name: 'Excellent', exact: true });
  await expect(strongest).toHaveText('');
  for (const band of ['Excellent', 'Good', 'Niche', 'Poor', 'Trash']) {
    await expect(group.getByRole('button', { name: band, exact: true })
      .locator(`.relic-mark-synergy[data-band="${band.toLowerCase()}"]`)).toHaveCount(1);
  }
  const buttons = await group.locator('.filter-button').evaluateAll((entries) => entries.map((entry) => {
    const { x, width } = entry.getBoundingClientRect();
    return { x, width };
  }));
  buttons.forEach((entry) => expect(entry.width).toBeCloseTo(buttons[0].width, 3));
  const gaps = buttons.slice(1).map((entry, index) => entry.x - (buttons[index].x + buttons[index].width));
  gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0], 3));
  const colours = await strongest.locator('.relic-synergy-filter-mark').evaluate((mark) => [
    getComputedStyle(mark).color,
    getComputedStyle(mark.parentElement as HTMLElement).color,
  ]);
  expect(colours[0]).toBe(colours[1]);
});

test('a level says why it is where it is', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* +15 and a spent relic are both dead ends, and the page has to tell them
     apart: one is finished, the other merely stopped. */
  await expect(rowFor(page, 'per 500 ATK')).toContainText('+15');
  await expect(rowFor(page, 'per 500 ATK').getByText('At the maximum level')).toBeAttached();
  await expect(rowFor(page, 'per 1,000 ATK').getByText('No power-up attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 150 SPD').getByText('Can still be powered up')).toBeAttached();
});

test('durability is stated as attempts left, all three pips present', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rowFor(page, 'per 2,500 ATK').getByText('3 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 2,000 ATK').getByText('2 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 125 SPD').getByText('0 of 3 attempts left')).toBeAttached();
});

test('a finished relic is kept even though it can never reach +15', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The case that forces two recursions rather than one: P(+15) is 0 because
     the durability is gone, and the relic is still one of the best on the
     account. Judging it on P alone would have sold it. */
  const spent = rowFor(page, 'per 125 SPD');
  await expect(spent).toContainText('Keep');
  /* With no attempts left it ends where it stands, so no likely end repeats the level. */
  await expect(reasonFor(page, 'per 125 SPD')).not.toContainText('chance of +');
});

test('the likely end names a level the relic can realistically reach', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* A fresh relic is certain to +3 and then fights a falling rate, so it lands
     around +7 — not at +15, which the published rates make a lottery. */
  await expect(reasonFor(page, 'per 2,500 ATK').locator('.relic-landing')).toContainText('chance of +7 or higher');
  await expect(reasonFor(page, 'per 2,000 ATK').locator('.relic-landing')).toContainText('chance of +7 or higher');
});

/** The verdict, then the reason beside it that carries the chance or status. */
const adviceFor = (page: Page, effect: string) =>
  rowFor(page, effect).locator('.relic-verdict, .relic-advice-reason');
/** The reason column: the explanation, then the likely end where one is printed. */
const reasonFor = (page: Page, effect: string) => rowFor(page, effect).locator('td').nth(7);

test('the advice shows a verdict with its short chance', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Power up', 'The next +1 is certain.']);
  await expect(adviceFor(page, 'per 500 ATK')).toHaveText(['Keep', 'No power-ups left.']);
});

test('the visible advice shows the game chance, not the ranking conversion', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(adviceFor(page, 'per 150 SPD')).toHaveText(['Sell', '4.8% chance to pass the +12 copy']);
});

/* The duplicate gate answers a question the player has no taste about, so the
   slider must not move it. This challenger is Excellent and has a 4.8 % chance
   of passing the +12 beside it — just under the 5 % an Excellent pair is
   allowed — and no setting, not even Naive, buys stones for an attempt
   that cannot land. */
test('the duplicate gate ignores the slider at every stop', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, 'per 150 SPD');
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });
  const advice = adviceFor(page, 'per 150 SPD');
  await expect(challenger).toContainText('Excellent');

  for (const stop of ['1', '2', '3', '4', '5']) {
    await threshold.fill(stop);
    await expect(advice).toHaveText(['Sell', '4.8% chance to pass the +12 copy']);
  }
});

test('the score threshold gates the minimum synergy band without wasting a tier', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });
  const poor = rowFor(page, 'per 2,000 ATK');
  /* The default, Balanced, keeps Niche and better, so a Poor pair is sold. */
  await expect(threshold).toHaveValue('3');
  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText(['Sell', 'Poor fit, below the threshold.']);
  await threshold.fill('4');
  /* Poor is admitted at Optimistic, and this +5 → +6 success also improves its
     unique property. The hard gate still rejects it at the stricter settings;
     once admitted, JASWA must not stop one level before the tier it is buying. */
  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText(['Power up', '60% chance of the next +1']);
  await threshold.fill('1');
  await expect(poor).toContainText('Sell');
  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText(['Sell', 'Poor fit, below the threshold.']);
  await threshold.fill('5');
  await expect(poor).toContainText('Power up');
});

test('changing the score threshold leaves the table geometry fixed', async ({ page }, testInfo) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const table = page.getByRole('table', { name: 'Relic library', exact: true });
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });
  const before = await table.locator('tbody tr').evaluateAll((cells) => cells.map((cell) => {
    const { x, y, width, height } = cell.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await page.screenshot({ path: testInfo.outputPath('relic-threshold-before.png') });

  await threshold.fill('5');
  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText(['Power up', '60% chance of the next +1']);
  await page.screenshot({ path: testInfo.outputPath('relic-threshold-after.png') });

  const after = await table.locator('tbody tr').evaluateAll((cells) => cells.map((cell) => {
    const { x, y, width, height } = cell.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(after).toEqual(before);
});

test('a certain level powers up once the pair is one the setting keeps', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const fresh = rowFor(page, 'per 2,500 ATK');
  await expect(fresh).toContainText('Niche');
  await expect(fresh).toContainText('Power up');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Power up', 'The next +1 is certain.']);
});

/* The rule the gate's move exists for. A guaranteed level is guaranteed waste on
   a pair the account has said it does not want, so the gate is asked first — the
   same fresh Niche relic that powers up at Balanced is sold at Picky, which
   keeps only Good and better, and its reason names the gate rather than
   the certain level it would otherwise have taken. */
test('the synergy gate outranks the certain level below +3', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });
  const fresh = rowFor(page, 'per 2,500 ATK');
  await expect(fresh).toContainText('Niche');

  await threshold.fill('2');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Sell', 'Niche fit, below the threshold.']);
  await threshold.fill('3');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Power up', 'The next +1 is certain.']);
});

/* Very restrictive keeps Excellent pairs alone — that is its promise — and Picky,
   one stop over, is the cautious setting that keeps the Good ones too. */
test('the two strictest stops keep Excellent, then Good as well', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });
  const good = rowFor(page, 'per 1,000 ATK');
  await expect(good).toContainText('Good');
  await threshold.fill('1');
  await expect(adviceFor(page, 'per 1,000 ATK')).toHaveText(['Sell', 'Good fit, below the threshold.']);
  await expect(adviceFor(page, 'per 125 SPD')).toHaveText(['Keep', 'No power-ups left.']);
  await threshold.fill('2');
  await expect(good).not.toContainText('Sell');
});

test('a relic engraved on monsters counts them, and one in the inventory says so', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const engraved = rowFor(page, 'per 125 SPD');
  await expect(engraved.locator('td').nth(5)).toHaveText('2');
  await expect(rowFor(page, 'per 150 SPD').locator('td').nth(5)).toHaveText('—');
});

test('filters narrow the table and Reset puts every one of them back', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const threshold = page.getByRole('slider', { name: 'Power-up threshold, very restrictive to naive' });

  /* Balanced, the default, rejects the account's Poor pair, which is what gives
     the two filters below something to narrow. */
  await threshold.fill('3');
  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Sell' }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('group', { name: 'Filter by main stat' }).getByRole('button', { name: 'ATK' }).click();
  await expect(rows(page)).toHaveCount(1);
  await threshold.fill('5');

  await page.getByRole('button', { name: 'Reset relics filters' }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(threshold).toHaveValue('3');
});

test('the headings say what their column holds', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const heading = page.getByRole('table', { name: 'Relic library columns' });
  await expect(heading.getByRole('button', { name: 'Why the advice says so, and where the relic likely ends' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'Monsters it is engraved on' })).toBeVisible();
  await expect(heading.locator('th')).toHaveCount(8);
});

test('a filter click never moves the columns under the user', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const heading = page.getByRole('table', { name: 'Relic library columns' });
  const before = await heading.locator('th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));

  await page.getByRole('group', { name: 'Filter by synergy' }).getByRole('button', { name: 'Excellent', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);

  const after = await heading.locator('th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(after).toEqual(before);
});

/* ------------------------------------------------------------- the editor */

const editor = (page: Page) => page.getByRole('dialog', { name: 'Synergy map' });
const cell = (page: Page, name: string) => editor(page).getByRole('button', { name, exact: true });

async function openEditor(page: Page) {
  await page.getByRole('button', { name: 'Synergy map', exact: true }).click();
  await expect(editor(page)).toBeVisible();
}

test('the synergy map opens over the page with every pair in it', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const opener = page.getByRole('button', { name: 'Synergy map', exact: true });
  await expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
  await openEditor(page);
  await expect(editor(page).locator('.relic-synergy-cell')).toHaveCount(48);
  await expect(cell(page, 'Sharp Conquest, ATK main: Excellent')).toBeVisible();
  await expect(cell(page, 'Solid Resolute, HP main: Trash')).toBeVisible();
  /* Nothing has been changed, so there is nothing to reset or save. */
  await expect(editor(page).getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
  await expect(editor(page).getByRole('button', { name: 'Save synergy' })).toBeDisabled();
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeAttached();
  await editor(page).getByRole('button', { name: 'Close' }).click();
  await expect(editor(page)).toBeHidden();
  await expect(opener).toBeFocused();
});

test('a click steps a cell down the scale, Shift steps it back, and the cell never moves', async ({ page }, testInfo) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await openEditor(page);
  const cells = editor(page).locator('.relic-synergy-cell');
  const boxes = () => cells.evaluateAll((entries) => entries.map((entry) => {
    const { x, y, width, height } = entry.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('relic-synergy-before.png') });

  await cell(page, 'Sharp Conquest, DEF main: Niche').click();
  await expect(cell(page, 'Sharp Conquest, DEF main: Poor, default Niche')).toBeVisible();
  await cell(page, 'Sharp Conquest, DEF main: Poor, default Niche').click();
  await expect(cell(page, 'Sharp Conquest, DEF main: Trash, default Niche')).toBeVisible();
  await cell(page, 'Sharp Conquest, DEF main: Trash, default Niche').click();
  await expect(cell(page, 'Sharp Conquest, DEF main: Excellent, default Niche')).toBeVisible();
  await cell(page, 'Sharp Conquest, DEF main: Excellent, default Niche').click({ modifiers: ['Shift'] });
  await expect(cell(page, 'Sharp Conquest, DEF main: Trash, default Niche')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('relic-synergy-after.png') });
  expect(await boxes()).toEqual(before);
});

test('a saved cell is the band the library judges by, and it survives a reload', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const fresh = rowFor(page, 'per 2,500 ATK');
  await expect(fresh).toContainText('Niche');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Power up', 'The next +1 is certain.']);

  await openEditor(page);
  await cell(page, 'Sharp Conquest, DEF main: Niche').click();
  /* A draft holding edits does not go on a stray Escape. */
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeVisible();
  await editor(page).getByRole('button', { name: 'Save synergy' }).click();
  await expect(editor(page)).toBeHidden();

  await expect(fresh).toContainText('Poor');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText(['Sell', 'Poor fit, below the threshold.']);
  await page.getByRole('group', { name: 'Filter by synergy' }).getByRole('button', { name: 'Poor', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);

  await page.reload();
  await openRelics(page);
  await expect(rowFor(page, 'per 2,500 ATK')).toContainText('Poor');
});

test('a Trash relic being sold needs no figures, and its row keeps its height', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The fixture's one Poor pair, a +5 with attempts left, so its likely end
     is printed until it turns Trash. */
  const row = rowFor(page, 'per 2,000 ATK');
  const reason = row.locator('td').last();
  await expect(reason.locator('.relic-landing')).not.toHaveText('');
  const height = (await row.boundingBox())?.height;

  await openEditor(page);
  await cell(page, 'Sharp Timeless, DEF main: Poor').click();
  await editor(page).getByRole('button', { name: 'Save synergy' }).click();
  await expect(editor(page)).toBeHidden();

  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText(['Sell', 'No further explanation needed.']);
  await expect(reason.locator('.relic-landing')).toHaveText('');
  await expect(reason).not.toHaveAttribute('title');
  expect((await row.boundingBox())?.height).toBe(height);
});

test('Reset to defaults puts every shipped cell back once saved', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await openEditor(page);
  await cell(page, 'Sharp Conquest, DEF main: Niche').click();
  await cell(page, 'Nimble Primal, HP main: Excellent').click();
  await editor(page).getByRole('button', { name: 'Save synergy' }).click();
  await expect(rowFor(page, 'per 150 SPD')).toContainText('Good');

  await openEditor(page);
  await expect(cell(page, 'Nimble Primal, HP main: Good, default Excellent')).toBeVisible();
  await editor(page).getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(cell(page, 'Nimble Primal, HP main: Excellent')).toBeVisible();
  await expect(cell(page, 'Sharp Conquest, DEF main: Niche')).toBeVisible();
  await expect(editor(page).getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
  await editor(page).getByRole('button', { name: 'Save synergy' }).click();
  await expect(rowFor(page, 'per 150 SPD')).toContainText('Excellent');
  await expect(rowFor(page, 'per 2,500 ATK')).toContainText('Niche');
});
