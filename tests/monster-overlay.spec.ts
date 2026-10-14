import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
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

/* One engraved copy and one bare copy: both ends of `AGENTS.md` rule 3 in one
   account, so the empty case is exercised by the same fixture. */
const account = fileURLToPath(new URL('./fixtures/monster-overlay-account.json', import.meta.url));

type StoredPreferences = Record<string, Record<string, unknown>> | undefined;

async function importAccount(page: Page, variant?: (account: Record<string, unknown>) => void) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const source = JSON.parse(readFileSync(account, 'utf8')) as Record<string, unknown>;
  variant?.(source);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: basename(account), mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(page.getByText(basename(account)).first()).toBeVisible();
}

async function monsterLinks(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Monster Stats', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Monster Stats' }).first()).toBeVisible();
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

/* The Monsters page is about Scenario, so a profile saved from it is Scenario's. */
function storedPreferences(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('jaswa-preferences');
    return (raw ? JSON.parse(raw).monsterPreferences?.scenario : undefined) as StoredPreferences;
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

test('engraved relic mains appear in current stats, while a bare copy keeps its base', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  const links = await monsterLinks(page);
  const engravedRow = page.locator('tbody tr').filter({ has: links.first() }).first();
  const before = await engravedRow.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('relic-stat-before.png') });
  await links.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.stat-range[data-figure="hp"] .overlay-stat-current')).toContainText(/34[.,]390/);
  /* Every engraved card is one fixed shape, so a rune without an innate or with two
     sub properties draws the same box as a full one. */
  const sizes = async (selector: string) => (await dialog.locator(selector).evaluateAll((elements) =>
    elements.map((element) => { const box = element.getBoundingClientRect(); return `${Math.round(box.width)}x${Math.round(box.height)}`; })));
  const runeCards = await sizes('.engraved-rune');
  expect(runeCards).toHaveLength(6);
  expect(new Set(runeCards).size).toBe(1);
  /* The six read as the game's circle: slot 1 top middle, the rest clockwise. */
  const ringOrder = async () => (await dialog.locator('.engraved-rune').evaluateAll((elements) => elements
    .map((element) => ({ box: element.getBoundingClientRect(), slot: element.getAttribute('aria-label')!.match(/^Slot (\d)/)![1] }))
    .sort((a, b) => Math.round(a.box.top - b.box.top) || a.box.left - b.box.left)
    .map(({ slot }) => slot))).join('');
  expect(await ringOrder()).toBe('612543');
  const artifactCards = await sizes('.engraved-artifact');
  expect(artifactCards).toHaveLength(2);
  expect(new Set(artifactCards).size).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('relic-stat-engraved.png') });
  expect(await engravedRow.boundingBox()).toEqual(before);
  /* The whole panel fits a 1080-pixel screen: nothing to scroll either way. */
  const body = dialog.locator('.overlay-body');
  const fits = (element: Element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight;
  expect(await body.evaluate(fits)).toBe(true);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await links.nth(1).click();
  await expect(dialog.locator('.stat-range[data-figure="hp"] .overlay-stat-current')).toContainText(/16[.,]500/);
  /* A bare copy draws the same six cards and two artifact boxes, empty. */
  expect(await sizes('.engraved-rune')).toEqual(runeCards);
  expect(await ringOrder()).toBe('612543');
  expect(await sizes('.engraved-artifact')).toEqual(artifactCards);
  expect(await dialog.locator('.overlay-body').evaluate(fits)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('relic-stat-bare.png') });
});

test('leads and element advantage reach the composites, never a stat or its range', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const rate = dialog.locator('.stat-range[data-figure="criRate"]');
  const leads = dialog.getByRole('group', { name: 'Leads and bonuses' });
  await expect(leads.locator('.overlay-lead > span:first-child')).toHaveText(['CRI Rate', 'ATK', 'DEF', 'HP']);
  const leadBoxes = () => leads.locator('input').evaluateAll((inputs) => inputs.map((input) => {
    const rect = input.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const emptyLeadBoxes = await leadBoxes();
  const before = await rate.boundingBox();
  await expect(rate.locator('.overlay-stat-current')).toContainText('51');
  await page.screenshot({ path: testInfo.outputPath('crit-bonuses-empty.png') });

  await dialog.getByLabel('Always element advantage').check();
  await dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' }).fill('33');
  await expect(rate.locator('.overlay-stat-current')).toContainText('51');
  const mark = rate.getByRole('img', { name: /Element advantage adds 15% CRI Rate to DMG.*Crit lead adds 33% CRI Rate to DMG/ });
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('title', /15%.*33%/);
  /* A range names the copy's own CRI Rate, whatever the fight adds: 51 meets a
     floor of 51, and 84 — 51 with the lead — is not met by the lead. */
  const critFloor = rate.getByRole('spinbutton', { name: 'CtR%: at least' });
  await critFloor.fill('51');
  await expect(rate.getByRole('img', { name: /You want CtR%/ })).toHaveCount(0);
  await critFloor.fill('84');
  await expect(rate.getByRole('img', { name: /You want CtR% at least 84, and this copy has 51\./ })).toBeVisible();
  await critFloor.fill('');
  const damage = dialog.locator('.stat-range[data-figure="dmg"]');
  await expect(damage.getByRole('img', { name: 'Counted with Crit lead 33%, element advantage' })).toBeVisible();

  /* The other leads the same way: in the composites they reach, never in the stat. */
  const hp = dialog.locator('.stat-range[data-figure="hp"]');
  const effective = dialog.locator('.stat-range[data-figure="ehp"]');
  const shownHp = await hp.locator('.overlay-stat-current').innerText();
  const effectiveBefore = await effective.locator('.overlay-stat-current').innerText();
  await dialog.getByRole('spinbutton', { name: 'HP, in percent' }).fill('24');
  await expect(hp.locator('.overlay-stat-current')).toHaveText(shownHp);
  await expect(hp.getByRole('img', { name: /HP lead adds 24% HP to E\.HP and E\.HP D, not to this figure or its range/ })).toBeVisible();
  await expect(effective.locator('.overlay-stat-current')).not.toHaveText(effectiveBefore);
  await expect(effective.getByRole('img', { name: 'Counted with HP lead 24%' })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'HP, in percent' }).fill('');
  /* No composite reads SPD, so there is no Speed lead to state. */
  await expect(dialog.getByRole('spinbutton', { name: 'Speed lead, in percent' })).toHaveCount(0);
  expect(await rate.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('crit-bonuses-filled.png') });
  await dialog.getByRole('checkbox', { name: 'Always crits' }).check();
  await dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' }).fill('100');
  for (const stat of ['ATK', 'DEF', 'HP']) await leads.getByRole('spinbutton', { name: `${stat}, in percent` }).fill('100');
  expect(await leadBoxes()).toEqual(emptyLeadBoxes);
  expect(await rate.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('crit-bonuses-all.png') });
  for (const stat of ['ATK', 'DEF', 'HP']) await leads.getByRole('spinbutton', { name: `${stat}, in percent` }).fill('');
  await dialog.getByRole('checkbox', { name: 'Always crits' }).uncheck();
  await dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' }).fill('33');

  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.reload();
  await openOverlay(page);
  await expect(dialog.getByLabel('Always element advantage')).toBeChecked();
  await expect(dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' })).toHaveValue('33');
  await dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' }).fill('');
  await expect(rate.getByRole('img', { name: /Element advantage adds 15% CRI Rate/ })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'CRI Rate, in percent' }).fill('33');
  await dialog.getByRole('button', { name: /^Save and optimize runes for / }).click();
  const optimizationStats = page.getByRole('group', { name: 'Stats', exact: true });
  await expect(optimizationStats.locator('.stat-range[data-figure="criRate"] .overlay-stat-current')).toContainText('51');
  await expect(optimizationStats.getByRole('img', { name: /Element advantage adds 15% CRI Rate to DMG.*Crit lead adds 33% CRI Rate to DMG/ })).toBeVisible();
  /* DMG is dealt at 51 + 15 + 33 = 99 % crit: the advantage and the lead both count. */
  await expect(optimizationStats.locator('.stat-range[data-figure="dmg"] .overlay-stat-current')).toContainText(/8[.,]183/);
});

test('Optimize opens this copy in Rune Optimization and keeps an unsaved choice', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const action = dialog.getByRole('button', { name: /^Save and optimize runes for / });
  const head = dialog.locator('.monster-overlay-head');
  const before = await head.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-before.png') });
  await action.hover();
  expect(await head.boundingBox()).toEqual(before);
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill('Arena nuker');
  await action.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('1');
  expect((await storedPreferences(page))?.['1']?.label).toBe('Arena nuker');
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-after.png') });
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

  const preferred = page.getByRole('button', { name: /^Main stat, preferred:/ });
  await preferred.click();
  await page.getByRole('menu', { name: 'Main stat, preferred' }).getByRole('menuitem', { name: 'DEF', exact: true }).click();
  /* Escape closes a menu without closing the panel behind it. */
  await preferred.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();

  const spd = page.getByRole('spinbutton', { name: 'Spd: at least' });
  await spd.fill('130');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const stored = await storedPreferences(page);
  /* Nothing is seeded from the statistics: a record holds the user's own
     statements and nothing else, or every default would look like a decision.
     The main is one answer for every piece of gear, and the band it was not given in
     is stored empty — the answer is the pair. */
  expect(stored).toEqual({
    1: { unitId: '1', mainStat: { preferred: ['DEF'], acceptable: [] }, statTargets: { spd: 130 } },
  });
});

test('an option is preferred or accepted, never both, and an empty band says what it means', async ({ page }) => {
  /* The screen the panel is composed for, where it does not scroll: on a
     shorter one an opening menu scrolls the body, which moves the grid on screen
     without moving it on the panel. */
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const line = (band: 'preferred' | 'accepted') => dialog.getByRole('button', { name: new RegExp(`^Main stat, ${band}:`) });
  const menu = (band: 'preferred' | 'accepted') => page.getByRole('menu', { name: `Main stat, ${band}` });
  const gear = dialog.locator('.overlay-gear');
  const before = await gear.boundingBox();

  /* Nothing stated narrows nothing. */
  await expect(line('preferred')).toHaveAttribute('aria-label', 'Main stat, preferred: Any');
  await expect(line('accepted')).toHaveAttribute('aria-label', 'Main stat, accepted: Any');

  await line('preferred').click();
  await menu('preferred').getByRole('menuitem', { name: 'HP', exact: true }).click();
  /* Once one band names something, the other band empty is a real answer. */
  await expect(line('accepted')).toHaveAttribute('aria-label', 'Main stat, accepted: None');
  await line('accepted').click();
  await expect(menu('accepted').getByRole('menuitem', { name: 'HP', exact: true })).toHaveCount(0);
  await menu('accepted').getByRole('menuitem', { name: 'ATK', exact: true }).click();
  await expect(line('accepted')).toHaveAttribute('aria-label', 'Main stat, accepted: ATK');
  /* Answering moves nothing outside the line that was answered. */
  expect(await gear.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await storedPreferences(page))?.['1']?.mainStat).toEqual({ preferred: ['HP'], acceptable: ['ATK'] });
});

test('a stated main the maths would not choose carries a yellow mark, and moves nothing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const preferred = dialog.getByRole('button', { name: /^Main stat, preferred:/ });
  const menu = page.getByRole('menu', { name: 'Main stat, preferred' });
  const advice = dialog.getByRole('img', { name: /by the maths/ });
  const gear = dialog.locator('.overlay-gear');
  const boxes = () => gear.locator('.overlay-row-label, .overlay-band-field').evaluateAll((elements) =>
    elements.map((element) => { const box = element.getBoundingClientRect(); return [box.x, box.y, box.width, box.height].map(Math.round).join(','); }));

  /* Saying nothing contradicts nothing: the maths is then the answer itself. */
  await expect(advice).toHaveCount(0);
  const before = await boxes();
  await gear.screenshot({ path: testInfo.outputPath('main-stat-advice-before.png') });

  /* The copy's six runes lift ATK furthest, so DEF alone contradicts both pieces. */
  await preferred.click();
  await menu.getByRole('menuitem', { name: 'DEF', exact: true }).click();
  await expect(advice).toHaveCount(1);
  await expect(advice).toHaveAttribute('data-tone', 'yellow');
  await expect(advice).toHaveAttribute('aria-label', 'Its six runes lift ATK +63%, HP +48%, DEF +9% over base,'
    + ' so by the maths artifacts want ATK; the relic wants ATK (accepting HP).');
  await gear.screenshot({ path: testInfo.outputPath('main-stat-advice-after.png') });
  /* The mark sits after a name in a fixed column: nothing around it moves. */
  expect(await boxes()).toEqual(before);

  /* ATK preferred and HP accepted is the relic's answer exactly and the
     artifacts' within one band, which is the owner's call to make. */
  await dialog.getByRole('button', { name: 'Remove DEF from Main stat, preferred' }).click();
  await preferred.click();
  await menu.getByRole('menuitem', { name: 'ATK', exact: true }).click();
  await dialog.getByRole('button', { name: /^Main stat, accepted:/ }).click();
  await page.getByRole('menu', { name: 'Main stat, accepted' }).getByRole('menuitem', { name: 'HP', exact: true }).click();
  await expect(advice).toHaveCount(0);
  expect(await boxes()).toEqual(before);
});

test('an unfinished even-slot rune keeps its completed main in gear advice', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page, (source) => {
    const units = source.unit_list as { runes: { slot_no: number; upgrade_curr: number; pri_eff: number[] }[] }[];
    const attackRune = units[0].runes.find((rune) => rune.slot_no === 2)!;
    attackRune.upgrade_curr = 9;
    attackRune.pri_eff[1] = 33;
  });
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const gear = dialog.locator('.overlay-gear');
  const boxes = () => gear.locator('.overlay-row-label, .overlay-band-field').evaluateAll((elements) =>
    elements.map((element) => { const box = element.getBoundingClientRect(); return [box.x, box.y, box.width, box.height].map(Math.round).join(','); }));
  const before = await boxes();
  await gear.screenshot({ path: testInfo.outputPath('unfinished-main-before.png') });
  await dialog.getByRole('button', { name: /^Main stat, preferred:/ }).click();
  await page.getByRole('menu', { name: 'Main stat, preferred' }).getByRole('menuitem', { name: 'DEF', exact: true }).click();
  const advice = dialog.getByRole('img', { name: /by the maths/ });
  await expect(advice).toHaveAttribute('aria-label', 'Its six runes lift ATK +63%, HP +48%, DEF +9% over base,'
    + ' so by the maths artifacts want ATK; the relic wants ATK (accepting HP).');
  await gear.screenshot({ path: testInfo.outputPath('unfinished-main-after.png') });
  expect(await boxes()).toEqual(before);
});

test('accepted mains with none preferred carry a red mark until one is preferred', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const warning = dialog.getByRole('img', { name: /choose at least one preferred main stat/ });
  const gear = dialog.locator('.overlay-gear');
  const boxes = () => gear.locator('.overlay-row-label, .overlay-band-field').evaluateAll((elements) =>
    elements.map((element) => { const box = element.getBoundingClientRect(); return [box.x, box.y, box.width, box.height].map(Math.round).join(','); }));
  const before = await boxes();

  await dialog.getByRole('button', { name: /^Main stat, accepted:/ }).click();
  await page.getByRole('menu', { name: 'Main stat, accepted' }).getByRole('menuitem', { name: 'DEF', exact: true }).click();
  await expect(warning).toHaveCount(1);
  await expect(warning).toHaveAttribute('data-tone', 'red');
  await gear.screenshot({ path: testInfo.outputPath('main-stat-no-preferred.png') });
  expect(await boxes()).toEqual(before);

  /* A preferred main makes it an answer, and the red mark goes. */
  await dialog.getByRole('button', { name: /^Main stat, preferred:/ }).click();
  await page.getByRole('menu', { name: 'Main stat, preferred' }).getByRole('menuitem', { name: 'ATK', exact: true }).click();
  await expect(warning).toHaveCount(0);
  expect(await boxes()).toEqual(before);
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

  /* Slot 4 has community statistics, but opens without a choice.
     Opening the menu and choosing nothing is no statement at all;
     adding a main and taking it off again is the user saying they want none,
     which is stored as an empty list rather than as a silence. An absent key
     would lose the distinction between never answered and deliberately cleared. */
  const slot4 = page.getByRole('button', { name: /^Slot 4 main stat:/ });
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

test('what is wanted takes the left, and what is engraved the right third', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importAccount(page);
  await openOverlay(page);
  const dialog = page.getByRole('dialog');
  const runeLabels = await dialog.locator('.monster-overlay-wants .overlay-block').first().locator('.overlay-row-label').allTextContents();
  expect(runeLabels).toEqual(['Desired builds', 'Most common']);
  const wants = (await dialog.locator('.monster-overlay-wants').boundingBox())!;
  const column = (await dialog.locator('.monster-overlay-engraved').boundingBox())!;
  expect(column.x).toBeGreaterThan(wants.x + wants.width);
  expect(Math.abs(column.width / (wants.width + column.width) - 1 / 3)).toBeLessThan(0.03);
  /* The engraved build heads the engraved runes, written the way a desired one is, and
     nothing else: no sample size beside the shares. */
  const engraved = dialog.locator('.overlay-block').filter({ has: page.getByRole('heading', { name: 'Engraved runes' }) });
  await expect(engraved.locator('.overlay-provenance')).toHaveText(/^[A-Z][a-z]+(\/[A-Z][a-z]+)+$/);
  await expect(dialog.getByText(/measured/)).toHaveCount(0);
});

test('the Runes block opens the panel, above the stats', async ({ page }) => {
  await importAccount(page);
  await openOverlay(page);
  const titles = await page.locator('.overlay-block-title').allTextContents();
  expect(titles).toEqual([
    'Runes', 'Stats', 'Settings', 'Artifacts and relics', 'Engraved runes (Scenario)', 'Engraved artifacts', 'Engraved relics', 'Most common artifacts',
  ]);
});

test('a copy with nothing engraved says so in every panel', async ({ page }) => {
  await importAccount(page);
  const links = await monsterLinks(page);
  /* The second roster row is the bare copy, which carries no runes, no
     artifacts and no relic. */
  const bare = links.nth(1);
  await bare.scrollIntoViewIfNeeded();
  await bare.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page.getByText('No runes engraved')).toBeVisible();
  /* Both artifact slots and the relic list say it in the same words. */
  await expect(page.getByText('None engraved')).toHaveCount(3);
  await expect(page.locator('.overlay-empty').getByText('None engraved')).toBeVisible();

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
