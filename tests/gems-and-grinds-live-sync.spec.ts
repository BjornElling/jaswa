import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { holdWorkerRequests } from './hold-worker-requests';

/** Opens a section bar, leaving one that already stands open. Recommendations
    opens by itself, so a click would close it. */
async function openSection(page: Page, title: string) {
  const summary = page.locator('summary').filter({ hasText: title });
  if (!(await summary.evaluate((node) => node.parentElement?.hasAttribute('open')))) await summary.click();
}


/**
 * Live sync replaces the whole import every time the game changes. A reader
 * scrolled down Best use or What's missing must stay where they are: nothing in
 * the results may empty, even for a moment, while the change is worked in.
 */
const account = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8'));
const version = /recommendedHelperVersion = '(\d+\.\d+\.\d+)'/.exec(readFileSync(new URL('../app/lib/helper-version.ts', import.meta.url), 'utf8'))![1];

/* Thirty more Violent runes from +12, so each ranking is ten cards long and the page scrolls. */
const source = account.runes.find((rune: { rune_id: number }) => rune.rune_id === 101);
const tall = { ...account, runes: [...account.runes, ...Array.from({ length: 30 }, (_, index) => ({ ...source, rune_id: 10000 + index,
  sec_eff: [[2, 8, 0, 0], [9, 4 + index % 8, 0, 0], [10, 3 + index % 9, 0, 0]] }))] };

async function liveHelper(page: Page, change?: (data: typeof tall, revision: number) => void) {
  let revision = 1;
  await page.route('http://127.0.0.1:37654/**', async (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    const identity = { instanceId: 'craft-live', sessionId: 1, revision };
    if (new URL(route.request().url()).pathname === '/health') {
      await route.fulfill({ headers, json: { ...identity, running: true, version, profileReady: true, missedChanges: [], lastError: null,
        restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true } });
      return;
    }
    const data = structuredClone(tall);
    /* From the second revision on, one rune has been powered up in the game. */
    if (revision > 1) data.runes.find((rune: { rune_id: number }) => rune.rune_id === 10029).upgrade_curr = 13;
    change?.(data, revision);
    await route.fulfill({ headers, json: { ...identity, updatedAt: new Date().toISOString(), source: 'live', data } });
  });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    localStorage.clear(); sessionStorage.clear();
    await savePreferences({ ...blankPreferences(), importRoute: 'direct', directImportMode: 'live', updatedAt: new Date(Date.now() + 1000).toISOString() });
  });
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('34 runes');
  return { advance: () => { revision += 1; } };
}

for (const [title, mode] of [['Recommendations', 'recommendations'], ['Best use for this', 'selected'], ["What's missing", 'missing']] as const) {
  test(`${title} keeps the leading SPD rune until its new grind has been calculated`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const workers = await holdWorkerRequests(page);
    const helper = await liveHelper(page, (data, revision) => {
      const rune = data.runes.find((entry: { rune_id: number }) => entry.rune_id === 102);
      rune.upgrade_curr = 15;
      rune.sec_eff = [[2, 8, 0, 0], [8, 30, 0, revision === 1 ? 1 : revision === 2 ? 2 : 5], [9, 6, 0, 0], [10, 5, 0, 0]];
    });
    await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
    await openSection(page, title);
    const panel = page.locator(`[data-mode="${mode}"]`);
    await panel.getByRole('combobox', { name: 'Narrow the list to one stat' }).selectOption('8');
    await page.screenshot({ path: testInfo.outputPath('before-calculation.png'), fullPage: true });
    await expect(panel.locator('.craft-recommendation')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
    const ranking = panel.locator('.craft-stat-rankings');
    const first = ranking.locator('.craft-recommendation').first();
    await expect(first.locator('.rune-sub').filter({ hasText: 'SPD' }).first()).toContainText('+31');
    const contents = await ranking.textContent();
    const bounds = await ranking.boundingBox();
    await page.screenshot({ path: testInfo.outputPath('before-sync.png'), fullPage: true });
    await workers.hold();
    helper.advance();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Calculating');
    await page.screenshot({ path: testInfo.outputPath('during-sync.png'), fullPage: true });
    expect(await ranking.textContent()).toBe(contents);
    expect(await ranking.boundingBox()).toEqual(bounds);
    await workers.release();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
    await expect(first.locator('.rune-sub').filter({ hasText: 'SPD' }).first()).toContainText('+32');
    expect(await ranking.boundingBox()).toEqual(bounds);
    await page.screenshot({ path: testInfo.outputPath('after-sync.png'), fullPage: true });
    /* Once the rune really cannot improve, remove it with the finished answer,
       preserving the last complete answer throughout this second sync too. */
    const updated = await ranking.textContent();
    await workers.hold();
    helper.advance();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Calculating');
    expect(await ranking.textContent()).toBe(updated);
    await workers.release();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
    await expect(ranking.getByRole('button', { name: 'Violent rune, slot 2', exact: true })).toHaveCount(0);
  });
}

/* Every rune a calculated Keep, as Clean-up's table would leave it, so Only keep-runes shows the whole tall list. */
const seedKeepers = (page: Page) => page.evaluate(async () => {
  const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts', runesPath = '/app/lib/runes.ts';
  const importer = await (await fetch('/app/components/use-rune-keepers.ts')).text();
  const memoryPath = /["'](\/app\/lib\/compute\/rune-advice-memory\.ts[^"']*)["']/.exec(importer)?.[1] ?? '/app/lib/compute/rune-advice-memory.ts';
  const { loadImportedGame } = await import(storagePath);
  const { blankPreferences } = await import(importsPath);
  const { rememberRuneAdvice } = await import(memoryPath);
  const { readRunes } = await import(runesPath);
  const game = await loadImportedGame();
  const preferences = blankPreferences();
  const runes = readRunes(game.data);
  const keep = { verdict: 'keep', reason: '', maxValue: 0, standing: 0, floorShare: 0, floorMaxValue: 0, chance: 0, role: null,
    rank: 'broken', craftedLines: null, buildMains: null, readings: null, bestLineTypes: false };
  rememberRuneAdvice({ data: { unit_list: game.data.unit_list }, settings: preferences.runePotential, roles: preferences.runeRoles },
    runes, new Map(runes.map((rune: { id: string }) => [rune.id, keep])));
});

/** Every scroll position the window passes through from now on. */
const watchScroll = (page: Page) => page.evaluate(() => {
  const seen: number[] = [];
  (window as unknown as { scrollSeen: number[] }).scrollSeen = seen;
  window.addEventListener('scroll', () => seen.push(window.scrollY));
});

for (const [title, mode] of [['Best use for this', 'selected'], ["What's missing", 'missing']] as const) {
  test(`${title} stays where the reader is while live sync changes a rune`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const helper = await liveHelper(page);
    if (mode === 'selected') await seedKeepers(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
    await openSection(page, title);
    const panel = page.locator(`[data-mode="${mode}"]`);
    const cards = panel.locator('.craft-recommendation');
    await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
    /* The assumption this account's ranking was written for: a two-thirds roll. */
    await panel.getByRole('combobox', { name: 'How well the roll is assumed to land' }).selectOption('two-thirds');
    await panel.getByRole('slider', { name: 'Number of runes listed in each ranking' }).fill('2');
    await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
    if (mode === 'selected') {
      await panel.getByRole('group', { name: 'Only keep-runes', exact: true }).getByRole('button', { name: 'Yes' }).click();
      await expect(panel.locator('.craft-calculation-status')).toContainText('Processor', { timeout: 120_000 });
    }
    await expect(cards.first()).toBeVisible();
    await cards.last().scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'the results should reach well below the fold').toBeGreaterThan(400);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-scrolled-before.png`) });

    await watchScroll(page);
    const status = panel.locator('.craft-calculation-status');
    const answered = await status.textContent();
    helper.advance();
    /* The changed rune is judged again on its own, so the status reports a new answer. */
    await expect(status).not.toHaveText(answered!, { timeout: 30_000 });
    await expect(status).toContainText('Processor', { timeout: 120_000 });
    const seen = await page.evaluate(() => (window as unknown as { scrollSeen: number[] }).scrollSeen);
    expect(seen.filter((y) => Math.abs(y - before) > 1), `scroll positions while live sync changed a rune: ${seen.join(', ')}`).toEqual([]);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await expect(cards.first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${mode}-scrolled-after.png`) });
  });
}
