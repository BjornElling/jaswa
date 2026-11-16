import { expect, test } from './test-fixtures';
import type { Page } from './test-fixtures';
import { readFileSync } from 'node:fs';

/**
 * Back and Forward — the browser's, and the mouse's back button with them —
 * walk the pages the user went through inside JASWA, whether by the rail or by
 * a way across such as Presets' Optimize.
 */

const base = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
const account = { ...base, deck_list: [{ deck_type: 24, deck_seq: 101, unit_id_list: [11, 0, 0, 0, 0], equip: null }] };

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

const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
const rail = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name });

test('Back returns to the page the user came from, and Forward goes on again', async ({ page }) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'history-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('history-account.json').first()).toBeVisible();

  await rail(page, 'Presets').click();
  await expect(heading(page, 'Presets')).toBeVisible();
  await page.getByLabel('Content', { exact: true }).selectOption('Cairos');
  await page.getByLabel('Preset', { exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: /^Optimize runes for / }).click();
  await expect(heading(page, 'Rune Optimization')).toBeVisible();

  /* Back from the way across lands on Presets, as it was left. */
  await page.goBack();
  await expect(heading(page, 'Presets')).toBeVisible();
  await expect(page.getByLabel('Preset', { exact: true }).locator('.preset-team-name')).toHaveText("Giant's Keep 1");
  /* Back again to where the rail was first used, and still inside JASWA. */
  await page.goBack();
  await expect(heading(page, 'Presets')).toHaveCount(0);
  await expect(page.getByText('history-account.json').first()).toBeVisible();

  await page.goForward();
  await expect(heading(page, 'Presets')).toBeVisible();
  await page.goForward();
  await expect(heading(page, 'Rune Optimization')).toBeVisible();

  /* An overlay opened over a page closes when Back leaves that page. */
  await rail(page, 'Presets').click();
  await expect(heading(page, 'Presets')).toBeVisible();
  await page.locator('.monster-priority-entry .monster-link').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(heading(page, 'Rune Optimization')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
