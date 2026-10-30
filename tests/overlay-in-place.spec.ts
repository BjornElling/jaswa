import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * A button that opens an overlay opens it over the page the user is on. It
 * never goes to the page the overlay is about and opens it there: Presets'
 * Speed tuning once did, and the user lost the page they were working on for
 * the sake of a dialog that needed none of it. Only the rail and Optimize,
 * which name a page rather than a dialog, change the page.
 *
 * Every opener says what it does with `aria-haspopup="dialog"`, so the sweep
 * below holds a button added tomorrow to the same rule without naming it.
 */

const base = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
const account = {
  ...base,
  deck_list: [
    { deck_type: 1, deck_seq: 4, unit_id_list: [12, 11, 0, 0], leader_unit_id: 12, equip: null },
    { deck_type: 24, deck_seq: 101, unit_id_list: [11, 0, 0, 0, 0], equip: null },
  ],
};

/* Every page the rail offers, by the name its button carries. */
const pages = ['Home', 'Monster Stats', 'Monster Numbers', 'Presets', 'Speed Tuning', 'Rune Optimization', 'Gems & Grinds',
  'Rune Settings', 'Rune Clean-up', 'Artifacts', 'Artifact Optimization', 'Relic Optimization', 'Settings', 'The Math'];

/* The openers each of these pages is known to carry, so the sweep can never pass by finding none. */
const expected: Record<string, readonly RegExp[]> = {
  Presets: [/^Speed tuning for Arena Attack 4$/],
  'Speed Tuning': [/^Arena Attack 4: /],
  'Rune Optimization': [/^Speed tuning for Arena Attack 4$/, /^Open profile$/, /^Statistics for /],
};

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function importAccount(page: Page) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'overlay-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('overlay-account.json').first()).toBeVisible();
  /* A preset with a team and one of its monsters, chosen across the program,
     so every Speed tuning button and Open profile has something to open. */
  await page.evaluate(() => {
    window.sessionStorage.setItem('jaswa.presets.selected', JSON.stringify('deck-1-4'));
    window.sessionStorage.setItem('jaswa.runeOptimization.unitId', JSON.stringify('12'));
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

const railButton = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function goTo(page: Page, name: string) {
  await railButton(page, name).click();
  await expect(railButton(page, name)).toHaveAttribute('aria-current', 'page');
}

/** Where the user stands: the rail's current page, the stored page and the browser's history. */
async function whereabouts(page: Page) {
  return page.evaluate(() => ({
    current: document.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label') ?? document.querySelector('nav [aria-current="page"]')?.textContent,
    stored: window.sessionStorage.getItem('jaswa.navigation.page'),
    history: window.history.length,
    state: JSON.stringify(window.history.state),
  }));
}

async function closeEveryDialog(page: Page) {
  /* Escape, because a choice popover is a dialog too and has no close button. */
  for (let left = 4; left > 0 && await page.getByRole('dialog').count() > 0; left -= 1) {
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** One opener of each kind on the page, so a table of a hundred monster links costs one click. */
async function openersByKind(page: Page): Promise<Locator[]> {
  const all = page.locator('main [aria-haspopup="dialog"]:visible:not([disabled])');
  const kinds = await all.evaluateAll((elements) => elements.map((element) =>
    `${element.className}|${(element.getAttribute('aria-label') ?? element.textContent ?? '').split(/ for | from |: /)[0]}`));
  const first = new Map<string, number>();
  kinds.forEach((kind, at) => { if (!first.has(kind)) first.set(kind, at); });
  return [...first.values()].map((at) => all.nth(at));
}

test('every overlay opener opens its overlay over the page it sits on', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);

  for (const name of pages) {
    await goTo(page, name);
    for (const pattern of expected[name] ?? []) {
      await expect(page.locator('main').getByRole('button', { name: pattern }).first(), `${name} carries ${pattern}`).toBeEnabled();
    }
    const openers = await openersByKind(page);
    for (const opener of openers) {
      const label = (await opener.getAttribute('aria-label')) ?? (await opener.textContent());
      const before = await whereabouts(page);
      await opener.click();
      await expect(page.getByRole('dialog').first(), `${name}: ${label} opens a dialog`).toBeVisible();
      expect(await whereabouts(page), `${name}: ${label} stays on ${name}`).toEqual(before);
      await expect(railButton(page, name)).toHaveAttribute('aria-current', 'page');
      await closeEveryDialog(page);
      expect(await whereabouts(page), `${name}: closing ${label} stays on ${name}`).toEqual(before);
    }
  }
});

test('a team opened over Presets stacks a monster on top, returns focus, and goes with Back', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page);
  await goTo(page, 'Speed Tuning');
  await goTo(page, 'Presets');
  const opener = page.getByRole('button', { name: 'Speed tuning for Arena Attack 4', exact: true });
  await page.screenshot({ path: testInfo.outputPath('presets-before.png') });
  await opener.click();
  const team = page.getByRole('dialog', { name: 'Arena Attack 4' });
  await expect(team).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeAttached();
  await page.screenshot({ path: testInfo.outputPath('presets-team-open.png') });

  /* A member's name opens the monster over the team; closing it leaves the team standing. */
  await team.locator('.monster-link').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(team).toBeVisible();

  /* Closed, focus is back on the button that opened it. */
  await page.keyboard.press('Escape');
  await expect(team).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('presets-after.png') });

  /* Opened again, Back leaves Presets for the page before it and takes the team along. */
  await opener.click();
  await expect(team).toBeVisible();
  await page.goBack();
  await expect(railButton(page, 'Speed Tuning')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
