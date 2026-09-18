import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/**
 * "Runes to include" states the scope of the calculation.
 *
 * This is the check the settings did not have while nothing read them: both boxes
 * were rendered, stored and validated, and a user who unticked one was told
 * something would happen and nothing did. The fixture account is built for it —
 * three runes in the inventory, two of them at +12, and one +15 rune equipped on a
 * monster — so each box removes a different, identifiable slice.
 */
test('the include settings decide which runes are judged', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const recommendations = page.locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Recommendations' }) });
  const calculate = recommendations.getByRole('button', { name: /^(Calculate|Recalculate)$/ });
  const status = page.locator('.calculation-status');

  await expect(recommendations.getByText('4 runes ready to judge')).toBeVisible();
  await calculate.click();
  await expect(status).toContainText('4 runes judged against');
  await expect(status).not.toContainText('not included');

  const settings = page.locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Settings' }) });
  await settings.locator('summary').click();

  /* The only equipped rune is the +15 on a monster, so this takes exactly one. */
  const equipped = settings.getByRole('checkbox', { name: 'Include runes equipped on monsters' });
  const maxed = settings.getByRole('checkbox', { name: 'Include runes at Lv. 12 and above' });
  await equipped.uncheck();
  await calculate.click();
  await expect(status).toContainText('3 runes judged against');
  await expect(status).toContainText('1 not included by your settings');
  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(3);

  /* And +12 and above takes the two maxed inventory runes with it, leaving the
     one rune at +9 — the equipped +15 is already gone. */
  await maxed.uncheck();
  await calculate.click();
  await expect(status).toContainText('1 runes judged against');
  await expect(status).toContainText('3 not included by your settings');
  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(1);

  /* Putting one back puts its runes back, which is the half that would still be
     broken if the boxes only ever narrowed a saved population. */
  await maxed.check();
  await calculate.click();
  await expect(status).toContainText('3 runes judged against');
  await expect(status).toContainText('1 not included by your settings');
  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(3);
});
