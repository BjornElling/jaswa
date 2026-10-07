import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The one-line filter that Set, Main and Role are answered on.
 *
 * Two things are worth holding here, because both were the reason for building
 * it and neither is visible in the code: the group is one control-row high
 * whatever is chosen, and a value already chosen is not offered again. The
 * second is what makes the menu shrink as the line fills — without it the
 * control would happily add the same set twice and count it as two.
 */

const account = fileURLToPath(new URL('./fixtures/monster-overlay-account.json', import.meta.url));

async function calculatedCleanup(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const panel = page.locator('.workspace-page-content');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Rune verdicts' })).toBeVisible();
}

const group = (page: Page, name: string) => page.locator(`.filter-group[aria-label="${name}"]`);
const lineOf = (field: Locator) => field.locator('.token-choice-line');
/* Scoped to the line, because the control also keeps an unshown copy of every
   pill to measure against — see `token-choice-field.tsx`. A bare
   `.token-choice-pill` matches both and resolves to twice what is on screen. */
const pillsOf = (field: Locator) => field.locator('.token-choice-line .token-choice-pill');
const rows = (page: Page) => page.locator('table[aria-label="Rune verdicts"] tbody tr');

/** Open the line's menu and take the option at `at`, naming what was taken. */
async function pick(page: Page, field: Locator, at = 0) {
  await field.locator('.token-choice-add').click();
  const options = page.locator('.token-choice-panel [role="menuitem"]');
  const name = await options.nth(at).innerText();
  await options.nth(at).click();
  await expect(page.locator('.token-choice-panel')).toHaveCount(0);
  return name;
}

test('a chosen value becomes a pill, narrows the table, and stops being offered', async ({ page }) => {
  await calculatedCleanup(page);
  const sets = group(page, 'Filter by rune set');
  const all = await rows(page).count();
  expect(all).toBeGreaterThan(1);

  await sets.locator('.token-choice-add').click();
  const offered = await page.locator('.token-choice-panel [role="menuitem"]').allInnerTexts();
  expect(offered.length).toBeGreaterThan(1);
  await page.keyboard.press('Escape');

  const taken = await pick(page, sets);
  await expect(pillsOf(sets)).toHaveText([taken]);
  await expect(rows(page)).not.toHaveCount(all);

  await sets.locator('.token-choice-add').click();
  const left = await page.locator('.token-choice-panel [role="menuitem"]').allInnerTexts();
  expect(left).toHaveLength(offered.length - 1);
  expect(left).not.toContain(taken);
  await page.keyboard.press('Escape');

  /* Off again by its own cross, and the table comes back whole. */
  await sets.locator('.token-choice-line .token-choice-remove').click();
  await expect(pillsOf(sets)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(all);
});

test('the line keeps its height however much is chosen', async ({ page }) => {
  await calculatedCleanup(page);
  const mains = group(page, 'Filter by main property');
  const strip = page.locator('.rune-filter-strip');

  const emptyLine = await lineOf(mains).boundingBox();
  const emptyStrip = await strip.boundingBox();

  /* Everything filled in: every main property this account has. `pick` always
     takes the first still on offer, so this empties the menu. */
  for (;;) {
    await mains.locator('.token-choice-add').click();
    const options = page.locator('.token-choice-panel [role="menuitem"]');
    if (await options.count() === 0) {
      await page.keyboard.press('Escape');
      break;
    }
    await options.first().click();
  }

  const fullLine = await lineOf(mains).boundingBox();
  const fullStrip = await strip.boundingBox();
  expect(fullLine?.height).toBe(emptyLine?.height);
  expect(fullStrip?.height).toBe(emptyStrip?.height);

  /* More chosen than the line can hold, so the rest are counted rather than
     wrapped — and the counted pill opens them, each still removable. */
  const counted = mains.locator('.token-choice-more');
  await expect(counted).toBeVisible();
  const hidden = Number((await counted.innerText()).replace('+', ''));
  await counted.click();
  await expect(page.locator('.token-choice-panel .token-choice-pill')).toHaveCount(hidden);
});
