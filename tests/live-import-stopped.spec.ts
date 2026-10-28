import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/*
 * A helper snapshot JASWA refuses stops live import, and the refusal used to be
 * said on Home alone. On every other page the badge simply kept an old time:
 * a deck saved in the game never arrived and nothing said why. The notice has
 * to stand on the page the user is on, over the page rather than in it, and go
 * as soon as a readable snapshot arrives.
 */

type Account = { unit_list: { unit_id: number; runes: { rune_id: number; slot_no: number }[] }[] };
const account = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8')) as Account;

/* The same account with one rune on both monsters — the contradiction a deck's
   gear read as a monster's own once produced. */
function withOneRuneTwice(): Account {
  const copy = structuredClone(account);
  const [first, second] = copy.unit_list;
  const rune = first.runes[0];
  second.runes = [rune, ...second.runes.filter((entry) => entry.slot_no !== rune.slot_no)];
  return copy;
}

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function serveHelper(page: Page, state: { revision: number; data: Account }) {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const identity = () => ({ instanceId: 'test-helper', sessionId: 1, revision: state.revision });
  await page.route('http://127.0.0.1:37654/health', (route) => route.fulfill({ headers, json: {
    ...identity(), running: true, version: '99.0.0', profileReady: true, lastError: null,
    restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...identity(), updatedAt: new Date().toISOString(), source: 'live', data: state.data,
  } }));
}

const stopped = (page: Page) => page.getByRole('status', { name: 'Live import stopped' });
const railButton = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });
const pageBoxes = (page: Page) => page.locator('.workspace-page > *').evaluateAll((boxes) =>
  boxes.map((box) => { const { x, y, width, height } = box.getBoundingClientRect(); return { x, y, width, height }; }));

test('a refused snapshot is said on every page, over it, and goes with the next readable one', async ({ page }, testInfo) => {
  const state = { revision: 1, data: account };
  await serveHelper(page, state);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toBeVisible();

  await railButton(page, 'Presets').click();
  await expect(railButton(page, 'Presets')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('status', { name: 'Game data loaded correctly' })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.workspace-page > *').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const importedAt = await badge.textContent();
  const before = await pageBoxes(page);
  await expect(stopped(page)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('stopped-before.png') });

  state.revision = 2;
  state.data = withOneRuneTwice();
  await expect(stopped(page)).toBeVisible();
  await expect(stopped(page)).toContainText('This file engraves one rune on two monsters.');
  await expect(stopped(page)).toContainText('Changes made in the game since then are not shown.');
  /* The import shown is still the last good one, and the page under the card did not move. */
  expect(await badge.textContent()).toBe(importedAt);
  expect(await pageBoxes(page)).toEqual(before);
  const badgeBox = (await badge.boundingBox())!;
  const noticeBox = (await stopped(page).boundingBox())!;
  expect(noticeBox.y).toBeGreaterThan(badgeBox.y + badgeBox.height);
  expect(Math.abs(noticeBox.width - badgeBox.width)).toBeLessThan(0.25);
  expect(await stopped(page).evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('stopped-after.png') });

  /* It stands on every page, not on the one it appeared on. */
  await railButton(page, 'Speed Tuning').click();
  await expect(stopped(page)).toBeVisible();

  state.revision = 3;
  state.data = account;
  await expect(stopped(page)).toHaveCount(0);
  await expect(badge).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('stopped-recovered.png') });
});
