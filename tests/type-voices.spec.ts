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
  const family = style.fontFamily.includes('Plex') ? 'sans' : style.fontFamily.split(',')[0];
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
 * A filter chip is a button too, but it names a value rather than an action.
 * It keeps the same body family and measure as the action controls; only the
 * box tone and pressed state distinguish it. This is the guard against the
 * old data/prose split returning through a new filter component.
 */
test('a control that names a value speaks in the body voice', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const chips = page.locator('.filter-button');
  await expect(chips.first()).toBeVisible();

  const voices = await chips.evaluateAll((els, read) =>
    [...new Set(els.map((el) => (eval(read) as (e: Element) => string)(el)))], voiceOf);

  expect(voices, 'filter chips disagree about how they are set').toHaveLength(1);
  expect(voices[0]).toBe('sans 13px 400 normal none');
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

/**
 * The page may use different sizes and weights for headings, labels and body
 * text, but it must not reintroduce a second visible font family for ordinary
 * content. This samples the rendered page rather than trusting selector names:
 * a local declaration that escapes the fixed roles is exactly what this holds.
 */
test('visible copy uses one font family', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const families = await page.locator('body *').evaluateAll((elements) => [...new Set(
    elements
      .filter((element) => element.textContent?.trim() && !['SCRIPT', 'STYLE'].includes(element.tagName))
      .map((element) => getComputedStyle(element).fontFamily),
  )]);

  expect(families, 'ordinary visible copy has drifted into another font family').toEqual([
    '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  ]);
});

test('every calculation uses the same right-aligned status report', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const recommendations = page.locator('.artifact-recommendations');
  await recommendations.getByRole('button', { name: 'Calculate recommendations' }).click();
  await expect(recommendations.locator('.calculation-status')).toBeVisible();

  const bestMonster = page.locator('.best-monster-for-artifact');
  await page.getByRole('combobox', { name: 'Choose an artifact for monster recommendations' }).selectOption({ index: 1 });
  await bestMonster.getByRole('button', { name: 'Calculate monsters' }).click();
  await expect(bestMonster.locator('.calculation-status')).toBeVisible();

  const bestArtifact = page.locator('.best-artifact-for-monster');
  await page.getByRole('combobox', { name: 'Choose a monster for artifact recommendations' }).selectOption({ index: 1 });
  await bestArtifact.getByRole('button', { name: 'Calculate artifacts' }).click();
  await expect(bestArtifact.locator('.calculation-status')).toBeVisible();

  const statuses = page.locator('.calculation-status');
  await expect(statuses).toHaveCount(3);
  const reports = await statuses.evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent?.trim() ?? '',
    textAlign: getComputedStyle(element).textAlign,
  })));
  expect(reports.every(({ text }) => /pairs checked · .* ms · (Graphics card|Processor)$/.test(text)))
    .toBe(true);
  expect(reports.every(({ textAlign }) => textAlign === 'right')).toBe(true);
});

test('artifact entries name an empty improvements result', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const panel = page.locator('.best-artifact-for-monster');
  await page.getByRole('combobox', { name: 'Choose a monster for artifact recommendations' }).selectOption({ index: 1 });
  await panel.getByRole('button', { name: 'Calculate artifacts' }).click();
  const entries = panel.locator('.best-artifact-entry');
  await expect(entries.first()).toBeVisible();

  const improvements = await entries.evaluateAll((elements) => elements.map((element) => {
    const block = element.querySelector('.best-artifact-improvements');
    return {
      hasHeading: block?.querySelector('.best-artifact-improvements-title')?.textContent === 'Improvements',
      hasConversions: Boolean(block?.querySelector('.artifact-conversion-list')),
      text: block?.textContent?.trim() ?? '',
    };
  }));
  expect(improvements.every(({ hasHeading }) => hasHeading)).toBe(true);
  expect(improvements.filter(({ hasConversions }) => !hasConversions).every(({ text }) => text.includes('None')))
    .toBe(true);
});

test('artifact recommendation columns share their intended baselines', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  await page.locator('summary').filter({ hasText: 'Settings' }).click();
  await page.locator('input[name="artifact-conversion-stone-mode"][value="theoretical"]').check();

  const panel = page.locator('.best-artifact-for-monster');
  await page.getByRole('combobox', { name: 'Choose a monster for artifact recommendations' }).selectOption({ index: 1 });
  await panel.getByRole('button', { name: 'Calculate artifacts' }).click();
  const entry = panel.locator('.best-artifact-entry').first();
  await expect(entry.locator('.artifact-conversion-list')).toBeVisible();

  const alignment = await entry.evaluate((element) => {
    const box = (selector: string) => element.querySelector(selector)?.getBoundingClientRect();
    const name = box(':scope > .best-artifact-entry-name');
    const mainStat = box('.best-artifact-entry-facts .best-artifact-fact');
    const substats = box(':scope > .artifact-subs');
    const improvementsTitle = box('.best-artifact-improvements-title');
    const conversions = box('.artifact-conversion-list');
    const score = box('.best-artifact-entry-facts .best-artifact-fact-score');
    const convertedScore = box('.best-artifact-improvements .best-artifact-fact-score');
    const substatText = element.querySelector('.artifact-subs li');
    const conversionColors = [...element.querySelectorAll('.artifact-conversion-option-name, .artifact-conversion-option-name *')]
      .map((part) => getComputedStyle(part).color);
    const improvementsTitleElement = element.querySelector('.best-artifact-improvements-title');
    return {
      nameTop: name?.top,
      improvementsTitleTop: improvementsTitle?.top,
      mainStatTop: mainStat?.top,
      substatsTop: substats?.top,
      conversionsBottom: conversions?.bottom,
      scoreBottom: score?.bottom,
      convertedScoreBottom: convertedScore?.bottom,
      conversionColors,
      substatColor: substatText ? getComputedStyle(substatText).color : undefined,
      improvementsTitleColor: improvementsTitleElement ? getComputedStyle(improvementsTitleElement).color : undefined,
      standardTextColor: getComputedStyle(element.querySelector(':scope > .best-artifact-entry-name') ?? element).color,
    };
  });

  expect(Math.abs((alignment.improvementsTitleTop ?? 0) - (alignment.nameTop ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((alignment.substatsTop ?? 0) - (alignment.mainStatTop ?? 0))).toBeLessThanOrEqual(1);
  expect((alignment.conversionsBottom ?? 0)).toBeLessThanOrEqual((alignment.convertedScoreBottom ?? 0));
  expect(Math.abs((alignment.convertedScoreBottom ?? 0) - (alignment.scoreBottom ?? 0))).toBeLessThanOrEqual(1);
  expect(alignment.conversionColors.every((color) => color === alignment.substatColor)).toBe(true);
  expect(alignment.improvementsTitleColor).toBe(alignment.standardTextColor);
});
