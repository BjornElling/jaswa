import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The priority list (`monster-priority.ts`) and the one place it is read: Rune
 * Optimization leaves the runes of higher-ranked monsters alone unless told
 * otherwise.
 */

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function importAccount(page: Page) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
}

async function openPriority(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Priority' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Priority', exact: true })).toBeVisible();
}

async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  });
}

const places = (page: Page) => page.locator('.monster-priority-place').allInnerTexts();
const order = (page: Page) => page.locator('.monster-priority-entry .monster-name').allInnerTexts();

test('without an import the page says what it needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openPriority(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('priority-no-import.png'), fullPage: true });
});

test('builds the list from the menu, orders it three ways, and keeps it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPriority(page);

  /* Empty by default, and saying what to do. */
  await expect(page.getByText('Nobody ranked yet.', { exact: false })).toBeVisible();
  const menu = page.getByLabel('Add mon', { exact: true });
  const addPanel = page.locator('.monster-priority-add-panel');
  const panelBox = await box(addPanel);
  const menuBox = await box(menu);
  /* The text beside the field is centred on the field, not on the label and field together. */
  const aboutBox = await box(page.locator('.monster-priority-about > span'));
  expect(Math.abs((aboutBox.y + aboutBox.height / 2) - (menuBox.y + menuBox.height / 2))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('priority-empty.png'), fullPage: true });

  const names = await menu.locator('option:not([value=""])').allInnerTexts();
  expect(names).toHaveLength(2);
  /* Opening the menu fetches the portraits, so an added monster arrives with its face. */
  const warming = page.waitForRequest(/\/monster-images\//, { timeout: 2000 });
  await menu.focus();
  await warming;
  await menu.selectOption('12');
  await menu.selectOption('11');

  /* Added in the order chosen, numbered from #1, and gone from the menu. */
  expect(await places(page)).toEqual(['#1', '#2']);
  const [second, first] = names;
  expect((await order(page)).length).toBe(2);
  await expect(menu).toHaveValue('');
  await expect(menu).toBeDisabled();
  /* Picking from the menu moves nothing above the list. */
  expect(await box(addPanel)).toEqual(panelBox);
  expect(await box(menu)).toEqual(menuBox);
  /* A rule between entries, none under the last. */
  const rules = await page.locator('.monster-priority-entry').evaluateAll((entries) => entries.map((entry) => getComputedStyle(entry).borderBottomWidth));
  expect(rules).toEqual(['1px', '0px']);
  /* What each copy wears, read from the import: six runes, no artifacts, no relic. */
  const firstEntry = page.locator('.monster-priority-entry').first();
  await expect(firstEntry.getByRole('img', { name: '6 of 6 runes equipped' })).toHaveText('6/6');
  await expect(firstEntry.getByRole('img', { name: '0 of 2 artifacts equipped' })).toHaveText('0/2');
  await expect(firstEntry.getByRole('img', { name: 'No relic' })).toBeVisible();
  expect(await firstEntry.locator('.speed-summary-mark').evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-state'))))
    .toEqual(['good', 'bad', 'bad']);
  /* The column names stand over their cells. */
  const head = await box(page.locator('.monster-priority-head > span').nth(3));
  const runesCell = await box(firstEntry.locator('.monster-priority-gear').first());
  expect(Math.abs(head.x - runesCell.x)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('priority-full.png'), fullPage: true });

  const initial = await order(page);
  expect(new Set(initial)).toEqual(new Set([first, second]));

  /* The arrows. */
  const top = initial[0];
  await page.getByRole('button', { name: `Move ${top} down` }).click();
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  await expect(page.getByRole('button', { name: `Move ${initial[1]} up` })).toBeDisabled();
  await page.getByRole('button', { name: `Move ${top} up` }).click();
  expect(await order(page)).toEqual(initial);

  /* Dragging. */
  const entries = page.locator('.monster-priority-entry');
  await entries.nth(0).dragTo(entries.nth(1), { targetPosition: { x: 40, y: 40 } });
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  expect(await places(page)).toEqual(['#1', '#2']);

  /* Kept across a reload, and stored as unit ids. */
  await page.reload();
  await openPriority(page);
  expect(await order(page)).toEqual([initial[1], initial[0]]);
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}').monsterPriority);
  expect(stored).toHaveLength(2);

  /* Removing takes the entry out and gives it back to the menu. */
  await page.getByRole('button', { name: `Remove ${initial[0]} from the priority list` }).click();
  expect(await order(page)).toEqual([initial[1]]);
  await expect(page.getByLabel('Add mon', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: `Remove ${initial[1]} from the priority list` }).click();
  await expect(page.getByText('Nobody ranked yet.', { exact: false })).toBeVisible();
});

test('Optimize opens Rune Optimization on that monster', async ({ page }) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openPriority(page);
  await page.getByLabel('Add mon', { exact: true }).selectOption('12');
  await page.getByRole('button', { name: /^Optimize runes for / }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('12');
});

test('the monster overlay Optimize button shares the priority button hover', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await openPriority(page);
  await page.getByLabel('Add mon', { exact: true }).selectOption('12');
  const row = page.locator('.monster-priority-entry');
  const priorityAction = row.getByRole('button', { name: /^Optimize runes for / });
  await priorityAction.hover();
  await expect(priorityAction).toHaveCSS('color', 'rgb(217, 173, 82)');
  const hover = async (button: Locator) => button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, borderColor: style.borderColor, backgroundColor: style.backgroundColor };
  });
  const priorityColors = await hover(priorityAction);
  await row.locator('.monster-link').click();
  const dialog = page.getByRole('dialog');
  const action = dialog.getByRole('button', { name: /^Optimize runes for / });
  const before = await box(action);
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-rest.png') });
  await action.hover();
  await expect.poll(() => hover(action)).toEqual(priorityColors);
  expect(await box(action)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('monster-optimize-hover.png') });
});

test('Rune Optimization leaves a higher-priority monster\'s runes alone until told otherwise', async ({ page }, testInfo) => {
  /* Six complete searches and the priority edits share this test's time budget. */
  test.slow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);

  const considered = async () => {
    const status = page.getByRole('status').filter({ hasText: 'runes considered' });
    await expect(status).toBeVisible();
    return Number((await status.innerText()).match(/([\d,.]+) runes considered/)?.[1].replace(/[,.]/g, ''));
  };
  const find = async () => {
    await page.getByRole('button', { name: 'Find builds' }).click();
    await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
    return considered();
  };

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const inventoryOnly = page.getByLabel('Only use runes from inventory');
  const include = page.getByLabel('Include runes from higher-priority monsters');
  /* Both off, and neither ever disables the other. */
  await expect(inventoryOnly).not.toBeChecked();
  await expect(include).not.toBeChecked();
  const withEveryone = await find();

  /* An empty list spares nobody. Monster 12 ranked first, 11 left off: 12's runes are spared. */
  await openPriority(page);
  await page.getByLabel('Add mon', { exact: true }).selectOption('12');
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  const spared = await find();
  expect(spared).toBeLessThan(withEveryone);

  /* 11 above 12: nothing is spared for 11. */
  await openPriority(page);
  await page.getByLabel('Add mon', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: /^Move .* up$/ }).last().click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  expect(await find()).toBe(withEveryone);

  /* 12 back on top, and the switch ticked: nothing is spared either. */
  await openPriority(page);
  await page.getByRole('button', { name: /^Move .* up$/ }).last().click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  expect(await find()).toBe(spared);
  const includeBox = await box(include);
  const inventoryBox = await box(inventoryOnly);
  await include.check();
  expect(await find()).toBe(withEveryone);

  /* Inventory only leaves the other switch as it is, enabled and in place. */
  await inventoryOnly.check();
  await expect(include).toBeEnabled();
  await expect(include).toBeChecked();
  expect(await box(include)).toEqual(includeBox);
  expect(await box(inventoryOnly)).toEqual(inventoryBox);
  /* With two monsters, sparing the other one and taking from nobody refuse the same runes. */
  expect(await find()).toBe(spared);
  await page.screenshot({ path: testInfo.outputPath('priority-optimization-switches.png'), fullPage: true });
});
