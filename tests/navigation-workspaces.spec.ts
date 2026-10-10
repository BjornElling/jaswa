import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

for (const populated of [false, true]) {
  test(`separate monster pages and rune navigation stay in place (${populated ? 'imported' : 'empty'})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    if (populated) {
      await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
      await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
    }
    const rail = page.getByRole('navigation');
    const group = (heading: string) => rail.locator('.rail-group').filter({
      has: page.locator('.rail-heading', { hasText: heading }),
    });
    await expect(group('Monsters').getByRole('button')).toHaveText(['♜Stats', '♜Numbers']);
    await expect(group('Rune Optimization').getByRole('button')).toHaveText([
      '⇅Presets', '↝Speed tuning', '◈Optimization',
    ]);
    await expect(group('Rune Clean-up').getByRole('button')).toHaveText([
      '⚙Settings', '◌Clean-up', '✦Gems & grinds', '↻Simulator',
    ]);

    await rail.getByRole('button', { name: 'Monster Stats', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Monster Stats', exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(0);
    if (populated) await expect(page.getByRole('table', { name: 'Monster stats', exact: true })).toBeVisible();
    else await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
    const before = await rail.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()));
    await page.screenshot({ path: testInfo.outputPath('stats-before.png') });

    await rail.getByRole('button', { name: 'Monster Numbers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Monster Numbers', exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(0);
    if (populated) await expect(page.getByRole('table', { name: 'Monster numbers', exact: true })).toBeVisible();
    else await expect(page.getByText('Import your game data first. Your monsters will appear here when JASWA has an account to inspect.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('numbers-after.png') });
    expect(await rail.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))).toEqual(before);

    if (populated) {
      const locations = page.getByRole('group', { name: 'Choose which locations to include' });
      const checkbox = locations.getByRole('checkbox').first();
      const filters = page.locator('.storage-filter-strip');
      const positions = await filters.getByRole('checkbox').evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().toJSON()));
      await checkbox.uncheck();
      await page.screenshot({ path: testInfo.outputPath('numbers-filtered.png') });
      expect(await filters.getByRole('checkbox').evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().toJSON()))).toEqual(positions);
    }
    await rail.getByRole('button', { name: 'Rune Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rune Settings', exact: true })).toBeVisible();
    await rail.getByRole('button', { name: 'Rune Simulator', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rune Simulator', exact: true })).toBeVisible();
  });
}
