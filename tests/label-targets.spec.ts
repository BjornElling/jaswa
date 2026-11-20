import { expect, test } from './test-fixtures';
import type { Page } from './test-fixtures';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

async function importAccount(page: Page, file: string) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText(basename(file))).toBeVisible();
}

async function openEverything(page: Page, name: string) {
  await page.getByRole('button', { name }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  /* Until none is shut: opening a bar can reveal bars inside it, such as
     Relic Optimization's two on Artifact Optimization. */
  const shut = page.locator('main details:not([open]) > summary');
  for (let left = 40; left > 0 && await shut.count() > 0; left -= 1) await shut.first().click();
}

/**
 * A `<label for>` hands its whole box to the control it names: the browser
 * gives that control `:hover` while the pointer is anywhere inside the label,
 * and forwards a click there to it too. So the box may not be bigger than the
 * words — a caption label is a flex or grid item in almost every panel here,
 * and both layouts stretch their items, which is how "Monster" came to own a
 * 1,467px box holding 58px of text and lit its dropdown from under a button
 * 650px away.
 *
 * Labels that *wrap* their control are exempt and not collected: a checkbox
 * row or an option card is meant to be a large target.
 */
test('no label claims hover and clicks for a control across empty space', async ({ page }) => {
  await importAccount(page, artifactAccount);

  const offenders: string[] = [];
  for (const name of ['Artifacts', 'Artifact Optimization', 'Rune Clean-up', 'Settings']) {
    await openEverything(page, name);
    offenders.push(...await page.evaluate((where) => {
      const found: string[] = [];
      for (const label of document.querySelectorAll('label')) {
        const control = (label as HTMLLabelElement).control;
        if (!control || label.contains(control)) continue;
        const box = label.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const range = document.createRange();
        range.selectNodeContents(label);
        const dead = Math.round(box.width - range.getBoundingClientRect().width);
        /* A couple of pixels is rounding; a caption's box should otherwise be
           its words. */
        if (dead > 8) {
          found.push(`${where}: "${label.textContent?.trim()}" is ${dead}px wider than its text, and all of it targets #${control.id}`);
        }
      }
      return found;
    }, name));
  }

  expect(offenders).toEqual([]);
});

/**
 * The report that found it, driven the way it was reported: the pointer goes
 * to an empty patch under Reset filters, and the monster dropdown on the other
 * side of the panel must not react.
 */
test('an empty patch of a filter panel hovers nothing', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openEverything(page, 'Artifact Optimization');

  const dropdown = page.locator('#best-artifact-monster');
  await expect(dropdown).toBeVisible();

  const reset = page.locator('.best-artifact-actions .filter-reset');
  const box = await reset.boundingBox();
  if (!box) throw new Error('the panel has no reset button to measure from');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 24);
  await expect.poll(() => dropdown.evaluate((el) => el.matches(':hover'))).toBe(false);
});
