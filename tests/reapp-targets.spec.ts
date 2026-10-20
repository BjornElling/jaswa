import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

async function openTargets(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  /* The disclosure remembers being open for the session, so it is opened only when shut. */
  const disclosure = page.locator('details.bar').filter({ has: page.locator('summary', { hasText: /^›?Re-app\/refine target$/ }) });
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click();
  return page.locator('.reapp-card');
}

const box = (locator: ReturnType<Page['locator']>) => locator.evaluate((node) => {
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
});

/**
 * Six fixed slots, each with a re-app target on the left and a refine target on
 * the right, edited together, and the advice they put on a rune.
 *
 * The fixture's slot-2 runes 101 (+12) and 102 (+9) are Violent Legends with an
 * ATK % main and no innate, and show only three and two lines: answering No to the
 * innate leaves them out still, because a target needs all four lines shown. Its
 * slot-4 rune 103 is a Fatal Legend with four lines, which slot 4's target takes
 * once Fatal is added and the innate answered No. Refinement starts on in slots
 * 2, 4 and 6, without Fatal, so it takes none of them.
 */
test('re-app/refine targets are six fixed cards that put Re-app on the runes they describe', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  const cards = await openTargets(page);
  await expect(cards).toHaveCount(6);
  await expect(cards.locator('.reapp-name')).toHaveText(['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5', 'Slot 6']);
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Add/ })).toHaveCount(0);
  const slot2 = cards.nth(1);
  const reapp2 = slot2.getByRole('region', { name: 'Slot 2 Re-app target' });
  const refine2 = slot2.getByRole('region', { name: 'Slot 2 Refine target' });
  await expect(slot2.locator('.reapp-column-title')).toHaveText(['Re-app', 'Refine']);
  /* Re-app on the left, Refine on the right, on one line. */
  const [left, right] = await Promise.all([box(reapp2), box(refine2)]);
  expect(left.x).toBeLessThan(right.x);
  expect(left.y).toBeCloseTo(right.y, 0);
  await expect(reapp2.locator('.role-type')).toHaveText('Enabled');
  await expect(refine2.locator('.role-type')).toHaveText('Enabled');
  await expect(reapp2.locator('.role-row-label')).toHaveText(['Rune type', 'Min rarity', 'Must have innate', 'Must have main stat']);
  await expect(reapp2.locator('.role-row-value')).toHaveText(['Violent', 'Legend', 'Yes', 'ATK %SPD']);
  await expect(refine2.locator('.role-row-value'))
    .toHaveText(['DespairFightRageSwiftVampireViolentWill', 'Legend', 'No', 'ATK %SPD']);
  await expect(cards.nth(2).getByRole('region', { name: 'Slot 3 Refine target' }).locator('.role-type')).toHaveText('Disabled');
  await expect(cards.nth(2).getByRole('region', { name: 'Slot 3 Re-app target' }).locator('.role-type')).toHaveText('Disabled');
  /* The card itself has no switch: switching is the editor's. */
  await expect(slot2.getByRole('checkbox')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('reapp-shipped.png'), fullPage: true });

  /* The shipped targets leave runes 101 and 102 alone. */
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.locator('.workspace-page-content').getByRole('button', { name: 'Calculate', exact: true }).click();
  const advice = page.getByRole('table', { name: 'Rune verdicts' }).locator('.rune-verdict');
  await expect(advice).toHaveCount(4);
  await expect(page.getByRole('checkbox', { name: 'Re-app/refine target' })).toBeChecked();
  await expect(advice.filter({ hasText: /Re-app|Refine/ })).toHaveCount(0);

  /* The editor holds both, re-app on the left and refine on the right. */
  await openTargets(page);
  await page.getByRole('button', { name: 'Edit the Slot 2 targets' }).click();
  const editor = page.getByRole('dialog', { name: 'Slot 2' });
  await expect(editor).toBeVisible();
  const reappSide = editor.getByRole('region', { name: 'Re-app target' });
  const refineSide = editor.getByRole('region', { name: 'Refine target' });
  const [editorLeft, editorRight] = await Promise.all([box(reappSide), box(refineSide)]);
  expect(editorLeft.x).toBeLessThan(editorRight.x);
  expect(editorLeft.y).toBeCloseTo(editorRight.y, 0);
  await expect(refineSide.getByRole('combobox')).toHaveCount(2);
  await expect(editor.getByText('Min lvl')).toHaveCount(0);
  /* Refine's shipped seven sets stay inside its half, its switch inside the dialog. */
  const dialogBox = await box(editor);
  const refineSwitch = await box(refineSide.getByRole('checkbox', { name: 'Disable refine' }));
  expect(refineSwitch.x + refineSwitch.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
  await expect(refineSide.getByRole('checkbox', { name: 'Disable refine' })).not.toBeChecked();
  await expect(refineSide.getByRole('button', { name: /^Refine rune type:/ }))
    .toHaveAccessibleName('Refine rune type: Despair, Fight, Rage, Swift, Vampire, Violent, Will');
  await page.screenshot({ path: testInfo.outputPath('reapp-editor-both.png') });

  /* Disabling refine folds its questions without moving the re-app side. */
  const reappBefore = await box(reappSide);
  await refineSide.getByRole('checkbox', { name: 'Disable refine' }).check();
  await expect(refineSide.getByRole('combobox')).toHaveCount(0);
  expect(await box(reappSide)).toEqual(reappBefore);

  /* Everything filled in on the re-app side. */
  for (const set of ['Will', 'Swift', 'Despair', 'Fatal', 'Rage']) {
    await reappSide.getByRole('button', { name: /^Re-app rune type:/ }).click();
    await page.getByRole('menuitem', { name: set, exact: true }).click();
  }
  await expect(page.getByRole('menu')).toHaveCount(0);
  await reappSide.getByRole('button', { name: /^Re-app rune type:/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Intangible', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await reappSide.getByRole('button', { name: /^Re-app must have main stat:/ }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['HP +', 'HP %', 'ATK +', 'DEF +', 'DEF %']);
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();

  const grade = reappSide.getByRole('combobox', { name: 'Re-app min rarity' });
  const innate = reappSide.getByRole('combobox', { name: 'Re-app must have innate' });
  await expect(innate.locator('option')).toHaveText(['Yes', 'No']);
  await expect(innate).toHaveValue('yes');
  /* Two short dropdowns on one line inside the column, Must have innate to the right. */
  const [gradeBox, innateBox] = await Promise.all([grade, innate].map(box));
  expect(innateBox.y).toBeCloseTo(gradeBox.y, 0);
  expect(innateBox.x).toBeGreaterThan(gradeBox.x + gradeBox.width);
  expect(innateBox.x + innateBox.width).toBeLessThanOrEqual(editorLeft.x + editorLeft.width + 1);
  await innate.selectOption('no');
  await page.screenshot({ path: testInfo.outputPath('reapp-editor.png') });
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit the Slot 2 targets' })).toBeFocused();
  await expect(reapp2.locator('.role-row-value').nth(2)).toHaveText('No');
  await expect(refine2.locator('.role-type')).toHaveText('Disabled');

  /* Slot 4's re-app target opened to the fixture's Fatal rune 103, a Legend with
     four lines, a CRI Dmg main and no innate. */
  await page.getByRole('button', { name: 'Edit the Slot 4 targets' }).click();
  const editor4 = page.getByRole('dialog', { name: 'Slot 4' });
  await editor4.getByRole('button', { name: /^Re-app rune type:/ }).click();
  await page.getByRole('menuitem', { name: 'Fatal', exact: true }).click();
  await editor4.getByRole('combobox', { name: 'Re-app must have innate' }).selectOption('no');
  await editor4.getByRole('button', { name: 'Save changes' }).click();

  /* Re-app switched off in the editor folds only its own half. */
  await page.getByRole('button', { name: 'Edit the Slot 6 targets' }).click();
  await page.getByRole('dialog', { name: 'Slot 6' }).getByRole('checkbox', { name: 'Disable re-app' }).check();
  await page.getByRole('dialog', { name: 'Slot 6' }).getByRole('button', { name: 'Save changes' }).click();
  const slot6 = cards.nth(5);
  await expect(slot6.getByRole('region', { name: 'Slot 6 Re-app target' }).locator('.role-row')).toHaveCount(0);
  await expect(slot6.getByRole('region', { name: 'Slot 6 Re-app target' }).locator('.role-type')).toHaveText('Disabled');
  await page.screenshot({ path: testInfo.outputPath('reapp-edited.png'), fullPage: true });

  /* Rune 103 is a target; 101 (+12) and 102 (+9) still show fewer than four lines and are not. */
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  await expect(advice.filter({ hasText: 'Re-app' })).toHaveCount(1);
  await expect(table.locator('tbody tr').filter({ hasText: 'Fatal' }).locator('.rune-verdict')).toHaveText('Re-app');
  await page.screenshot({ path: testInfo.outputPath('reapp-cleanup.png') });

  /* The Advice filter asks one question of both rerolls, and the safeguard switches them off. */
  const adviceFilter = page.getByRole('group', { name: 'Filter by advice' });
  await expect(adviceFilter.getByRole('button')).toHaveText(['Power up', 'Keep', 'Re-app/refine', 'Sell']);
  /* All four inside their own column of the strip. */
  const column = await box(page.locator('.rune-filter-column').nth(2));
  for (const chip of await adviceFilter.getByRole('button').all()) {
    const chipBox = await box(chip);
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
  }
  await adviceFilter.getByRole('button', { name: 'Re-app/refine' }).click();
  await expect(advice).toHaveCount(1);
  await adviceFilter.getByRole('button', { name: 'Re-app/refine' }).click();
  await page.getByRole('checkbox', { name: 'Re-app/refine target' }).uncheck();
  await expect(advice).toHaveCount(4);
  await expect(advice.filter({ hasText: /Re-app|Refine/ })).toHaveCount(0);

  /* The choices survive a reload. */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const reloaded = await openTargets(page);
  await expect(reloaded.nth(1).getByRole('region', { name: 'Slot 2 Re-app target' }).locator('.role-row-value').nth(2)).toHaveText('No');
  await expect(reloaded.nth(5).getByRole('region', { name: 'Slot 6 Re-app target' }).locator('.role-type')).toHaveText('Disabled');
  await expect(reloaded.nth(3).getByRole('region', { name: 'Slot 4 Re-app target' }).locator('.role-row-value').first()).toHaveText('FatalViolent');
});

/** The last field of a column has no room below it, so its menu opens upwards inside the dialog. */
test('a menu at the foot of the re-app/refine editor opens upwards', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await openTargets(page);
  await page.getByRole('button', { name: 'Edit the Slot 2 targets' }).click();
  const editor = page.getByRole('dialog', { name: 'Slot 2' });
  const body = editor.locator('.editor-body');
  const bodyBox = await box(body);
  await editor.getByRole('button', { name: /^Re-app must have main stat:/ }).click();
  const menu = page.getByRole('menu', { name: 'Re-app must have main stat' });
  await expect(menu).toHaveAttribute('data-above', '');
  const menuBox = await box(menu);
  expect(menuBox.y).toBeGreaterThanOrEqual(bodyBox.y);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height);
  expect(await body.evaluate((node) => node.scrollHeight - node.clientHeight)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reapp-main-menu.png') });
});
