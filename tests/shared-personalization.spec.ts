import { expect, openSettingsBar, test } from './test-fixtures';
import type { BrowserContext, Locator, Page } from './test-fixtures';
import { fileURLToPath } from 'node:url';

type SharedCopy = { token: string; preferences: Record<string, unknown> };
function helper() {
  let copy: SharedCopy | null = null;
  let revision = 0;
  let online = true;
  return {
    get: () => copy,
    replace: (preferences: Record<string, unknown>) => { copy = { token: String(++revision), preferences }; },
    setOnline: (value: boolean) => { online = value; },
    async connect(context: BrowserContext) {
      await context.route('http://127.0.0.1:37654/preferences', async (route) => {
        if (!online) { await route.abort('connectionrefused'); return; }
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON() as { expectedToken: string | null; preferences: Record<string, unknown> };
          if (body.expectedToken !== (copy?.token ?? null)) { await route.fulfill({ status: 409, json: {} }); return; }
          copy = { token: String(++revision), preferences: body.preferences };
        }
        await route.fulfill({ json: copy });
      });
    },
  };
}

async function settings(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await openSettingsBar(page, 'General');
  return page.getByRole('region', { name: 'Shared personalization' });
}
/* The panel sits inside the General bar, below the fold, and the click scrolls to its
   button: measure against the document, so a scroll is not read as the layout moving. */
const inDocument = (locator: Locator) => locator.evaluateAll((elements) => elements.map((el) => {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
}));
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}') as Record<string, unknown>);

test('two browser workspaces automatically share choices, retain offline edits and survive reloads', async ({ browser }, testInfo) => {
  const shared = helper();
  const a = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const b = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await shared.connect(a);
  await shared.connect(b);
  try {
    const first = await a.newPage();
    const panel = await settings(first);
    await expect(panel.getByRole('status')).toContainText('Personalization is shared');
    await first.screenshot({ path: testInfo.outputPath('empty-before.png'), fullPage: true });
    const boxes = await first.locator('.panel').evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().toJSON()));
    await first.locator('input[name="number-format"][value="european"]').check();
    await first.locator('input[name="hour-cycle"][value="h23"]').check();
    await expect.poll(() => (shared.get()?.preferences.general as { hourCycle?: string })?.hourCycle).toBe('h23');
    await first.screenshot({ path: testInfo.outputPath('empty-after.png'), fullPage: true });
    expect(await first.locator('.panel').evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().toJSON()))).toEqual(boxes);

    const second = await b.newPage();
    await settings(second);
    await expect(second.locator('input[name="number-format"][value="european"]')).toBeChecked();
    await expect(second.locator('input[name="hour-cycle"][value="h23"]')).toBeChecked();
    shared.setOnline(false);
    await second.locator('input[name="number-format"][value="american"]').check();
    await expect.poll(async () => ((await stored(second)).general as { numberFormat: string }).numberFormat).toBe('american');
    await second.reload();
    await expect(second.locator('input[name="number-format"][value="american"]')).toBeChecked();
    shared.setOnline(true);
    await expect(first.locator('input[name="number-format"][value="american"]')).toBeChecked();
    await first.reload();
    await expect(first.locator('input[name="number-format"][value="american"]')).toBeChecked();
  } finally { await a.close(); await b.close(); }
});

test('a populated workspace resolves conflicting copies without moving the settings panels or changing the import', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const shared = helper();
  shared.setOnline(false);
  await shared.connect(context);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(
    fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url)));
  await expect(page.getByText('synthetic-account.json')).toBeVisible();
  const panel = await settings(page);
  await page.locator('input[name="number-format"][value="european"]').check();
  await page.locator('input[name="hour-cycle"][value="h23"]').check();
  const rich = await stored(page);
  rich.presets = Array.from({ length: 24 }, (_, index) => ({
    id: `own-sharing-${index}`, name: `Shared arena team ${index} with a deliberately long name`, content: 'arena-attack',
    members: ['1', '2'], leaderUnitId: '1', gear: { 1: { runeIds: [], artifactIds: [] }, 2: { runeIds: [], artifactIds: [] } },
  }));
  rich.monsterPreferences = { scenario: { 1: { unitId: '1', label: 'A monster with a deliberately long personal name' } } };
  rich.runeHolds = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [String(index + 1), { unsellable: true }]));
  await page.getByRole('button', { name: 'Load .sw file', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Choose file…' }).click();
  await page.locator('input[type="file"][accept=".sw,application/json"]').setInputFiles({
    name: 'populated.sw', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rich)),
  });
  await expect.poll(async () => ((await stored(page)).presets as unknown[]).length).toBe(24);
  const local = await stored(page);
  expect((local.runeRoles as unknown[]).length).toBeGreaterThan(0);
  shared.replace({ ...local, general: { ...(local.general as object), numberFormat: 'american' } });
  shared.setOnline(true);
  await expect(panel.getByRole('status')).toContainText('Both copies contain different choices');
  await page.screenshot({ path: testInfo.outputPath('populated-conflict.png'), fullPage: true });
  const boxes = await inDocument(page.locator('.panel'));
  const buttons = await inDocument(panel.getByRole('button'));
  await panel.getByRole('button', { name: 'Use helper copy' }).click();
  await expect(panel.getByRole('status')).toContainText('Personalization is shared');
  await expect(page.locator('input[name="number-format"][value="american"]')).toBeChecked();
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('2 monsters');
  await page.screenshot({ path: testInfo.outputPath('populated-shared.png'), fullPage: true });
  expect(await inDocument(page.locator('.panel'))).toEqual(boxes);
  expect(await inDocument(panel.getByRole('button'))).toEqual(buttons);
  await page.reload();
  await expect(page.locator('input[name="number-format"][value="american"]')).toBeChecked();
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('2 monsters');
  expect((await stored(page)).presets).toEqual(local.presets);
  expect((await stored(page)).monsterPreferences).toEqual(local.monsterPreferences);
  expect((await stored(page)).runeHolds).toEqual(local.runeHolds);
  expect((await stored(page)).runeRoles).toEqual(local.runeRoles);
});
