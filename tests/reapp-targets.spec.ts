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
const geometry = (page: Page) => page.getByRole('dialog').locator('input, .reroll-choices, .reapp-editor-pair, .dialog-actions').evaluateAll((nodes) => nodes.map((node) => {
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}));

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
  const mains = edit.getByRole('group', { name: 'Main stat', exact: true });
  await page.screenshot({ path: testInfo.outputPath('editor-before-choices.png') });
  const initial = await geometry(page);
  await mains.getByRole('button', { name: 'ATK %', exact: true }).click();
  await slots.getByRole('button', { name: '1', exact: true }).click();
  await expect(edit.getByRole('status')).toContainText('cannot carry');
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();
  expect(await geometry(page)).toEqual(initial);
  await page.screenshot({ path: testInfo.outputPath('editor-impossible.png') });
  await slots.getByRole('button', { name: '1', exact: true }).click();
  await slots.getByRole('button', { name: '2', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  await mains.getByRole('button', { name: 'CRI Dmg', exact: true }).click();
  await expect(edit.getByRole('status')).toContainText('Some chosen main stats');
  await slots.getByRole('button', { name: '4', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  await edit.getByRole('textbox', { name: 'Rule name' }).fill('A very long rule name with room for every rune '.repeat(10));
  await edit.getByRole('combobox', { name: 'Target', exact: true }).selectOption('both');
  await edit.getByRole('combobox', { name: 'Min rarity', exact: true }).selectOption('Normal');
  await edit.getByRole('combobox', { name: 'Innate', exact: true }).selectOption('yes');
  for (const group of [slots, mains, edit.getByRole('group', { name: 'Rune type', exact: true })]) {
    for (const button of await group.getByRole('button').all()) if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  }
  // The complete main group, like an empty group, permits any legal main in slot 2.
  for (const slot of [1, 3, 4, 5, 6]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
  for (const slot of [1, 3, 4, 5, 6]) await slots.getByRole('button', { name: String(slot), exact: true }).click();
  const full = await geometry(page);
  expect(full).toEqual(initial);
  await edit.getByRole('checkbox', { name: 'Enabled', exact: true }).uncheck();
  expect(await geometry(page)).toEqual(full);
  await page.screenshot({ path: testInfo.outputPath('editor-full-disabled.png') });
  await edit.getByRole('checkbox', { name: 'Enabled', exact: true }).check();
  await edit.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('.role-type')).toHaveText('Re-app + Refine · Enabled');
  await page.screenshot({ path: testInfo.outputPath('rules-full.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await openTargets(page);
  await expect(cards.locator('.role-type')).toHaveText('Re-app + Refine · Enabled');
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
  await editor.getByRole('group', { name: 'Rune type', exact: true }).getByRole('button', { name: 'Fatal', exact: true }).click();
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
