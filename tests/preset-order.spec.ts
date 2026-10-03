import { expect, test } from '@playwright/test';

async function openPresets(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Rune Set-up' }).click();
  await page.locator('summary').filter({ hasText: 'Presets' }).click();
}

test('preset arrows move one card at a time and stay in their fixed positions', async ({ page }) => {
  await openPresets(page);

  const cards = page.locator('.preset-card');
  const names = cards.locator('.preset-name');
  const initial = await names.allTextContents();
  expect(initial.length).toBeGreaterThan(1);

  const firstEarlier = page.getByRole('button', { name: `Move ${initial[0]} earlier` });
  const lastLater = page.getByRole('button', { name: `Move ${initial.at(-1)} later` });
  await expect(firstEarlier).toBeDisabled();
  await expect(lastLater).toBeDisabled();
  await expect(firstEarlier).toBeVisible();
  await expect(lastLater).toBeVisible();

  await page.getByRole('button', { name: `Move ${initial[0]} later` }).click();
  await expect(names).toHaveText([initial[1], initial[0], ...initial.slice(2)]);
  await expect(page.getByRole('button', { name: `Move ${initial[0]} earlier` })).toBeEnabled();

  await page.getByRole('button', { name: `Move ${initial[0]} earlier` }).click();
  await expect(names).toHaveText(initial);
});

test('a preset card is dragged into place, and the drop is saved', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  await openPresets(page);

  const cards = page.locator('.preset-card');
  const names = cards.locator('.preset-name');
  const initial = await names.allTextContents();
  expect(initial.length).toBeGreaterThan(1);

  /* Taken by its heading and carried until its middle is over the next card's. */
  const head = (await cards.nth(0).locator('.preset-name').boundingBox())!;
  const from = (await cards.nth(0).boundingBox())!;
  const to = (await cards.nth(1).boundingBox())!;
  const x = head.x + head.width / 2;
  const startY = head.y + head.height / 2;
  const endY = startY + (to.y + to.height / 2) - (from.y + from.height / 2);
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(x, startY + (endY - startY) * step / 12);
  await expect(page.locator('.preset-card[data-dragging]')).toHaveCount(1);
  /* The card passed over slides up into the first place before anything is dropped. */
  await expect.poll(async () => Math.round((await cards.nth(1).boundingBox())!.y)).toBe(Math.round(from.y));
  await page.screenshot({ path: testInfo.outputPath('preset-drag-preview.png') });
  await page.mouse.move(x + 1, endY);
  await page.mouse.up();
  await expect(names).toHaveText([initial[1], initial[0], ...initial.slice(2)]);
  await expect(page.locator('.preset-card[data-dragging]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Rune Set-up' }).click();
  /* The Presets section stays open for the session, so the cards are there again. */
  await expect(names).toHaveText([initial[1], initial[0], ...initial.slice(2)]);
});
