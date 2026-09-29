import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Two defects the preset editor carried, held apart because they fail
 * differently.
 *
 * The focus one is a timing bug: the page re-renders every two seconds while it
 * polls the helper, and the editor used to re-focus its name field on every one
 * of those renders. Nothing about the markup shows it — only waiting does — so
 * the test waits past two poll ticks with the caret somewhere else.
 *
 * The slot one is a vocabulary bug: every slot offered all eight main stats,
 * including mains that slot can never roll. A preset naming one matched no rune
 * at all and said nothing about it.
 */

const slotOptions = {
  'Slot 2': { offered: ['HP%', 'Atk%', 'Def%', 'Spd'], impossible: ['CtR%', 'CtD%', 'Res%', 'Acc%'] },
  'Slot 4': { offered: ['HP%', 'Atk%', 'Def%', 'CtR%', 'CtD%'], impossible: ['Spd', 'Res%', 'Acc%'] },
  'Slot 6': { offered: ['HP%', 'Atk%', 'Def%', 'Res%', 'Acc%'], impossible: ['Spd', 'CtR%', 'CtD%'] },
} as const;

async function openPresetEditor(page: Page, { pollForHelper = false } = {}) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  /* The helper poll is what re-renders the page under an open editor, and it
     only runs on the direct route. Choosing it is therefore part of
     reproducing the focus bug, not incidental setup — no helper need answer. */
  if (pollForHelper) await page.getByRole('radio', { name: 'Direct import' }).check();
  await page.getByRole('button', { name: 'Rune Set-up' }).click();
  await page.locator('summary').filter({ hasText: 'Presets' }).click();
  await page.getByRole('button', { name: 'Edit Slow DD' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('each rune slot offers only the main stats it can roll', async ({ page }) => {
  await openPresetEditor(page);

  for (const [slot, { offered, impossible }] of Object.entries(slotOptions)) {
    const chips = page.locator('.editor-slot').filter({ hasText: slot }).locator('.choice-chip');
    await expect(chips).toHaveText(offered);
    for (const stat of impossible) {
      await expect(chips.filter({ hasText: stat })).toHaveCount(0);
    }
  }
});

test('the caret stays where the user put it while the editor is open', async ({ page }) => {
  await openPresetEditor(page, { pollForHelper: true });

  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toBeFocused();

  /* Any field but the name. Two and a half poll ticks is long enough that a
     re-focus on re-render cannot hide inside the wait. */
  const spd = page.getByRole('spinbutton', { name: 'Spd', exact: true });
  await spd.click();
  await spd.fill('215');
  await page.waitForTimeout(5000);

  await expect(spd).toBeFocused();
  await expect(spd).toHaveValue('215');
});

test('a zero desired stat is saved as unstated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Rune Set-up' }).click();
  await page.locator('summary').filter({ hasText: 'Presets' }).click();
  await page.getByRole('button', { name: 'Add preset' }).click();

  const hp = page.getByRole('spinbutton', { name: 'HP', exact: true });
  await expect(hp).toHaveValue('');
  await hp.fill('0');
  await page.getByRole('button', { name: 'Add preset' }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const saved = page.locator('.preset-card').filter({ hasText: 'New preset' });
  await expect(saved.locator('.target.empty')).toHaveCount(11);

  await page.getByRole('button', { name: 'Edit New preset' }).click();
  await expect(page.getByRole('spinbutton', { name: 'HP', exact: true })).toHaveValue('');
});
