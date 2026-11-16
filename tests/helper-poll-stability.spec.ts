import { expect, test } from './test-fixtures';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
const version = /recommendedHelperVersion = '(\d+\.\d+\.\d+)'/.exec(readFileSync(new URL('../app/domain/shared/helper-version.ts', import.meta.url), 'utf8'))![1];

test.use({ viewport: { width: 1440, height: 1100 } });

for (const populated of [false, true]) {
  test(`a rejected snapshot stays stable across polls with ${populated ? 'an existing' : 'no'} import`, async ({ page }, testInfo) => {
    let revision = 1;
    let sessionId = 1;
    let invalid = !populated;
    let recovered = false;
    let reads = 0;
    let polls = 0;
    const headers = { 'Access-Control-Allow-Origin': '*' };
    const identity = () => ({ instanceId: 'stable-helper', sessionId, revision });
    await page.route((url) => url.origin === 'http://127.0.0.1:37654' && (url.pathname === '/health' || url.pathname === '/profile'), async (route) => {
      if (new URL(route.request().url()).pathname === '/health') {
        polls++;
        await route.fulfill({ headers, json: { ...identity(), running: true, version, profileReady: true,
          missedChanges: [], lastError: null, restartRequired: false, gameStartedBeforeHelper: false,
          gameLoginPending: false, gameRunning: true } });
      } else {
        reads++;
        // Keep health and profile in separate renders: the reported loop lived
        // between those two answers, invisible to an end-of-poll assertion.
        await new Promise((resolve) => setTimeout(resolve, 300));
        const data = structuredClone(account);
        if (recovered) data.artifacts.pop();
        if (invalid) data.defense_deck_info = { unit_id_list: [999999, 999999], equip: [] };
        await route.fulfill({ headers, json: { ...identity(), updatedAt: new Date().toISOString(), source: 'live', data } });
      }
    });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    await page.locator('input[name="import-route"][value="direct"]').check();
    await page.locator('input[name="direct-import-mode"][value="live"]').check();
    const connection = page.getByRole('status', { name: 'Helper program connection' });
    const stopped = page.getByRole('status', { name: 'Live import stopped' });
    if (populated) {
      await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('4 artifacts');
      invalid = true;
      revision++;
    }
    await expect(page.locator('.import-message')).toContainText('invalid or repeated monster');
    if (populated) await expect(stopped).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({ path: testInfo.outputPath('rejected-before-polls.png') });
    const panels = await page.locator('.workspace-page .panel').evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    await connection.evaluate((element) => {
      const states: string[] = [];
      Object.assign(window, { helperObservedStates: states });
      new MutationObserver(() => states.push(element.querySelector('.acceleration-word')?.textContent ?? ''))
        .observe(element, { childList: true, subtree: true, characterData: true });
    });
    const readsBefore = reads;
    const pollsBefore = polls;
    await expect.poll(() => polls).toBeGreaterThanOrEqual(pollsBefore + 3);
    await page.screenshot({ path: testInfo.outputPath('rejected-after-polls.png') });
    expect(await page.evaluate(() => (window as unknown as { helperObservedStates: string[] }).helperObservedStates))
      .not.toContain('Unavailable');
    await expect(connection.locator('.acceleration-word')).toHaveText('Connected');
    expect(reads).toBe(readsBefore);
    expect(await page.locator('.workspace-page .panel').evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }))).toEqual(panels);
    // An explicit retry is allowed; an unchanged invalid revision is not
    // downloaded again by each background poll.
    if (populated) {
      await page.locator('input[name="direct-import-mode"][value="on-load"]').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Switch mode', exact: true }).click();
      await page.getByRole('button', { name: 'Reload game data', exact: true }).click();
      await expect.poll(() => reads).toBe(readsBefore + 1);
      await expect(page.getByRole('button', { name: 'Reload game data', exact: true })).toBeEnabled();
      await expect(stopped).toBeVisible();
    }
    invalid = false;
    recovered = true;
    if (populated) sessionId++;
    else revision++;
    if (populated) {
      await page.locator('input[name="direct-import-mode"][value="live"]').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Switch mode', exact: true }).click();
    }
    await expect(stopped).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('3 artifacts');
    await expect(connection.locator('.acceleration-word')).toHaveText('Connected');
    await expect(page.locator('.import-message')).toBeEmpty();
    await page.screenshot({ path: testInfo.outputPath('recovered.png') });
  });
}

for (const failure of ['HTTP', 'envelope'] as const) {
  test(`${failure} failures do not publish a provisional connection success and recover at the same revision`, async ({ page }) => {
    let broken = true;
    let reads = 0;
    const headers = { 'Access-Control-Allow-Origin': '*' };
    const identity = { instanceId: 'retry-helper', sessionId: 1, revision: 1 };
    await page.route((url) => url.origin === 'http://127.0.0.1:37654' && (url.pathname === '/health' || url.pathname === '/profile'), async (route) => {
      if (new URL(route.request().url()).pathname === '/health') {
        await route.fulfill({ headers, json: { ...identity, running: true, version, profileReady: true,
          missedChanges: [], lastError: null, restartRequired: false, gameStartedBeforeHelper: false,
          gameLoginPending: false, gameRunning: true } });
      } else {
        reads++;
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({ headers, status: broken && failure === 'HTTP' ? 503 : 200,
          json: broken ? {} : { ...identity, updatedAt: new Date().toISOString(), source: 'live', data: account } });
      }
    });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    await page.locator('input[name="import-route"][value="direct"]').check();
    const word = page.getByRole('status', { name: 'Helper program connection' }).locator('.acceleration-word');
    await expect(word).toHaveText('Unavailable');
    await word.evaluate((element) => {
      const states: string[] = [];
      Object.assign(window, { helperObservedStates: states });
      new MutationObserver(() => states.push(element.textContent ?? ''))
        .observe(element, { childList: true, subtree: true, characterData: true });
    });
    const before = reads;
    await expect.poll(() => reads).toBeGreaterThanOrEqual(before + 3);
    expect(await page.evaluate(() => (window as unknown as { helperObservedStates: string[] }).helperObservedStates))
      .not.toContain('Connected');
    broken = false;
    await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('4 artifacts');
    await expect(word).toHaveText('Connected');
  });
}
