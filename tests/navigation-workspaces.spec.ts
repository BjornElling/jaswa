import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

for (const populated of [false, true]) {
  test(`workspace navigation stays in place (${populated ? 'imported' : 'empty'})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    if (populated) {
      await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
      await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
    }
    const rail = page.getByRole('navigation');
    const railPositions = () => rail.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().toJSON()));
    const group = (heading: string) => rail.locator('.rail-group').filter({
      has: page.locator('.rail-heading', { hasText: new RegExp(`^${heading}$`) }),
    });
    await expect(rail.locator('.rail-heading')).toHaveText([
      'General', 'Monsters', 'Runes', 'Artifacts', 'Relics', 'Technical',
    ]);
    await expect(group('Monsters').getByRole('button')).toHaveText(['♜Overview', '♜Usage']);
    await expect(group('Runes').getByRole('button')).toHaveText([
      '◌Clean-up', '◈Optimization', '⇅Presets', '↝Speed tuning', '✦Gems & grinds',
    ]);
    await expect(group('General').getByRole('button')).toHaveText(['⌂Home', '⚙Settings']);
    await expect(group('Artifacts').getByRole('button')).toHaveText(['◆Optimization']);
    await expect(group('Relics').getByRole('button')).toHaveText(['◇Optimization']);
    await expect(group('Technical').getByRole('button')).toHaveText(['※The Math', '↻Simulator']);

    await rail.getByRole('button', { name: 'Monster Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Monster Overview', exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(0);
    if (populated) await expect(page.getByRole('table', { name: 'Monster stats', exact: true })).toBeVisible();
    else await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
    const before = await railPositions();
    await page.screenshot({ path: testInfo.outputPath('stats-before.png') });

    await rail.getByRole('button', { name: 'Monster Usage', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Monster Usage', exact: true })).toBeVisible();
    await expect(page.locator('summary')).toHaveCount(0);
    if (populated) await expect(page.getByRole('table', { name: 'Monster numbers', exact: true })).toBeVisible();
    else await expect(page.getByText('Import your game data first. Your monsters will appear here when JASWA has an account to inspect.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('numbers-after.png') });
    expect(await railPositions()).toEqual(before);

    if (populated) {
      const locations = page.getByRole('group', { name: 'Choose which locations to include' });
      const checkbox = locations.getByRole('checkbox').first();
      const filters = page.locator('.storage-filter-strip');
      const positions = await filters.getByRole('checkbox').evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().toJSON()));
      await checkbox.uncheck();
      await page.screenshot({ path: testInfo.outputPath('numbers-filtered.png') });
      expect(await filters.getByRole('checkbox').evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().toJSON()))).toEqual(positions);
    }
    const runes = group('Runes');
    await runes.getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rune Clean-up', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('runes-clean-up.png') });
    await runes.getByRole('button', { name: 'Rune Optimization', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('runes-optimization.png') });
    expect(await railPositions()).toEqual(before);

    await rail.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await rail.getByRole('button', { name: 'Rune Simulator', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rune Simulator', exact: true })).toBeVisible();
  });
}
