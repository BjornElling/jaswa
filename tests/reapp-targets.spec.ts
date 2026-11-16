import { expect, test } from './test-fixtures';
import type { Page } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));
async function openTargets(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  const disclosure = page.locator('details.bar').filter({ has: page.locator('summary', { hasText: /^›?Re-app\/refine target$/ }) });
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click();
  return page.locator('.reapp-card');
}
const geometry = (page: Page) => page.getByRole('dialog').locator('.reapp-editor-body > *, .dialog-actions').evaluateAll((nodes) => nodes.map((node) => {
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}));

async function choose(page: Page, label: string, value: string) {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole('menu', { name: label, exact: true }).getByRole('menuitem', { name: value, exact: true }).click();
}

async function chooseRemaining(page: Page, label: string) {
  while (true) {
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label}:`) }).click();
    const menu = page.getByRole('menu', { name: label, exact: true });
    expect(await page.locator('.reapp-editor-body').evaluate((node) => node.scrollLeft), `${label} menu scrolled the editor`).toBe(0);
    const items = menu.getByRole('menuitem');
    if (await items.count() === 0) { await page.keyboard.press('Escape'); return; }
    await items.first().click();
  }
}

async function fillRefineSubstats(page: Page) {
  await choose(page, 'Substats', 'SPD');
  await choose(page, 'Substats', 'CRI Rate');
  await page.getByRole('combobox', { name: 'Of these rune must have at least', exact: true }).selectOption('1');
}

test('rules handle empty and full input, incompatible mains, stable choices and persistence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const cards = await openTargets(page);
  await expect(cards).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Re-app', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Refine', exact: true })).toBeVisible();
  await expect(cards.locator('.reapp-name')).toHaveText([
    'Slot 2 — SPD, ATK %', 'Slot 4 — CRI Dmg, HP %', 'Slot 6 — HP %, ATK %',
    'Slot 2 — SPD, ATK %', 'Slot 4 — CRI Dmg, HP %', 'Slot 6 — HP %, ATK %',
  ]);
  const alignment = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const title = node.querySelector('.reapp-name')!.getBoundingClientRect();
    const actions = node.querySelector('.role-actions')!.getBoundingClientRect();
    return Math.abs(title.y + title.height / 2 - actions.y - actions.height / 2);
  }));
  expect(alignment.every((difference) => difference <= 0.5)).toBe(true);
  const columns = await page.locator('.reroll-rule-column').evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width } = node.getBoundingClientRect(); return { x, y, width };
  }));
  expect(columns[0].x).toBeLessThan(columns[1].x);
  expect(columns[0].y).toBe(columns[1].y);
  expect(columns[0].width).toBe(columns[1].width);
  const rowHeights = await cards.locator('.role-row').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(rowHeights).toHaveLength(24);
  expect(new Set(rowHeights).size).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('rules-default.png'), fullPage: true });
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await expect(page.getByText('Add a Re-app rule to start.', { exact: true })).toBeVisible();
  await expect(page.getByText('Add a Refine rule to start.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rules-empty.png'), fullPage: true });
  await page.reload();
  await openTargets(page);
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Re-app rule', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add Re-app rule' });
  await expect(editor.getByRole('group', { name: 'Slots', exact: true }).getByRole('button', { name: '1', exact: true })).toBeFocused();
  await expect(editor.getByRole('textbox')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards.locator('.reapp-name')).toHaveText(['Slots 1, 2, 3, 4, 5, 6']);
  await cards.getByRole('button', { name: 'Edit Slots 1, 2, 3, 4, 5, 6', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Re-app rule' });
  const slots = edit.getByRole('group', { name: 'Slots', exact: true });
  await page.screenshot({ path: testInfo.outputPath('editor-before-choices.png') });
  const initial = await geometry(page);
  const fields = await edit.locator('.reroll-slots-field, .reroll-main-field, .reroll-set-field, .reroll-rarity-field, .reroll-innate-field').evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
  }));
  const [slotField, mainField, setField, rarityField, innateField] = fields;
  const columnGap = mainField.x - slotField.x - slotField.width;
  expect(mainField.y).toBe(slotField.y);
  expect(mainField.width).toBeCloseTo(slotField.width, 1);
  expect(setField.x).toBe(slotField.x);
  expect(setField.width).toBeCloseTo(slotField.width + columnGap + mainField.width, 1);
  expect(setField.y).toBeGreaterThan(mainField.y);
  expect(rarityField.width).toBeCloseTo((setField.width - 2 * columnGap) / 3, 1);
  expect(innateField.width).toBeCloseTo(rarityField.width, 1);
  expect(innateField.y).toBe(rarityField.y);
  await edit.getByRole('button', { name: /^Main stat:/ }).click();
  await page.screenshot({ path: testInfo.outputPath('editor-main-menu.png') });
  expect(await edit.getByRole('menu', { name: 'Main stat', exact: true }).evaluate((node) =>
    node.matches(':popover-open') && node.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  expect(await geometry(page)).toEqual(initial);
  await edit.getByRole('menu', { name: 'Main stat', exact: true }).getByRole('menuitem', { name: 'Accuracy', exact: true }).click();
  expect(await geometry(page)).toEqual(initial);
  await edit.getByRole('button', { name: 'Remove Accuracy from Main stat', exact: true }).click();
  await edit.getByRole('button', { name: /^Main stat:/ }).click();
  await page.keyboard.press('Escape');
  await expect(edit).toBeVisible();
  await expect(edit.getByRole('button', { name: /^Main stat:/ })).toBeFocused();
  await choose(page, 'Main stat', 'ATK %');
  await slots.getByRole('button', { name: '1', exact: true }).click();
  await expect(edit.getByRole('status')).toContainText('cannot carry');
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
  expect(await geometry(page)).toEqual(initial);
  await page.screenshot({ path: testInfo.outputPath('editor-impossible.png') });
  await slots.getByRole('button', { name: '1', exact: true }).click();
  await slots.getByRole('button', { name: '2', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  await choose(page, 'Main stat', 'CRI Dmg');
  await expect(edit.getByRole('status')).toContainText('Some chosen main stats');
  await slots.getByRole('button', { name: '4', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  await expect(edit.getByRole('group', { name: 'Target', exact: true })).toHaveCount(0);
  await edit.getByRole('combobox', { name: 'Min rarity', exact: true }).selectOption('Normal');
  const innate = edit.getByRole('group', { name: 'Innate required', exact: true });
  await expect(innate.getByRole('button')).toHaveText(['Yes', 'Both', 'No']);
  await expect(innate.getByRole('button', { name: 'Both', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const label of ['Yes', 'No', 'Both', 'Both', 'Yes']) {
    await innate.getByRole('button', { name: label, exact: true }).click();
    await expect(innate.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(innate.locator('[aria-pressed="true"]')).toHaveCount(1);
    expect(await geometry(page)).toEqual(initial);
  }
  for (const button of await slots.getByRole('button').all()) if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await chooseRemaining(page, 'Main stat');
  await chooseRemaining(page, 'Rune type');
  // The complete main group, like an empty group, permits any legal main in slot 2.
  for (const slot of [1, 3, 4, 5, 6]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  for (const slot of [1, 3, 4, 5, 6]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  const full = await geometry(page);
  expect(full).toEqual(initial);
  await expect(edit.getByRole('checkbox')).toHaveCount(0);
  await expect(edit.getByRole('status')).toBeEmpty();
  await expect(edit.getByText('Only runes the calculation would sell', { exact: false })).toHaveCount(0);
  await expect(edit.getByText('Every selected slot can carry', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('editor-full.png') });
  await edit.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Re-app', exact: true }).locator('.reapp-card')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Refine', exact: true }).locator('.reapp-card')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rules-full.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await openTargets(page);
  await expect(page.getByRole('region', { name: 'Re-app', exact: true }).locator('.reapp-card')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Refine', exact: true }).locator('.reapp-card')).toHaveCount(0);
  await expect(page.locator('.reroll-rules').getByRole('button', { name: /^Duplicate/ })).toHaveCount(0);
  await expect(cards.getByText('Compatibility', { exact: true })).toHaveCount(0);
  const rows = await cards.locator('.role-row').evaluateAll((nodes) => nodes.map((node) => ({
    height: node.getBoundingClientRect().height, border: getComputedStyle(node).borderTopWidth,
  })));
  expect(new Set(rows.map((row) => row.height)).size).toBe(1);
  expect(rows.every((row) => row.border === '0px')).toBe(true);
  const right = page.getByRole('region', { name: 'Refine', exact: true });
  const rightBefore = await right.evaluate((node) => { const { x, y, width } = node.getBoundingClientRect(); return { x, y, width }; });
  await page.getByRole('button', { name: 'Add Refine rule', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add Refine rule', exact: true })).toBeVisible();
  await fillRefineSubstats(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(right.locator('.reapp-card')).toHaveCount(1);
  expect(await right.evaluate((node) => { const { x, y, width } = node.getBoundingClientRect(); return { x, y, width }; })).toEqual(rightBefore);
  await page.screenshot({ path: testInfo.outputPath('rules-two-columns.png'), fullPage: true });
  await page.reload(); await openTargets(page);
  await expect(right.locator('.reapp-card')).toHaveCount(1);
  await expect(cards).toHaveCount(2);
  await expect(right.locator('.role-row').filter({ hasText: 'Innate required' }).locator('.role-row-value')).toHaveText('Both');
  await expect(page.getByRole('region', { name: 'Re-app', exact: true }).locator('.role-row').filter({ hasText: 'Innate required' }).locator('.role-row-value')).toHaveText('Yes');
  await page.getByRole('button', { name: 'Add Re-app rule', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Re-app rule', exact: true })).toBeFocused();
  await expect(cards).toHaveCount(2);
});

for (const kind of ['Re-app', 'Refine']) {
  test(`${kind} menus use screen space beyond the editor without moving its controls`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await openTargets(page);
    await page.getByRole('button', { name: `Add ${kind} rule`, exact: true }).click();
    const editor = page.getByRole('dialog', { name: `Add ${kind} rule` });
    const trigger = editor.getByRole('button', { name: /^Rune type:/ });
    const initial = await geometry(page);
    await page.screenshot({ path: testInfo.outputPath('menu-closed.png') });
    await trigger.click();
    const menu = editor.getByRole('menu', { name: 'Rune type', exact: true });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const body = node.closest('.editor-body')!.getBoundingClientRect();
      return node.matches(':popover-open') && box.bottom > body.bottom && box.height >= 250
        && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    })).toBe(true);
    expect(await geometry(page)).toEqual(initial);
    await page.screenshot({ path: testInfo.outputPath('menu-open.png') });
    await menu.getByRole('menuitem', { name: 'Will', exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await geometry(page)).toEqual(initial);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await editor.getByRole('heading').click();
    await expect(menu).toHaveCount(0);
    // A shorter, zoomed canvas must use the room above and keep every option reachable.
    await page.setViewportSize({ width: 1200, height: 600 });
    await trigger.click();
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth;
    })).toBe(true);
    await menu.getByRole('menuitem', { name: 'Fight', exact: true }).click();
    await trigger.click();
    await page.setViewportSize({ width: 3440, height: 1392 });
    await expect.poll(() => menu.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const line = node.closest('.token-choice')!.querySelector('.token-choice-line')!.getBoundingClientRect();
      return Math.abs(box.top - line.bottom - 4) < 1 && box.bottom <= innerHeight;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('menu-wide-screen.png') });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.token-choice-panel')).toHaveCount(0);
  });
}

test('a rule changes real clean-up advice and can be removed without recalculating', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  const cards = await openTargets(page);
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('button', { name: 'Add Re-app rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('group', { name: 'Slots', exact: true }).getByRole('button', { name: '4', exact: true }).click();
  await choose(page, 'Rune type', 'Fatal');
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  const fatal = table.locator('tbody tr').filter({ hasText: 'Fatal' }).locator('.rune-verdict');
  await expect(fatal).toHaveText('Re-app');
  await page.screenshot({ path: testInfo.outputPath('rules-cleanup.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Re-app/refine target', exact: true }).uncheck();
  await expect(fatal).not.toHaveText('Re-app');
  await page.getByRole('checkbox', { name: 'Re-app/refine target', exact: true }).check();
  await expect(fatal).toHaveText('Re-app');
  await openTargets(page);
  await cards.first().getByRole('button', { name: /^Edit/ }).click();
  await page.getByRole('dialog').getByRole('group', { name: 'Innate required', exact: true }).getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(fatal).not.toHaveText('Re-app');
  await openTargets(page);
  await cards.first().getByRole('button', { name: /^Edit/ }).click();
  await page.getByRole('dialog').getByRole('group', { name: 'Innate required', exact: true }).getByRole('button', { name: 'No', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(fatal).toHaveText('Re-app');
  await openTargets(page);
  await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(fatal).not.toHaveText('Re-app');
});


test('rule headings show sorted slots and chosen mains and survive reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await openTargets(page);
  await page.getByRole('button', { name: 'Add Re-app rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  const slots = editor.getByRole('group', { name: 'Slots', exact: true });
  for (const slot of [6, 2, 4]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  await choose(page, 'Main stat', 'HP %');
  for (const name of ['Will', 'Blade', 'Violent']) await choose(page, 'Rune type', name);
  await page.screenshot({ path: testInfo.outputPath('slots-selected.png') });
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  const card = page.getByRole('region', { name: 'Re-app', exact: true }).locator('.reapp-card')
    .filter({ has: page.getByRole('heading', { name: 'Slots 2, 4, 6 — HP %', exact: true }) });
  await expect(card.locator('.reapp-name')).toHaveText('Slots 2, 4, 6 — HP %');
  await expect(card.locator('.role-row-label')).toHaveText(['Rune type', 'Min rarity', 'Innate required']);
  await expect(card.locator('.role-row').filter({ hasText: /^Rune type/ }).locator('.role-row-value')).toHaveText('Blade, Violent, Will');
  await page.screenshot({ path: testInfo.outputPath('slot-heading.png'), fullPage: true });
  await page.reload(); await openTargets(page);
  await expect(card.locator('.reapp-name')).toHaveText('Slots 2, 4, 6 — HP %');
  await expect(card.locator('.role-row').filter({ hasText: /^Rune type/ }).locator('.role-row-value')).toHaveText('Blade, Violent, Will');
  await card.getByRole('button', { name: 'Edit Slots 2, 4, 6 — HP %', exact: true }).click();
  await editor.getByRole('button', { name: 'Remove HP % from Main stat', exact: true }).click();
  for (const slot of [6, 2, 4]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Re-app', exact: true }).locator('.reapp-name').first()).toHaveText('Slots 1, 2, 3, 4, 5, 6');
});

test('both rule columns sort by successive slots, with shorter equal prefixes first', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const cards = await openTargets(page);
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  const input = [[6], [4, 2, 6], [4, 2], [2], [6, 1], [], [1], [3, 2]];
  const expected = ['Slot 1', 'Slots 1, 2, 3, 4, 5, 6', 'Slots 1, 6', 'Slot 2', 'Slots 2, 3', 'Slots 2, 4', 'Slots 2, 4, 6', 'Slot 6'];
  for (const kind of ['Re-app', 'Refine']) {
    for (const selected of input) {
      await page.getByRole('button', { name: `Add ${kind} rule`, exact: true }).click();
      const editor = page.getByRole('dialog');
      const slots = editor.getByRole('group', { name: 'Slots', exact: true });
      for (const slot of selected) await slots.getByRole('button', { name: String(slot), exact: true }).click();
      if (kind === 'Refine') await fillRefineSubstats(page);
      await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
    }
    const column = page.getByRole('region', { name: kind, exact: true });
    await expect(column.locator('.reapp-name')).toHaveText(expected);
    // Editing a slot changes its position as well as its title.
    await column.getByRole('button', { name: 'Edit Slot 6', exact: true }).click();
    const editor = page.getByRole('dialog');
    const slots = editor.getByRole('group', { name: 'Slots', exact: true });
    await slots.getByRole('button', { name: '6', exact: true }).click();
    await slots.getByRole('button', { name: '3', exact: true }).click();
    await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
    await expect(column.locator('.reapp-name')).toHaveText([...expected.slice(0, -1), 'Slot 3']);
  }
  await page.screenshot({ path: testInfo.outputPath('sorted-rules.png'), fullPage: true });
  await page.reload(); await openTargets(page);
  for (const kind of ['Re-app', 'Refine']) {
    await expect(page.getByRole('region', { name: kind, exact: true }).locator('.reapp-name'))
      .toHaveText([...expected.slice(0, -1), 'Slot 3']);
  }
});

test('Refine requires explicit substats, validates every main and keeps six choices on one line', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await openTargets(page);
  await page.getByRole('button', { name: 'Add Refine rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  const save = editor.getByRole('button', { name: 'Save rule', exact: true });
  const minimum = editor.getByRole('combobox', { name: 'Of these rune must have at least', exact: true });
  const status = editor.getByRole('status');
  const substats = editor.getByRole('group', { name: 'Substats', exact: true });
  const initial = await geometry(page);
  await expect(minimum).toHaveValue('all');
  await expect(minimum.locator('option')).toHaveText(['All']);
  await expect(save).toBeDisabled();
  await expect(status).toContainText('Choose at least one substat');
  await page.screenshot({ path: testInfo.outputPath('refine-empty.png') });
  await editor.getByRole('group', { name: 'Slots', exact: true }).getByRole('button', { name: '2', exact: true }).click();
  await choose(page, 'Main stat', 'ATK %');
  await choose(page, 'Main stat', 'SPD');
  await choose(page, 'Substats', 'ATK %');
  await expect(save).toBeDisabled();
  await expect(status).toContainText('slot 2 / ATK %');
  await choose(page, 'Substats', 'SPD');
  await expect(save).toBeDisabled();
  await minimum.selectOption('1');
  await expect(save).toBeEnabled();
  for (const name of ['HP %', 'DEF %', 'CRI Rate', 'CRI Dmg']) await choose(page, 'Substats', name);
  await expect(minimum.locator('option')).toHaveText(['All', '5', '4', '3', '2', '1']);
  await expect(substats.locator('.token-choice-line .token-choice-pill')).toHaveCount(6);
  await expect(substats.locator('.token-choice-line .token-choice-pill-label')).toHaveText(['HP %', 'ATK %', 'DEF %', 'SPD', 'CRI Rate', 'CRI Dmg']);
  await expect(substats.locator('.token-choice-more')).toHaveCount(0);
  await minimum.selectOption('all');
  await expect(save).toBeDisabled();
  await expect(status).toContainText('only four substats');
  await minimum.selectOption('5');
  await expect(save).toBeDisabled();
  await minimum.selectOption('4');
  await expect(save).toBeEnabled();
  for (const name of ['Will', 'Blade', 'Violent']) await choose(page, 'Rune type', name);
  await expect(editor.getByRole('group', { name: 'Rune type', exact: true }).locator('.token-choice-line .token-choice-pill-label')).toHaveText(['Blade', 'Violent', 'Will']);
  expect(await geometry(page)).toEqual(initial);
  await page.screenshot({ path: testInfo.outputPath('refine-six-substats.png') });
  for (const name of ['HP %', 'DEF %', 'CRI Rate']) await editor.getByRole('button', { name: `Remove ${name} from Substats`, exact: true }).click();
  await expect(minimum).toHaveValue('4');
  await expect(save).toBeDisabled();
  await expect(status).toContainText('minimum below the number');
  expect(await geometry(page)).toEqual(initial);
  await minimum.selectOption('1');
  await expect(save).toBeEnabled();
  // Every vocabulary filled still fits; a numerical minimum makes the pool achievable.
  await chooseRemaining(page, 'Substats');
  await chooseRemaining(page, 'Main stat');
  const slots = editor.getByRole('group', { name: 'Slots', exact: true });
  for (const slot of [1, 3, 4, 5, 6]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  await chooseRemaining(page, 'Rune type');
  await minimum.selectOption('4');
  await editor.getByRole('group', { name: 'Innate required', exact: true }).getByRole('button', { name: 'Yes', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Min rarity', exact: true }).selectOption('Normal');
  await expect(save).toBeEnabled();
  await expect(status).toBeEmpty();
  expect(await geometry(page)).toEqual(initial);
  await page.screenshot({ path: testInfo.outputPath('refine-full.png') });
  await save.click();
  await page.reload(); await openTargets(page);
  const card = page.getByRole('region', { name: 'Refine', exact: true }).locator('.reapp-card').first();
  await expect(card.locator('.role-row-label')).toHaveText(['Rune type', 'Min rarity', 'Innate required', 'Substats', 'At least']);
  await expect(card.locator('.role-row').filter({ hasText: /^At least/ }).locator('.role-row-value')).toHaveText('4');
  await expect(card.locator('.role-row').filter({ hasText: /^Substats/ }).locator('.role-row-value'))
    .toHaveText('HP +, HP %, ATK +, ATK %, DEF +, DEF %, SPD, CRI Rate, CRI Dmg, Resistance, Accuracy');
  await card.getByRole('button', { name: /^Edit/ }).click();
  await expect(minimum).toHaveValue('4');
  await expect(substats.locator('.token-choice-add')).toHaveAttribute('aria-label', /HP \+, HP %, ATK \+, ATK %, DEF \+, DEF %, SPD, CRI Rate, CRI Dmg, Resistance, Accuracy/);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add Re-app rule', exact: true }).click();
  await expect(editor.getByRole('group', { name: 'Substats', exact: true })).toHaveCount(0);
  await expect(editor.getByRole('combobox', { name: 'Of these rune must have at least', exact: true })).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test('manual Refine substats change the real verdict without recalculating', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  const cards = await openTargets(page);
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('button', { name: 'Add Refine rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('group', { name: 'Slots', exact: true }).getByRole('button', { name: '4', exact: true }).click();
  await choose(page, 'Main stat', 'CRI Dmg');
  await choose(page, 'Substats', 'SPD');
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const fatal = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr').filter({ hasText: 'Fatal' }).locator('.rune-verdict');
  await expect(fatal).toHaveText('Refine');
  await openTargets(page);
  await cards.getByRole('button', { name: /^Edit/ }).click();
  await editor.getByRole('button', { name: 'Remove SPD from Substats', exact: true }).click();
  await choose(page, 'Substats', 'CRI Rate');
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(fatal).not.toHaveText('Refine');
});
