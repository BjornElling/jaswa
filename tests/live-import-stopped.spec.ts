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

type Miss = { command: string; reason: string; cause: 'encrypted' | 'unread' };

async function serveHelper(page: Page, state: { revision: number; data: Account; error?: string | null; missed?: Miss[]; ready?: boolean }) {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const identity = () => ({ instanceId: 'test-helper', sessionId: 1, revision: state.revision });
  await page.route((url) => url.origin === 'http://127.0.0.1:37654' && url.pathname === '/health', (route) => route.fulfill({ headers, json: {
    ...identity(), running: true, version: '99.0.0', profileReady: (state.ready ?? true) && !state.error, missedChanges: state.missed ?? [], lastError: state.error ?? null,
    restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: state.ready ?? true,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...identity(), updatedAt: new Date().toISOString(), source: 'live', data: state.data,
  } }));
}

const stopped = (page: Page) => page.getByRole('status', { name: 'Live import stopped' });
const railButton = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });
const pageBoxes = (page: Page) => page.locator('.workspace-page > *').evaluateAll((boxes) =>
  boxes.map((box) => { const { x, y, width, height } = box.getBoundingClientRect(); return { x, y, width, height }; }));

test('a helper-side stop is visible over the current page and clears on same-revision recovery', async ({ page }, testInfo) => {
  const reason = 'The account login could not be read. Save an error report, then restart Summoners War to capture a fresh account.';
  const state = { revision: 1, data: account, error: reason as string | null };
  await serveHelper(page, state);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  await railButton(page, 'Rune Clean-up').click();
  /* The import badge can settle before this lazy workspace mounts. Measure
     the requested page in both states, rather than its loading placeholder. */
  await expect(page.getByRole('heading', { name: 'Rune Clean-up', exact: true })).toBeVisible();
  await expect(stopped(page)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('helper-gap-empty.png') });

  state.error = null;
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Game data loaded correctly' })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await pageBoxes(page);
  await page.screenshot({ path: testInfo.outputPath('helper-gap-before.png') });
  state.error = reason;
  await expect(stopped(page)).toBeVisible({ timeout: 8_000 });
  await expect(stopped(page)).toContainText(reason);
  expect(await stopped(page).evaluate(card => getComputedStyle(card).getPropertyValue('--notice').trim() === getComputedStyle(card).getPropertyValue('--state-bad').trim())).toBe(true);
  expect(await pageBoxes(page)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('helper-gap-stopped.png') });
  await railButton(page, 'Presets').click();
  await expect(stopped(page)).toBeVisible();
  state.error = null;
  await expect(stopped(page)).toHaveCount(0, { timeout: 8_000 });
  await page.screenshot({ path: testInfo.outputPath('helper-gap-recovered.png') });
});

/*
 * A change the helper could not read no longer stops anything: the next one
 * still arrives. It is still a gap the user is told about, on every page, until
 * a login replaces the account — and a real stop, when there is one, outranks it.
 */
test('a missed change is said on every page while import keeps moving', async ({ page }, testInfo) => {
  const state: { revision: number; data: Account; error?: string | null; missed?: Miss[] } = { revision: 1, data: account, missed: [] };
  const miss = (command: string, cause: Miss['cause'] = 'unread'): Miss => ({ command, reason: '1 rune record at gift_box.rune was not read', cause });
  const sealed = (command: string) => miss(command, 'encrypted');
  const gap = page.getByRole('status', { name: 'Some game changes were missed' });
  await serveHelper(page, { ...state, missed: [miss('FutureRuneGift')] });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(gap).toHaveCount(0, { timeout: 3_000 });
  await page.screenshot({ path: testInfo.outputPath('missed-empty.png') });

  await page.unrouteAll();
  await serveHelper(page, state);
  await page.locator('input[name="import-route"][value="direct"]').check();
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toBeVisible();
  await railButton(page, 'Presets').click();
  await expect(page.getByRole('status', { name: 'Game data loaded correctly' })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.workspace-page > *').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await pageBoxes(page);
  await expect(gap).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('missed-before.png') });

  state.missed = [miss('ConvertArtifactByPiece')];
  await expect(gap).toBeVisible();
  await expect(gap).toContainText('The helper cannot read ConvertArtifactByPiece yet — a JASWA update can fix that.');
  await expect(gap).toContainText('Everything else keeps arriving.');
  /* A gap is a warning, never the red of a stop. */
  await expect(gap).toHaveAttribute('data-notice-tone', 'warn');
  await expect(stopped(page)).toHaveCount(0);
  expect(await pageBoxes(page)).toEqual(before);
  const badgeBox = (await badge.boundingBox())!;
  const gapBox = (await gap.boundingBox())!;
  expect(gapBox.y).toBeGreaterThan(badgeBox.y + badgeBox.height);
  expect(Math.abs(gapBox.width - badgeBox.width)).toBeLessThan(0.25);
  await page.screenshot({ path: testInfo.outputPath('missed-one.png') });

  /* An encrypted miss is the game's own limit: said as such, not as a command
     JASWA has yet to learn, and still a gap. Beside an unread miss each sentence
     names only its own kind — the Raid sentence once read as the reason a sale
     of summoning pieces was missed. */
  state.missed = [sealed('BattleRiftOfWorldsRaidResult'), sealed('BattleRiftOfWorldsRaidResult')];
  await expect(gap).toContainText('Rift Raid rewards are encrypted on purpose by the game’s developer — a deliberate limit no JASWA update can get around.');
  await expect(gap).toContainText('Restart Summoners War after your runs to load them.');
  await expect(gap).not.toContainText('BattleRiftOfWorldsRaidResult');
  await expect(gap).toHaveAttribute('data-notice-tone', 'warn');
  expect(await pageBoxes(page)).toEqual(before);
  expect(await gap.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('missed-raid.png') });
  state.missed = [sealed('BattleRiftOfWorldsRaidResult'), miss('sellSummonPieces')];
  await expect(gap).toContainText('The helper cannot read sellSummonPieces yet — a JASWA update can fix that. Rift Raid rewards were missed too: the game’s developer encrypts them on purpose.');
  await expect(gap).toContainText('Restart Summoners War for a complete import.');
  await expect(gap).toHaveAttribute('data-notice-tone', 'warn');
  await expect(gap).not.toContainText('BattleRiftOfWorldsRaidResult');
  expect(await gap.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('missed-raid-and-one.png') });
  /* The cause decides, not the command: an unread Raid result is a reader to
     fix, and another sealed answer is the game's limit under its own name. */
  state.missed = [miss('BattleRiftOfWorldsRaidResult'), sealed('FutureSealedAnswer')];
  await expect(gap).toContainText('The helper cannot read BattleRiftOfWorldsRaidResult yet');
  await expect(gap).toContainText('FutureSealedAnswer answers were missed too');
  state.missed = [miss('ConvertArtifactByPiece')];
  await expect(gap).not.toContainText('Rift Raid');

  /* Import goes on beneath the warning: a new revision still arrives. */
  const counted = await badge.textContent();
  const fewer = structuredClone(account);
  fewer.unit_list[0].runes = fewer.unit_list[0].runes.slice(1);
  state.data = fewer;
  state.revision = 2;
  await expect(badge).not.toHaveText(counted!, { timeout: 8_000 });
  await expect(gap).toBeVisible();
  await railButton(page, 'Speed Tuning').click();
  await expect(gap).toBeVisible();

  /* Everything filled in: forty long command names, each named once, three shown. */
  state.missed = [miss('ConvertArtifactByPiece'), ...Array.from({ length: 40 }, (_, index) => miss(`FutureCommandWithAVeryLongNameThatNeverEnds${index}`)), miss('ConvertArtifactByPiece')];
  await expect(gap).toContainText('and 38 more');
  expect((await gap.textContent())!.split('ConvertArtifactByPiece').length).toBe(2);
  expect(await gap.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('missed-many.png') });

  /* A stop outranks a gap, in the same place. */
  state.error = 'The account login could not be read. Save an error report, then restart Summoners War to capture a fresh account.';
  await expect(stopped(page)).toBeVisible({ timeout: 8_000 });
  await expect(gap).toHaveCount(0);
  state.error = null;
  await expect(stopped(page)).toHaveCount(0, { timeout: 8_000 });
  await expect(gap).toBeVisible();

  /* A login carries the whole account again and clears the list. */
  state.missed = [];
  await expect(gap).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('missed-cleared.png') });
});

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
  expect(await stopped(page).evaluate(card => getComputedStyle(card).getPropertyValue('--notice').trim() === getComputedStyle(card).getPropertyValue('--state-bad').trim())).toBe(true);
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


test('routine waiting and API failures never impersonate a red capture state', async ({ page }, testInfo) => {
  const state = { revision: 1, data: account, ready: true, error: null as string | null };
  await serveHelper(page, state);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toBeVisible();
  await railButton(page, 'Presets').click();
  await expect(page.getByRole('status', { name: 'Game data loaded correctly' })).toHaveCount(0);
  await expect(page.locator('.workspace-page > *').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await pageBoxes(page);
  const imported = await badge.textContent();
  await page.screenshot({ path: testInfo.outputPath('connection-before.png') });

  state.error = 'Gateway exchange failed: a real interrupted exchange';
  await expect(stopped(page)).toContainText(state.error);
  await page.screenshot({ path: testInfo.outputPath('connection-real-error.png') });
  state.error = null;
  state.ready = false;
  await expect(stopped(page)).toHaveCount(0, { timeout: 8000 });
  await page.screenshot({ path: testInfo.outputPath('connection-game-closed.png') });
  expect(await pageBoxes(page)).toEqual(before);

  for (const failure of ['connectionrefused', 'http-error', 'invalid-health', 'startup', 'waiting']) {
    await page.route('http://127.0.0.1:37654/**', route => {
      if (failure === 'connectionrefused') return route.abort('connectionrefused');
      if (failure === 'http-error') return route.fulfill({ status: 503, json: {} });
      if (failure === 'invalid-health') return route.fulfill({ json: {} });
      return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: {
        instanceId: 'test-helper', sessionId: 1, revision: 1, running: true, version: '99.0.0',
        profileReady: false, lastError: null, missedChanges: [],
        restartRequired: failure === 'startup', gameStartedBeforeHelper: failure === 'startup',
        gameLoginPending: failure === 'waiting', gameRunning: failure !== 'connectionrefused',
      } });
    });
    await page.waitForTimeout(4500);
    await expect(stopped(page)).toHaveCount(0, { timeout: 1000 });
    expect(await badge.textContent()).toBe(imported);
    expect(await pageBoxes(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`connection-${failure}.png`) });
    await page.unroute('http://127.0.0.1:37654/**');
  }
  state.ready = true;
  state.revision = 2;
  state.data = structuredClone(account);
  state.data.unit_list[0].runes = [];
  await expect(badge).not.toHaveText(imported!);
  await expect(stopped(page)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('connection-resumed.png') });
});
