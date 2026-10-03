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
  await expect(page.locator('.stat-range-input').first()).toBeFocused();
});

test('a nickname is typed in place after the name, and its parentheses are the heading\'s own', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const heading = dialog.getByRole('heading', { level: 2 });
  const name = (await heading.textContent()) ?? '';
  await expect(dialog.getByText('Your name for this copy')).toHaveCount(0);

  /* Escape leaves the field, not the panel, and throws the typing away. */
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill('Discarded');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(heading).toHaveText(name);

  /* Typing the parentheses the heading already draws does not double them. */
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill('  (Arena nuker) ');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(heading).toHaveText(`${name} (Arena nuker)`);
  await expect(dialog.getByRole('button', { name: 'Edit nickname' })).toBeFocused();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.label).toBe('Arena nuker');
  /* The table names the copy as the heading does: the game's name first, the
     nickname after it, never in its place. */
  await expect(page.locator('.monster-link').first()).toHaveText(`${name} (Arena nuker)`);
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

test('the actions sit on the lower edge, beside the close button and clear of it', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* A footer bar cut the scrolling body short above it and read as a second
     panel. The buttons now straddle the edge the close button does, on its
     line, so the body scrolls all the way down to that edge. */
  const dialogBox = await page.getByRole('dialog').boundingBox();
  const saveBox = await page.getByRole('button', { name: 'Save changes' }).boundingBox();
  const closeBox = await page.getByRole('button', { name: 'Close' }).boundingBox();
  expect(dialogBox && saveBox && closeBox).toBeTruthy();
  if (!dialogBox || !saveBox || !closeBox) return;

  const edge = dialogBox.y + dialogBox.height;
  expect(Math.abs(saveBox.y + saveBox.height / 2 - edge)).toBeLessThan(2);
  expect(Math.abs(closeBox.y + closeBox.height / 2 - edge)).toBeLessThan(2);
  /* The workspace scales, so the step between them arrives a little under its
     stated 12px; what matters is that they never touch. */
  expect(closeBox.x - (saveBox.x + saveBox.width)).toBeGreaterThanOrEqual(6);
  await expect(page.locator('.dialog-actions')).toHaveCount(0);
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

  const spd = page.getByRole('spinbutton', { name: 'Spd: at least' });
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
  const ehp = page.getByRole('spinbutton', { name: 'E.HP: at least', exact: true });
  await ehp.scrollIntoViewIfNeeded();
  await ehp.fill('60000');
  /* The other end of the range is its own answer, kept apart from the first. */
  await page.getByRole('spinbutton', { name: 'Spd: at most', exact: true }).fill('200');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await storedPreferences(page))?.['1']?.statTargets).toEqual({ ehp: 60000 });
  expect((await storedPreferences(page))?.['1']?.statCeilings).toEqual({ spd: 200 });
});

test('a cleared preference stays cleared, and does not fall back to the default', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* Slot 4 has a statistics default, so it opens standing in from the
     population. Opening the menu and choosing nothing is no statement at all;
     adding a main and taking it off again is the user saying they want none,
     which is stored as an empty list rather than as a silence. An absent key
     would let the default quietly return the next time the overlay opened. */
  const slot4 = page.getByRole('button', { name: /^Slot 4 main stat:/ });
  await slot4.scrollIntoViewIfNeeded();
  await slot4.click();
  await page.getByRole('menu', { name: 'Slot 4 main stat' }).getByRole('menuitem', { name: /^HP%/ }).click();
  await expect(slot4).toHaveAttribute('aria-label', 'Slot 4 main stat: HP%');
  await page.getByRole('button', { name: 'Remove HP% from Slot 4 main stat' }).click();

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

test('a rune build is chosen as a whole, set by set, never as loose sets', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);

  /* The point of the model: `Violent/Blade` is one answer. Choosing Violent
     and Blade separately could not say whether a triple Violent build would
     do, and the optimizer had to guess. */
  const builds = page.getByRole('button', { name: /^Desired rune builds:/ });
  const menu = page.getByRole('dialog', { name: 'Desired rune builds' });
  const set = (list: string, name: string) => menu.getByRole('list', { name: list }).getByRole('button', { name, exact: true });
  await builds.scrollIntoViewIfNeeded();

  /* A four-set on its own is a build — four Violent runes and two others — and a
     click in the first column adds it. */
  await builds.click();
  await set('Sets', 'Violent').click();
  await expect(menu).toHaveCount(0);
  await expect(builds).toHaveAttribute('aria-label', 'Desired rune builds: Violent');

  /* Chosen, it stays in its place, dimmed, and still opens the sets that can
     follow it. After a four-set and a two-set the six slots are spoken for, so
     there is no third column. */
  await builds.click();
  await set('Sets', 'Violent').hover();
  await expect(set('Sets', 'Violent')).toHaveAttribute('aria-disabled', 'true');
  await set('After Violent', 'Blade').hover();
  await expect(menu.getByRole('list', { name: 'After Violent and Blade' })).toHaveCount(0);
  await set('After Violent', 'Blade').click();

  /* Two-sets go three columns deep. */
  await builds.click();
  await set('Sets', 'Will').hover();
  await set('After Will', 'Revenge').hover();
  await set('After Will and Revenge', 'Destroy').click();
  await expect(builds).toHaveAttribute('aria-label', 'Desired rune builds: Violent, Violent/Blade, Will/Revenge/Destroy');

  /* A two-set stacks with itself: three Blade sets is a build of its own. */
  await builds.click();
  await set('Sets', 'Blade').hover();
  await set('After Blade', 'Blade').hover();
  await set('After Blade and Blade', 'Blade').click();
  await expect(builds).toHaveAttribute('aria-label', 'Desired rune builds: Violent, Violent/Blade, Will/Revenge/Destroy, Blade/Blade/Blade');

  /* The same six slots led by another set are the same build, and cannot be
     added a second time. */
  await builds.click();
  await set('Sets', 'Destroy').hover();
  await set('After Destroy', 'Will').hover();
  await expect(set('After Destroy and Will', 'Revenge')).toHaveAttribute('aria-disabled', 'true');
  await set('After Destroy and Will', 'Revenge').click({ force: true });
  await expect(menu).toBeVisible();
  await expect(builds).toHaveAttribute('aria-label', 'Desired rune builds: Violent, Violent/Blade, Will/Revenge/Destroy, Blade/Blade/Blade');
  await page.keyboard.press('Escape');
  /* The overlay behind survived every menu. */
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();

  /* Broken sets are the copy's own answer, off until it is given. */
  const broken = page.getByLabel('Allow broken sets');
  await expect(broken).not.toBeChecked();
  await broken.check();

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const stored = (await storedPreferences(page))?.['1'];
  expect(stored?.runeSets).toEqual(['Violent', 'Violent/Blade', 'Will/Revenge/Destroy', 'Blade/Blade/Blade']);
  expect(stored?.allowBrokenSets).toBe(true);
});

test('what is wanted leads each block, and what is worn follows as reference', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);
  const runeLabels = await page.locator('.overlay-block').first().locator('.overlay-row-label').allTextContents();
  expect(runeLabels).toEqual(['Desired builds', 'Current', 'Most common']);
  /* The worn build is written the way a desired one is, and nothing else: not
     the runes one by one, and no sample size beside the shares. */
  const runes = page.locator('.overlay-block').first();
  await expect(runes.locator('.overlay-current-build')).toHaveText(/^[A-Z][a-z]+(\/[A-Z][a-z]+)+$/);
  await expect(runes.getByText(/measured/)).toHaveCount(0);
});

test('the Runes block opens the panel, above the stats', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);
  const titles = await page.locator('.overlay-block-title').allTextContents();
  expect(titles.slice(0, 2)).toEqual(['Runes', 'Stats']);
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
