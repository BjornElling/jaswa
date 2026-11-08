import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Three monsters across three locations for the roster and Storage strips; the
   synthetic account is the one carrying artifacts, both engraved and loose. */
const monsterAccount = fileURLToPath(new URL('./fixtures/storage-location-account.json', import.meta.url));
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

/**
 * Drag one handle of a two-handle range to a fraction of its own track.
 *
 * The grab point is computed rather than taken from the input's own box: the
 * two inputs are stacked over the whole rail and only their thumbs take the
 * pointer, so the box's centre is the middle of the track and not the handle.
 * The thumb sits at its value's share of the travel the thumb actually has,
 * which is the same offset the component's own `handlePosition` applies.
 */
const thumb = 16;
async function dragHandle(page: Page, handle: Locator, track: Locator, fraction: number) {
  const rail = await track.boundingBox();
  if (!rail) throw new Error('the slider is not on screen');
  const minimum = Number(await handle.getAttribute('min'));
  const maximum = Number(await handle.getAttribute('max'));
  const at = (share: number) => rail.x + thumb / 2 + share * (rail.width - thumb);
  const value = Number(await handle.inputValue());
  const centre = rail.y + rail.height / 2;

  await page.mouse.move(at((value - minimum) / (maximum - minimum)), centre);
  await page.mouse.down();
  /* Aimed a whole step past each end of the track, because a pointer landing
     exactly on the last step's boundary rounds to whichever side is nearer and
     lands one short. Beyond the track the input clamps to its own bound, which
     is what a user dragging to the end does too. */
  const overshoot = 1 / (maximum - minimum);
  await page.mouse.move(at(fraction + (fraction === 1 ? overshoot : fraction === 0 ? -overshoot : 0)), centre, { steps: 12 });
  await page.mouse.up();
}

async function openStorage(page: Page) {
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Usage', exact: true }).click();
}

/* The two-handle range used to strand itself: with both handles clamped
   against each other, dragging them together to one value left the upper input
   unable to go down and the lower one buried beneath it, so the interval was
   stuck on that value for the rest of the session. Both ends of the track did
   it. Neither handle is fenced in now — the lower of the two values is simply
   the interval's lower end — so this drives the range into each corner and out
   of it again. */
test('the level range can leave both ends of its own track', async ({ page }) => {
  await importAccount(page, monsterAccount);
  await openStorage(page);

  const track = page.locator('.storage-filter-level .range-slider-track');
  const lower = page.getByRole('slider', { name: 'Minimum monster level' });
  const upper = page.getByRole('slider', { name: 'Maximum monster level' });

  await dragHandle(page, lower, track, 1);
  await expect(lower).toHaveValue('40');
  await expect(upper).toHaveValue('40');

  /* The interval is collapsed on the top of the track. The handle the pointer
     can reach there has to be the one that can still move downwards — before
     the fix there was none, and the range stayed on 40–40 for good. */
  await dragHandle(page, upper, track, 0.5);
  await expect(upper).toHaveValue('40');
  expect(Number(await lower.inputValue())).toBeLessThan(40);

  /* Now the same at the bottom: carry the upper handle down onto the lower one,
     which is already at 1, and the interval collapses on the first step. */
  await dragHandle(page, lower, track, 0);
  await dragHandle(page, upper, track, 0);
  await expect(lower).toHaveValue('1');
  await expect(upper).toHaveValue('1');

  /* And out of that corner again. */
  await dragHandle(page, lower, track, 0.5);
  await expect(lower).toHaveValue('1');
  expect(Number(await upper.inputValue())).toBeGreaterThan(1);
});

/* A handle carried past its partner takes over the other end of the interval
   rather than stopping against it, so the interval the user draws is the one
   they get. */
test('a level handle dragged past its partner takes the other end', async ({ page }) => {
  await importAccount(page, monsterAccount);
  await openStorage(page);

  const track = page.locator('.storage-filter-level .range-slider-track');
  const lower = page.getByRole('slider', { name: 'Minimum monster level' });
  const upper = page.getByRole('slider', { name: 'Maximum monster level' });

  await dragHandle(page, lower, track, 0.25);
  await dragHandle(page, upper, track, 0.75);
  const drawnLower = await lower.inputValue();
  expect(Number(drawnLower)).toBeLessThan(Number(await upper.inputValue()));

  /* Carry the upper handle down past the lower one. The pair stays in order,
     and the interval now ends where the lower handle stood. */
  await dragHandle(page, upper, track, 0.05);
  expect(Number(await lower.inputValue())).toBeLessThanOrEqual(Number(await upper.inputValue()));
  expect(await upper.inputValue()).toBe(drawnLower);
});

test('Reset filters puts one page’s filters back and leaves the other alone', async ({ page }) => {
  await importAccount(page, monsterAccount);
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();


  const roster = page.locator('.filter-strip:not(.storage-filter-strip)');
  const rosterSummary = roster.locator('.filter-summary');
  /* What the page opens on, which is what a reset has to return to. Not the
     account's whole count: one of the roster's own defaults hides monsters
     below the level cap, so the opening view is already narrower than the
     table. */
  const opening = await rosterSummary.textContent();
  expect(opening).toMatch(/of \d+ shown/);

  /* Narrow the roster two ways: a search term, and one of the Include toggles
     that starts on — an empty default and a true default. */
  await page.getByRole('textbox', { name: 'Filter monsters by name or set' }).fill('zzzz');
  await roster.getByRole('button', { name: 'Storage', exact: true }).click();
  await expect(rosterSummary).not.toHaveText(String(opening));

  /* Narrow Storage too, so the reset can be shown to belong to one page. */
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Usage', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Inventory' }).uncheck();
  const storageNarrowed = await page.locator('.storage-filter-strip .filter-summary').textContent();

  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await roster.getByRole('button', { name: 'Reset monsters filters' }).click();

  await expect(rosterSummary).toHaveText(String(opening));
  await expect(page.getByRole('textbox', { name: 'Filter monsters by name or set' })).toHaveValue('');
  await expect(roster.getByRole('button', { name: 'Storage', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Usage', exact: true }).click();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toHaveText(String(storageNarrowed));

  /* Storage's own reset restores its own defaults, sliders included. */
  const lower = page.getByRole('slider', { name: 'Minimum monster level' });
  await dragHandle(page, lower, page.locator('.storage-filter-level .range-slider-track'), 0.6);
  expect(await lower.inputValue()).not.toBe('1');
  await page.getByRole('button', { name: 'Reset Numbers monsters filters' }).click();
  await expect(lower).toHaveValue('1');
  await expect(page.getByRole('slider', { name: 'Maximum monster level' })).toHaveValue('40');
  await expect(page.getByRole('checkbox', { name: 'Inventory' })).toBeChecked();
});

test('Reset filters restores the artifact library defaults', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await page.getByRole('button', { name: 'Artifacts', exact: true }).click();

  const strip = page.locator('.artifact-filter-strip');
  const summary = strip.locator('.filter-summary');
  const total = (await summary.textContent())?.match(/of (\d+) shown/)?.[1];
  expect(total).toBeTruthy();

  await page.getByRole('textbox', { name: 'Filter artifacts by monster or property' }).fill('zzzz');
  await strip.locator('.artifact-filter-location').getByRole('button', { name: 'Engraved' }).click();
  await expect(summary).not.toContainText(`${total} of ${total} shown`);

  await page.getByRole('button', { name: 'Reset artifacts filters' }).click();
  await expect(summary).toContainText(`${total} of ${total} shown`);
  await expect(strip.locator('.artifact-filter-location').getByRole('button', { name: 'Engraved' }))
    .toHaveAttribute('aria-pressed', 'true');
});

/* The three chooser panels reset without a visible/total count to check
   against, so the assertion is the filters' own pressed state — and, where a
   panel chooses one record out of its own narrowed list, that the choice went
   with them. An artifact left selected would name a record the restored list no
   longer points at. */
test('Reset filters restores the recommendation panel’s defaults', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await page.getByRole('button', { name: 'Artifact Optimization' }).click();

  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const panel = page.locator('.artifact-recommendation-filters');
  const engraved = panel.locator('.artifact-recommendation-filter-planned-location').getByRole('button', { name: 'Engraved' });
  const attribute = panel.locator('.artifact-recommendation-filter-type').getByRole('button').first();

  /* One default that starts on and one that starts off, so the reset is shown
     to restore a value rather than merely clearing everything. */
  await expect(engraved).toHaveAttribute('aria-pressed', 'true');
  await engraved.click();
  await attribute.click();
  await expect(engraved).toHaveAttribute('aria-pressed', 'false');
  await expect(attribute).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Reset recommendation filters' }).click();
  await expect(engraved).toHaveAttribute('aria-pressed', 'true');
  await expect(attribute).toHaveAttribute('aria-pressed', 'false');
});

test('Reset filters clears every chooser in both recommendation panels', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await page.getByRole('button', { name: 'Artifact Optimization' }).click();

  await page.locator('summary').filter({ hasText: 'Best monster for this artifact' }).click();
  const monsterPanel = page.locator('.best-monster-filters');
  const quality = monsterPanel.locator('.best-monster-filter-quality').getByRole('button').first();
  const artifactChoice = page.getByRole('combobox', { name: 'Choose an artifact for monster recommendations' });

  /* Chosen before the filter narrows the list, which is the state reset has to
     undo: the selection outlives a filter that no longer lists it. */
  await artifactChoice.selectOption({ index: 1 });
  await expect(artifactChoice).not.toHaveValue('');
  await quality.click();
  await expect(quality).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Reset artifact filters' }).click();
  await expect(quality).toHaveAttribute('aria-pressed', 'false');
  await expect(artifactChoice).toHaveValue('');

  /* The monster chooser is part of the same reset contract as its filters. One
     filter that starts off and one that starts on, so the reset is shown
     restoring values rather than merely clearing. */
  await page.locator('summary').filter({ hasText: 'Best artifact for this monster' }).click();
  const artifactPanel = page.locator('.best-artifact-filters');
  const location = artifactPanel.locator('.best-artifact-filter-location').getByRole('button').first();
  const intangible = artifactPanel.locator('.best-artifact-filter-include').getByRole('button', { name: 'Include' });
  const monsterChoice = page.getByRole('combobox', { name: 'Choose a monster for artifact recommendations' });
  const recommendationCount = artifactPanel.getByRole('slider', { name: 'Number of recommendations per category' });

  await expect(recommendationCount).toHaveValue('3');

  await monsterChoice.selectOption({ index: 1 });
  await expect(monsterChoice).not.toHaveValue('');
  await location.click();
  await intangible.click();
  await expect(location).toHaveAttribute('aria-pressed', 'true');
  await expect(intangible).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Reset filters for this monster' }).click();
  await expect(location).toHaveAttribute('aria-pressed', 'false');
  await expect(intangible).toHaveAttribute('aria-pressed', 'true');
  await expect(monsterChoice).toHaveValue('');
});
