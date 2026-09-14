import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The monster overlay's own contracts.
 *
 * Three of these are the ones that fail silently. A cleared preference that
 * quietly reverts to its statistics default looks like nothing at all going
 * wrong — the chip is simply lit again next time, and the user assumes they
 * mis-clicked. A name that grows an underline box on hover re-wraps the row
 * behind the click that opens the overlay. And a record seeded from the
 * defaults at first view makes every default look like a decision, which is
 * `ARTIFACT-CANONICAL.md` §19.4's whole subject.
 */

/* One equipped copy and one bare copy: both ends of `AGENTS.md` rule 3 in one
   account, so the empty case is exercised by the same fixture. */
const account = fileURLToPath(new URL('./fixtures/monster-overlay-account.json', import.meta.url));

type StoredPreferences = Record<string, Record<string, unknown>> | undefined;

async function importAccount(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText(basename(account)).first()).toBeVisible();
}

async function monsterLinks(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Monsters', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Monsters' }).first()).toBeVisible();
  /* The disclosure bars are session state, so a fresh tab opens with them
     closed and a reload keeps whatever was open. Toggling would therefore close
     them half the time: set the state instead of flipping it. */
  for (const bar of await page.locator('details').all()) {
    if (await bar.evaluate((element: HTMLDetailsElement) => element.open)) continue;
    await bar.locator('summary').click().catch(() => {});
  }
  const links = page.locator('.monster-link');
  await expect(links.first()).toBeVisible();
  return links;
}

async function openOverlay(page: Page, index = 0) {
  const link = (await monsterLinks(page)).nth(index);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  return link;
}

function storedPreferences(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('jaswa-preferences');
    return (raw ? JSON.parse(raw).monsterPreferences : undefined) as StoredPreferences;
  });
}

test('a monster name opens its overlay without moving the row it sits in', async ({ page }) => {
  await importAccount(page);
  const link = (await monsterLinks(page)).first();
  await link.scrollIntoViewIfNeeded();

  /* The underline is declared transparent rather than added on hover, so the
     name's box has to measure the same in both states. A box that grows here
     re-wraps every cell after it (`AGENTS.md` §2). */
  const atRest = await link.boundingBox();
  await link.hover();
  const onHover = await link.boundingBox();
  expect(onHover).toEqual(atRest);

  await link.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  /* Focus opens in the body, not on the way out: stating preferences is what
     the overlay is for. */
  await expect(page.locator('.overlay-label-field input')).toBeFocused();
});

test('closing returns focus to the name that opened it', async ({ page }) => {
  await importAccount(page);
  const link = await openOverlay(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(link).toBeFocused();
});

test('a stated preference is saved, and only what was stated', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  const mains = page.getByRole('radiogroup', { name: 'Attribute artifact main stat' });
  await mains.scrollIntoViewIfNeeded();
  await mains.getByRole('radio', { name: 'DEF' }).click();

  const spd = page.locator('.overlay-targets input').nth(3);
  await spd.scrollIntoViewIfNeeded();
  await spd.fill('130');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const stored = await storedPreferences(page);
  /* Nothing is seeded from the statistics: a record holds the user's own
     statements and nothing else, or every default would look like a decision. */
  expect(stored).toEqual({
    1: { unitId: '1', artifacts: { attribute: { main: 'DEF' } }, statTargets: { spd: 130 } },
  });
});

test('a cleared preference stays cleared, and does not fall back to the default', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* Violent is a preferred default for this species, so it opens lit. Cycling
     it twice — preferred, acceptable, not wanted — is the user saying they do
     not want it, which §19.4 stores as a statement rather than as a silence. */
  const violent = page.getByRole('button', { name: /^Violent:/ });
  await violent.scrollIntoViewIfNeeded();
  await expect(violent).toHaveAttribute('aria-label', /preferred/);
  await violent.click();
  await violent.click();
  await expect(violent).toHaveAttribute('aria-label', 'Violent: not wanted');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.runeSets).toEqual({ Violent: 'unwanted' });

  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await openOverlay(page);
  const reopened = page.getByRole('button', { name: /^Violent:/ });
  await reopened.scrollIntoViewIfNeeded();
  await expect(reopened).toHaveAttribute('aria-label', 'Violent: not wanted');
});

test('a copy with nothing equipped says so in every panel', async ({ page }) => {
  await importAccount(page);
  const links = await monsterLinks(page);
  /* The second roster row is the bare copy, which carries no runes, no
     artifacts and no relic. */
  const bare = links.nth(1);
  await bare.scrollIntoViewIfNeeded();
  await bare.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page.getByText('No runes equipped')).toBeVisible();
  await expect(page.getByText('None equipped').first()).toBeVisible();
  await expect(page.getByText('None engraved')).toBeVisible();

  /* An empty account must not widen the canvas: the overlay is a fixed box over
     it, and a panel that overflowed would scroll the page behind the backdrop. */
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
