import { expect, test } from '@playwright/test';

test('The Math sits under Technical and explains the gear recommendations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  await expect(page.locator('.rail-heading')).toHaveText([
    'General', 'Monsters', 'Runes', 'Artifacts', 'Relics', 'Technical',
  ]);
  const technical = page.locator('.rail-group').last();
  await expect(technical.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(technical.getByRole('button', { name: 'The Math', exact: true })).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'The Math', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Math', exact: true })).toBeVisible();
  await expect(page.locator('summary')).toHaveText([
    '›Rune Clean-up', '›Artifact Optimization', '›Relic Optimization', '›Power up, Keep or Sell',
  ]);

  await page.locator('summary').filter({ hasText: 'Artifact Optimization' }).click();
  await expect(page.locator('[aria-label="4 plus 1.5 plus 2 equals 7.5 points"]')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Relic Optimization' }).click();
  await expect(page.locator('[aria-label="9.375 main points plus 1.5 unique points equals 10.875 score points"]')).toBeVisible();
  /* The worked example is held to the realistic power-up range: `+15` is the
     scale's reference point and may be named as such, but no relic in an
     illustration is levelled past `+12`. */
  await expect(page.locator('.math-table-relics .math-relic-level')).toHaveText(['+12', '+12']);
});

/* The verdict rules are stated in two places — this page and the code that
   decides them — so the page has to name the same five settings, in the same
   order, with the same pairing each one keeps. A slider stop renamed in
   `relic-advice.ts` and not here would leave the explanation quietly wrong. */
test('Power up, Keep or Sell states the rules the verdicts actually follow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'The Math', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Power up, Keep or Sell' }).click();

  /* Scoped to the relic disclosure. Rune Clean-up states its own verdict order in a
     table of the same kind, and a page-wide locator would have counted it — which is
     how this check came to fail on a change that had nothing to do with relics. */
  const relicVerdicts = page.locator('details').filter({ hasText: 'Power up, Keep or Sell' });
  const tables = relicVerdicts.locator('.math-table-verdicts');
  await expect(tables).toHaveCount(2);
  await expect(tables.first().locator('tbody th')).toHaveText([
    'Picky', 'Balanced', 'Optimistic', 'Wishful thinking', 'Burn it all',
  ]);
  await expect(tables.first().locator('tbody tr').first()).toContainText('Strong and better');
  await expect(tables.first().locator('tbody tr').nth(1)).toContainText('Neutral and better');

  /* The overtake gate's five thresholds, which do not move with the slider. */
  await expect(tables.nth(1).locator('tbody th')).toHaveText([
    'Exceptional', 'Strong', 'Neutral', 'Weak', 'Poor',
  ]);
  await expect(tables.nth(1).locator('tbody tr').first()).toContainText('5 %');
  await expect(tables.nth(1).locator('tbody tr').last()).toContainText('70 %');

  /* The order of the three questions is the rule, so the page must state it. */
  await expect(page.getByRole('heading', { name: 'Is this pairing worth owning at all?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Do you already own a better copy of it?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Is this attempt where the next stone should go?' })).toBeVisible();
});
