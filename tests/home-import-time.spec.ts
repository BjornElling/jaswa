import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

test.use({ timezoneId: 'Europe/Copenhagen', locale: 'da-DK', viewport: { width: 1600, height: 1000 } });

test('Home and the corner badge call an import today only on its local calendar day and keep its time', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-01T12:04:00Z'));
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(page.locator('.loaded-data')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('home-no-import.png') });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  const meta = page.locator('.loaded-data .meta-line');
  await expect(meta).toHaveText('synthetic-account.json · imported today, 13.04');
  const badgeTime = page.locator('.import-badge-when');
  await expect(badgeTime).toHaveText('imported today, 13.04');
  const boxes = () => page.locator('.loaded-data, .loaded-data > *, .loaded-data + *').evaluateAll((nodes) => nodes.map((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const today = await boxes();
  await page.screenshot({ path: testInfo.outputPath('home-import-today.png') });
  await page.clock.setFixedTime(new Date('2026-11-02T12:04:00Z'));
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(meta).toHaveText('synthetic-account.json · imported 1. nov. 2026, 13.04');
  await expect(badgeTime).toHaveText('imported 1. nov. 2026, 13.04');
  expect(await boxes()).toEqual(today);
  await page.screenshot({ path: testInfo.outputPath('home-import-earlier.png') });
});
