import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The monster overlay's own contracts.
 *
 * The ones held here are the ones that fail silently. A cleared preference that
 * quietly reverts to its statistics default looks like nothing at all going
 * wrong — the field simply reads its old answer again next time, and the user
 * assumes they mis-clicked. A name that grows an underline box on hover
 * re-wraps the row behind the click that opens the overlay. A record seeded
 * from the defaults at first view makes every default look like a decision.
 * And the panel is opened over a table it must line up with, so its own box is
 * measured against that table rather than against the window.
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

test('anywhere in a monster row opens its overlay, and selecting text there does not', async ({ page }) => {
  await importAccount(page);
  await monsterLinks(page);
  const row = page.locator('tbody tr').filter({ has: page.locator('.monster-link') }).first();
  const link = row.locator('.monster-link');
  const figure = row.locator('td').last();
  await figure.scrollIntoViewIfNeeded();

  /* Dragging across a figure to copy it is a selection, not a request. */
  const box = (await figure.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeHidden();

  await figure.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  /* Focus returns to the one control the row has, not to wherever it was clicked. */
  await expect(link).toBeFocused();
});

test('the overlay is centred on the table it opens over, not on the window', async ({ page }) => {
  await importAccount(page);
  await monsterLinks(page);

  /* The rail takes 224px off the left of the window, so a dialog centred on the
     viewport sits half the rail's width to the left of the content it belongs
     to. It looked like a misalignment because it was one. */
  const table = page.locator('.grid-table').first();
  const tableBox = await table.boundingBox();
  await openOverlay(page);
  const dialogBox = await page.getByRole('dialog').boundingBox();
  expect(tableBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  if (!tableBox || !dialogBox) return;

  const tableCentre = tableBox.x + tableBox.width / 2;
  const dialogCentre = dialogBox.x + dialogBox.width / 2;
  expect(Math.abs(dialogCentre - tableCentre)).toBeLessThanOrEqual(1);
  /* And it is not narrower than what it covers: the overlay takes the account
     tables' own measure so it reads as the same page rather than as a panel
     floating over it. */
  expect(dialogBox.width).toBeGreaterThanOrEqual(tableBox.width);
});

test('the actions stay clear of the edge the body scrolls against', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* Flush against the corner the buttons read as clipped, and the scrolling
     body's scrollbar came down on top of the last of them. */
  const dialogBox = await page.getByRole('dialog').boundingBox();
  const saveBox = await page.getByRole('button', { name: 'Save changes' }).boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  if (!dialogBox || !saveBox) return;

  const rightGap = (dialogBox.x + dialogBox.width) - (saveBox.x + saveBox.width);
  const bottomGap = (dialogBox.y + dialogBox.height) - (saveBox.y + saveBox.height);
  expect(rightGap).toBeGreaterThanOrEqual(12);
  expect(bottomGap).toBeGreaterThanOrEqual(12);
});

test('a stated preference is saved, and only what was stated', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  const mains = page.getByRole('button', { name: /^Attribute artifact main stats:/ });
  await mains.scrollIntoViewIfNeeded();
  await mains.click();
  await page.getByRole('group', { name: 'Attribute artifact main stats' })
    .getByRole('checkbox', { name: 'DEF' }).check();
  /* Escape closes the menu without closing the panel behind it: these menus
     take several answers, so they stay open until the reader leaves them. */
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();

  const spd = page.getByRole('spinbutton', { name: 'Desired Spd' });
  await spd.scrollIntoViewIfNeeded();
  await spd.fill('130');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const stored = await storedPreferences(page);
  /* Nothing is seeded from the statistics: a record holds the user's own
     statements and nothing else, or every default would look like a decision. */
  expect(stored).toEqual({
    1: { unitId: '1', artifacts: { attribute: { main: ['DEF'] } }, statTargets: { spd: 130 } },
  });
});

test('a composite target is stated and kept, alongside the stat it is derived from', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* E.HP follows from HP and DEF, so it is *derived* wherever it is shown — but
     a target for it is a goal its owner states, and no combination of the eight
     stat targets expresses it. Both therefore travel. */
  const ehp = page.getByRole('spinbutton', { name: 'Desired E.HP', exact: true });
  await ehp.scrollIntoViewIfNeeded();
  await ehp.fill('60000');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.statTargets).toEqual({ ehp: 60000 });
});

test('a cleared preference stays cleared, and does not fall back to the default', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* Slot 4 has a statistics default, so it opens standing in from the
     population. Opening the menu and ticking nothing off is no statement at
     all; ticking one on and then off again is the user saying they want none,
     which is stored as an empty list rather than as a silence. An absent key
     would let the default quietly return the next time the overlay opened. */
  const slot4 = page.getByRole('button', { name: /^Slot 4 main stat:/ });
  await slot4.scrollIntoViewIfNeeded();
  await slot4.click();
  const options = page.getByRole('group', { name: 'Slot 4 main stat' });
  await options.getByRole('checkbox', { name: 'HP%' }).check();
  await options.getByRole('checkbox', { name: 'HP%' }).uncheck();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.runeSlots).toEqual({ slot4: [] });

  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await openOverlay(page);
  const reopened = page.getByRole('button', { name: /^Slot 4 main stat:/ });
  await reopened.scrollIntoViewIfNeeded();
  await expect(reopened).toHaveAttribute('aria-label', 'Slot 4 main stat: Any');
});

test('a rune build is chosen as a whole pair, never as two loose sets', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* The point of the change: `Violent / Blade` is one answer. Choosing Violent
     and Blade separately could not say whether a triple Violent build would
     do, and the optimizer had to guess. */
  const builds = page.getByRole('button', { name: /^Desired rune builds:/ });
  await builds.scrollIntoViewIfNeeded();
  await builds.click();
  await page.getByRole('button', { name: 'Violent 4-piece' }).click();
  await page.getByRole('checkbox', { name: 'Violent / Blade' }).check();
  await page.keyboard.press('Escape');

  await expect(builds).toHaveAttribute('aria-label', 'Desired rune builds: Violent / Blade');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.runeSets).toEqual(['Violent / Blade']);
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

test('the panel no longer offers to adopt the statistics, or explains itself as standing in', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* A statistic the user has not looked at is not a decision they made. The
     Adopt buttons let one become a decision in a click, and the provenance line
     said so in words on every panel; both are gone, and the statistics stay as
     reference beside the answers. */
  await expect(page.getByRole('button', { name: 'Adopt' })).toHaveCount(0);
  await expect(page.getByText('Standing in from community statistics')).toHaveCount(0);
  await expect(page.getByText(/from \d[\d,]* artifacts/)).toHaveCount(0);
  /* And the separate shortfall list is gone: what falls short is marked beside
     the field that states it, rather than restated at the foot of the panel. */
  await expect(page.getByRole('heading', { name: 'Not yet met' })).toHaveCount(0);
});
