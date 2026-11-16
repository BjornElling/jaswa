import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

/* Playwright hides scrollbars by default, and the page keeps a permanent one.
   With it hidden, a toast measured against the window rather than the root
   stacked exactly here and stood one scrollbar to the left on every real
   screen. Shown, the test sees what the user sees. */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('confirms a JSON import in the viewport without moving the page', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  await page.locator('.drop-zone').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('2 monsters · 0 runes · 4 artifacts');
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const confirmationBox = await confirmation.boundingBox();
  expect(confirmationBox).not.toBeNull();
  /* Scrolled this far down the account badge is off the top of the window, so
     the corner the two share is the toast's alone and it opens at the inset. */
  expect(confirmationBox?.y).toBeLessThan(viewport.height * .1);
  expect((confirmationBox?.x ?? 0) + (confirmationBox?.width ?? 0)).toBeGreaterThan(viewport.width - 64);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-visible.png') });

  const scrollWhileConfirmed = await page.evaluate(() => window.scrollY);

  await expect(confirmation).toBeHidden({ timeout: 5_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollWhileConfirmed);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-dismissed.png') });
});

/* The account badge and the confirmation want the same corner, and the badge
   scrolls with the page while the toast is pinned to the window. So the toast's
   place is measured from whatever of the badge is on screen, not from a
   reserved height — and both cards hang from one right edge. */
test('the confirmation clears the account badge they share a corner with', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  // Both cards must be measured in the same font and the same layout pass.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);

  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  const badge = page.locator('.import-badge');
  await expect(confirmation).toBeVisible();
  await expect(badge).toBeVisible();

  const settle = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await page.evaluate(() => window.scrollTo(0, 0));
  await settle();
  expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
  const measure = () => page.evaluate(() => ({
    badge: document.querySelector('.import-badge')!.getBoundingClientRect().toJSON(),
    confirmation: document.querySelector('.import-confirmation')!.getBoundingClientRect().toJSON(),
  }));
  const { badge: topBadge, confirmation: stacked } = await measure();
  expect(topBadge).not.toBeNull();
  expect(stacked).not.toBeNull();
  /* Under the badge, not over it, and the same box: both edges, the width and
     the height. The badge keeps the workspace's gutter rather than the
     window's, so an inset of the toast's own stood it further out than the card
     above; matching only the right edge then left the wider toast hanging out
     to the left. Two cards in one corner either stack exactly or look broken.
     Half a pixel of tolerance is the canvas scale's rounding, not an offset. */
  expect(stacked!.y).toBeGreaterThan(topBadge!.y + topBadge!.height);
  expect(Math.abs(stacked!.x - topBadge!.x)).toBeLessThan(0.25);
  expect(Math.abs((stacked!.x + stacked!.width) - (topBadge!.x + topBadge!.width))).toBeLessThan(0.25);
  expect(Math.abs(stacked!.width - topBadge!.width)).toBeLessThan(0.25);
  expect(stacked!.height).toBeCloseTo(topBadge!.height, 0);
  /* And it holds its own words inside that box rather than spilling past it. */
  expect(await confirmation.evaluate((card) => card.scrollWidth - card.clientWidth)).toBeLessThanOrEqual(0);
  expect(await confirmation.evaluate((card) => card.scrollHeight - card.clientHeight)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-under-badge.png') });

  /* Half the badge scrolled away is half the clearance: the gap between the two
     is the same whatever is left of the card above. */
  await page.evaluate(() => window.scrollBy(0, 20));
  await settle();
  const { badge: halfBadge, confirmation: halfStacked } = await measure();
  expect(halfStacked!.y - (halfBadge!.y + halfBadge!.height))
    .toBeCloseTo(stacked!.y - (topBadge!.y + topBadge!.height), 0);

  /* Scrolled past it entirely, the corner is free and the toast takes it. */
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle();
  const alone = await confirmation.boundingBox();
  expect(alone!.y).toBeLessThan(stacked!.y);
  expect(alone!.y).toBeCloseTo(topBadge!.y, 0);
});
