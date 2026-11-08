import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The synthetic account is the one carrying artifacts, so it is the one that
   reaches the three panels whose conclusion is a calculate button. */
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

/**
 * Rule 2 for every control whose wording changes: measure its box in each
 * wording it can show, and require one answer.
 *
 * This drives the state rather than racing it. Waiting for a real calculation
 * to be caught mid-flight would pass on a fast machine whatever the markup
 * said, because the working state can come and go inside one frame — and the
 * bug this holds off was exactly a flicker that short. Flipping which face is
 * showing asks the question directly: is the box the same in both states?
 */
test('a control that changes its wording keeps one box', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const swaps = page.locator('.label-swap');
  await expect(swaps.first()).toBeAttached();

  const drift = await swaps.evaluateAll((hosts) => hosts.flatMap((swap) => {
    const control = swap.closest('button') ?? swap;
    const faces = [...swap.querySelectorAll<HTMLElement>('.label-swap-face')];
    const shown = faces.find((face) => face.dataset.showing === 'true');
    const measure = (showing: HTMLElement) => {
      for (const face of faces) face.dataset.showing = face === showing ? 'true' : 'false';
      const box = control.getBoundingClientRect();
      return `${Math.round(box.width)}x${Math.round(box.height)}`;
    };
    const sizes = faces.map((face) => `${face.textContent?.trim()}: ${measure(face)}`);
    for (const face of faces) face.dataset.showing = face === shown ? 'true' : 'false';
    const boxes = new Set(sizes.map((entry) => entry.split(': ')[1]));
    return boxes.size > 1 ? [`${control.textContent?.trim()} — ${sizes.join(', ')}`] : [];
  }));

  expect(drift, 'these controls resize when their wording changes').toEqual([]);
});

/**
 * The mechanism above is only worth testing where it is actually used, so this
 * holds its adoption: a button that reports its own work says so by carrying
 * every wording, never by rendering one wording at a time. Two of these three
 * once did render one at a time, and shrank under the click that started the
 * work. Calculate also carries the cancel it offers under the pointer while busy.
 */
test('every calculate button carries its working and cancel wordings at rest', async ({ page }) => {
  await importAccount(page, artifactAccount);
  await openArtifactOptimization(page);

  const buttons = page.locator('.calculation-actions .calculate-button');
  await expect(buttons).toHaveCount(3);
  const sizes: string[] = [];
  for (const button of await buttons.all()) {
    await expect(button).toHaveAccessibleName('Calculate');
    await expect(button.locator('.label-swap-face[data-showing="false"]')).toHaveText(['Calculating…', 'Cancel calculation']);
    /* The computed size rather than the measured box: the workspace scales
       itself to the window, so a box read at one viewport is that size times
       whatever zoom the canvas is under. The style is the decision; the box is
       the decision multiplied by the window. */
    sizes.push(await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${Math.round(parseFloat(style.width))}x${Math.round(parseFloat(style.height))}`;
    }));
  }

  /* One action, one weight and one box: each of the three panels ends in the
     same calculation column, so none of them is the quiet one. */
  expect(new Set(sizes).size).toBe(1);
  expect(sizes[0]).toMatch(/x44$/);
});
