import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('keeps the calculated list and its arrangement across navigation', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const navigation = page.getByRole('navigation');
  const visit = async (name: string) => navigation.getByRole('button', { name, exact: true }).click();
  await visit('Rune Clean-up');
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('empty-before-navigation.png') });
  await visit('Home');
  await visit('Rune Clean-up');
  await expect(page.getByText('Nothing to judge until account data is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-after-navigation.png') });
  await visit('Home');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await visit('Rune Clean-up');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await page.getByRole('columnheader', { name: 'Lv.' }).getByRole('button').click();
  const before = await rows.allTextContents();
  const status = await page.locator('.calculation-status').textContent();
  const boxes = () => page.locator('.rune-filter-strip').evaluate((strip) =>
    [...strip.querySelectorAll('.filter-group, .rune-filter-actions > .button')].map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }));
  const beforeBoxes = await boxes();
  await page.screenshot({ path: testInfo.outputPath('calculated-before-navigation.png') });
  // Both clicks share a tick, so even a warm worker cannot finish before leaving.
  const home = await navigation.getByRole('button', { name: 'Home', exact: true }).elementHandle();
  await page.getByRole('button', { name: 'Calculate', exact: true }).evaluate((button, homeButton) => {
    (button as HTMLButtonElement).click();
    (homeButton as HTMLButtonElement | null)?.click();
  }, home);
  for (const name of ['Home', 'Rune Settings', 'Monster Overview', 'Rune Optimization']) await visit(name);
  await visit('Rune Clean-up');
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeVisible();
  await expect(rows).toHaveCount(4);
  expect(await rows.allTextContents()).toEqual(before);
  await expect(page.locator('.calculation-status')).toHaveText(status ?? '');
  await expect(page.getByRole('columnheader', { name: 'Lv.' })).toHaveAttribute('aria-sort', 'ascending');
  expect(await boxes()).toEqual(beforeBoxes);
  await page.screenshot({ path: testInfo.outputPath('calculated-after-navigation.png') });

  const warning = page.getByText('The runes or their standards changed since the last calculation.');
  await expect(warning).toBeHidden();
  await page.getByRole('checkbox', { name: 'Pre-grind SPD ≥' }).uncheck();
  await expect(warning).toBeHidden();
  expect(await boxes()).toEqual(beforeBoxes);
  await visit('Rune Settings');
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();
  const quality = await page.locator('#rune-quality').inputValue();
  await page.locator('#rune-quality').fill(quality === '1' ? '2' : '1');
  await visit('Rune Clean-up');
  /* Only Calculate calculates: a changed standard empties the table. */
  await expect(warning).toBeVisible();
  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('.rune-link')).toHaveCount(0);
  expect(await boxes()).toEqual(beforeBoxes);
  await page.screenshot({ path: testInfo.outputPath('changed-standards.png') });
  await visit('Rune Settings');
  await page.locator('#rune-quality').fill(quality);
  await visit('Rune Clean-up');
  await expect(warning).toBeHidden();
  await expect(rows).toHaveCount(4);
  const restoredStatus = await page.locator('.calculation-status').textContent();

  // A repeated export is compared by its meaningful content, not its identity.
  const fileInput = page.locator('input[type="file"][accept="application/json,.json"]');
  await visit('Home');
  await fileInput.setInputFiles(account);
  await page.getByRole('button', { name: 'Replace data' }).click();
  await visit('Rune Clean-up');
  await expect(warning).toBeHidden();
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.calculation-status')).toHaveText(restoredStatus ?? '');

  // The reference averages, not the number of monsters alone, shape the answers.
  const raw = JSON.parse(readFileSync(account, 'utf8'));
  raw.unit_list[0].atk = (raw.unit_list[0].atk ?? 0) + 100;
  await visit('Home');
  await fileInput.setInputFiles({ name: 'changed-reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await page.getByRole('button', { name: 'Replace data' }).click();
  await visit('Rune Clean-up');
  await expect(warning).toBeVisible();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(rows).toHaveCount(4);

  raw.wizard_id = 987654;
  for (const unit of raw.unit_list) unit.wizard_id = raw.wizard_id;
  await visit('Home');
  await fileInput.setInputFiles({ name: 'other-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await page.getByRole('button', { name: 'Replace data' }).click();
  await visit('Rune Clean-up');
  await expect(page.getByText('Nothing calculated yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeVisible();
});
