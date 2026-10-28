import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const recommended = /recommendedHelperVersion = '(\d+\.\d+\.\d+)'/.exec(readFileSync(new URL('../app/lib/helper-version.ts', import.meta.url), 'utf8'))![1];

/* The corner cards are measured against the root's client width, which only
   differs from the window's while a scrollbar is drawn. */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

/** `announced` is what JASWA last told the helper it ships, read off the poll. */
type Helper = { reachable: boolean; version: string; profileReady: boolean; announced?: string | null };

/* A helper whose answer the test can change between polls, so the warning is
   seen to arrive and to leave on the same page rather than on two loads. */
async function serveHelper(page: Page, helper: Helper) {
  const identity = { instanceId: 'test-helper', sessionId: 1, revision: 1 };
  const headers = { 'Access-Control-Allow-Origin': '*' };
  await page.route((url) => url.origin === 'http://127.0.0.1:37654' && url.pathname === '/health', (route) => {
    helper.announced = new URL(route.request().url()).searchParams.get('latest');
    return helper.reachable
      ? route.fulfill({ headers, json: {
        ...identity, running: true, version: helper.version, profileReady: helper.profileReady, lastError: null,
        restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false,
      } })
      : route.abort();
  });
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...identity, updatedAt: new Date().toISOString(), source: 'game-start', data: account,
  } }));
}

const notice = (page: Page) => page.getByRole('status', { name: 'Helper update available' });
const importRoute = (page: Page, value: 'direct' | 'file') => page.locator(`input[name="import-route"][value="${value}"]`);
const homeBoxes = (page: Page) => page.locator('.workspace-page .panel').evaluateAll((panels) =>
  panels.map((panel) => { const { x, y, width, height } = panel.getBoundingClientRect(); return { x, y, width, height }; }));

test('with nothing imported, the warning takes the corner and leaves with the route', async ({ page }, testInfo) => {
  const helper: Helper = { reachable: false, version: '0.0.1', profileReady: false };
  await serveHelper(page, helper);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await importRoute(page, 'direct').check();
  await expect(page.getByRole('status', { name: 'Helper program connection' })).toContainText('Helper is not running');
  /* Measure the notice's effect after the web font settles, so a late font swap
     cannot be mistaken for movement caused by the helper's next poll. */
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await homeBoxes(page);
  await page.screenshot({ path: testInfo.outputPath('notice-empty-before.png') });

  helper.reachable = true;
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText(`Version ${recommended} is now available.`);
  /* The helper's own window learns of the release from this poll, not from a
     request of its own. */
  expect(helper.announced).toBe(recommended);
  await expect(notice(page)).toContainText('You should let it rest.');
  const link = notice(page).getByRole('link', { name: 'Download update' });
  await expect(link).toHaveAttribute('href', `/JASWA-Helper-Setup-${recommended}.exe`);
  await expect(link).toHaveAttribute('download', `JASWA-Helper-Setup-${recommended}.exe`);
  /* Nothing in the Game data card says it any more: the corner is the one place. */
  await expect(page.locator('.import-routes').getByText('Helper is tired, boss')).toHaveCount(0);
  /* An overlay: the page under it stays where it was. */
  expect(await homeBoxes(page)).toEqual(before);
  const box = (await notice(page).boundingBox())!;
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box.y).toBeLessThan(40);
  expect(clientWidth - (box.x + box.width)).toBeLessThan(64);
  expect(await notice(page).evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('notice-empty-after.png') });

  /* The file route asks no helper anything, so the last answer must not stand. */
  await importRoute(page, 'file').check();
  await expect(notice(page)).toHaveCount(0);
  await importRoute(page, 'direct').check();
  await expect(notice(page)).toBeVisible();

  /* A stopped helper has no version to be behind on. */
  helper.reachable = false;
  await expect(notice(page)).toHaveCount(0);
});

test('under the badge the warning comes first, the confirmation below it, all one width', async ({ page }, testInfo) => {
  const helper: Helper = { reachable: true, version: '0.0.1', profileReady: true };
  await serveHelper(page, helper);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await importRoute(page, 'direct').check();

  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(badge).toBeVisible();
  await expect(notice(page)).toBeVisible();
  await expect(confirmation).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const badgeBox = (await badge.boundingBox())!;
  const noticeBox = (await notice(page).boundingBox())!;
  const toastBox = (await confirmation.boundingBox())!;
  expect(noticeBox.y).toBeGreaterThan(badgeBox.y + badgeBox.height);
  expect(toastBox.y).toBeGreaterThan(noticeBox.y + noticeBox.height);
  for (const card of [noticeBox, toastBox]) {
    expect(Math.abs(card.x - badgeBox.x)).toBeLessThan(0.25);
    expect(Math.abs(card.width - badgeBox.width)).toBeLessThan(0.25);
  }
  /* The gap is the same step under each card. */
  expect(toastBox.y - (noticeBox.y + noticeBox.height)).toBeCloseTo(noticeBox.y - (badgeBox.y + badgeBox.height), 0);
  expect(await notice(page).evaluate((card) => card.scrollHeight - card.clientHeight)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('notice-full-stacked.png') });

  /* Updated, the helper says so on its next answer and the warning goes. */
  helper.version = recommended;
  await expect(notice(page)).toHaveCount(0);
  await expect(badge).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('notice-full-updated.png') });
});
