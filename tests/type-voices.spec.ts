import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

async function importAccount(page: Page, file: string) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText(basename(file))).toBeVisible();
}

async function openArtifactOptimization(page: Page) {
  await page.getByRole('button', { name: 'Artifact Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Artifact Optimization' })).toBeVisible();
  for (const section of ['Recommendations', 'Best monster for this artifact', 'Best artifact for this monster']) {
    await page.locator('summary').filter({ hasText: section }).click();
  }
}

/** What a run of text is set in, as one comparable string. */
const voiceOf = `(el) => {
  const style = getComputedStyle(el);
  const family = style.fontFamily.includes('JetBrains') ? 'mono'
    : style.fontFamily.includes('Plex') ? 'sans' : style.fontFamily.split(',')[0];
  return [family, style.fontSize, style.fontWeight, style.letterSpacing, style.textTransform].join(' ');
}`;

/**
 * The complaint this holds: three buttons stacked in one column of one filter
 * panel — Calculate, Clear results, Reset filters — were set in three
 * different voices, two families and three size-and-weight pairs between them.
 *
 * They are all the same kind of thing: a control naming an action. A button's
 * `size` changes its box, never its type, so every one of them reads as one
 * family of control and the panel stops looking like three unrelated widgets.
 */
test('every control that names an action speaks in one voice', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const controls = page.locator('.button, .filter-reset, .text-link');
  await expect(controls.first()).toBeVisible();

  const voices = await controls.evaluateAll((els, read) =>
    [...new Set(els.map((el) => (eval(read) as (e: Element) => string)(el)))], voiceOf);

  expect(voices, 'action controls disagree about how they are set').toHaveLength(1);
  expect(voices[0]).toBe('sans 13px 600 normal none');
});

/**
 * A filter chip is a button too, and it deliberately does *not* join the voice
 * above: it names a value out of the game's own vocabulary — "Water", "LEG",
 * "Equipped" — rather than an action, and values are monospaced here
 * (AGENTS.md §5). That distinction is the whole reason the panel can hold two
 * voices without looking careless, so it is worth a test of its own: one voice
 * for the chips, and a different one from the actions beside them.
 */
test('a control that names a value speaks in the data voice', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const chips = page.locator('.filter-button');
  await expect(chips.first()).toBeVisible();

  const voices = await chips.evaluateAll((els, read) =>
    [...new Set(els.map((el) => (eval(read) as (e: Element) => string)(el)))], voiceOf);

  expect(voices, 'filter chips disagree about how they are set').toHaveLength(1);
  expect(voices[0]).toBe('mono 12px 400 normal none');
});

/**
 * Tracking was where the drift showed worst: one role — the small uppercase
 * caption over a group, a column or a card — was set at four different
 * trackings and two sizes depending on which component had written it. It is
 * one voice, so it gets one measurement.
 */
test('the uppercase label is one voice wherever it appears', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const labels = page.locator('.filter-label, .eyebrow, .rail-heading, th .sort-button-label');
  await expect(labels.first()).toBeVisible();

  const voices = await labels.evaluateAll((els, read) =>
    [...new Set(els.map((el) => (eval(read) as (e: Element) => string)(el)))], voiceOf);

  expect(voices, 'labels disagree about how they are set').toHaveLength(1);
  expect(voices[0]).toBe('sans 11px 700 0.88px uppercase');
});
