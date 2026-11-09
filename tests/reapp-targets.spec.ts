import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
    const items = menu.getByRole('menuitem');
    if (await items.count() === 0) { await page.keyboard.press('Escape'); return; }
    await items.first().click();
  }
}

test('rules handle empty and full input, incompatible mains, stable choices and persistence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const cards = await openTargets(page);
  await expect(cards).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('rules-default.png'), fullPage: true });
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await expect(page.getByText('No reroll rules.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rules-empty.png'), fullPage: true });
  await page.reload();
  await openTargets(page);
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add rule' });
  await expect(editor.getByRole('textbox', { name: 'Rule name' })).toBeFocused();
  await editor.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards.locator('.reapp-name')).toHaveText(['Untitled rule']);
  await cards.getByRole('button', { name: 'Edit Untitled rule', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit rule' });
  const slots = edit.getByRole('group', { name: 'Slots', exact: true });
  await page.screenshot({ path: testInfo.outputPath('editor-before-choices.png') });
  const initial = await geometry(page);
  await edit.getByRole('button', { name: /^Main stat:/ }).click();
  await page.screenshot({ path: testInfo.outputPath('editor-main-menu.png') });
  expect(await geometry(page)).toEqual(initial);
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
  await edit.getByRole('textbox', { name: 'Rule name' }).fill('A very long rule name with room for every rune '.repeat(10));
  const target = edit.getByRole('group', { name: 'Target', exact: true });
  const reapp = target.getByRole('button', { name: 'Re-app', exact: true });
  const refine = target.getByRole('button', { name: 'Refine', exact: true });
  await expect(reapp).toHaveAttribute('aria-pressed', 'true');
  await expect(refine).toHaveAttribute('aria-pressed', 'false');
  await reapp.click();
  await expect(reapp).toHaveAttribute('aria-pressed', 'true');
  await refine.click();
  await reapp.click();
  await expect(refine).toHaveAttribute('aria-pressed', 'true');
  await expect(reapp).toHaveAttribute('aria-pressed', 'false');
  await refine.click();
  await expect(refine).toHaveAttribute('aria-pressed', 'true');
  await reapp.click();
  await edit.getByRole('combobox', { name: 'Min rarity', exact: true }).selectOption('Normal');
  await edit.getByRole('combobox', { name: 'Innate', exact: true }).selectOption('yes');
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
  await expect(cards.locator('.role-type')).toHaveText('Re-app + Refine');
  await page.screenshot({ path: testInfo.outputPath('rules-full.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await openTargets(page);
  await expect(cards.locator('.role-type')).toHaveText('Re-app + Refine');
  await cards.getByRole('button', { name: /^Duplicate/ }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Rule name' }).fill('Second rule');
  await page.getByRole('dialog').getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add rule', exact: true })).toBeFocused();
  await expect(cards).toHaveCount(2);
});

test('a rule changes real clean-up advice and can be removed without recalculating', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  const cards = await openTargets(page);
  while (await cards.count()) await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: 'Rule name' }).fill('Fatal slot 4');
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
  await cards.first().getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(fatal).not.toHaveText('Re-app');
});
