import { expect, test } from './test-fixtures';

/* The canvas' own width, so it is drawn at full size and its 1080px floor is
   really 1080px — a narrower window scales the whole composition down, and with
   it the distance there is to scroll. The window is then made short enough that
   the canvas alone overflows it on any page, so the control's contract can be
   exercised without an account large enough to fill a library: the threshold is
   three quarters of a window, 315px here, against 660px of scroll. */
test.use({ viewport: { width: 1920, height: 420 } });

const button = '.scroll-to-top';

async function openWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

/** Whether the control can take focus, which is the question a keyboard asks. */
const reachable = (page: import('@playwright/test').Page) => page.evaluate((selector) => {
  const control = document.querySelector<HTMLButtonElement>(selector);
  control?.focus();
  return document.activeElement === control;
}, button);

test('the way back to the top appears only once the top is out of reach', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.getByRole('button', { name: 'Back to top' })).toBeHidden();
  /* Hidden, not absent: it keeps its place in the document so nothing has to be
     measured back into the page when it returns — and while hidden it must stay
     out of the tab order. */
  await expect(page.locator(button)).toHaveCount(1);
  expect(await reachable(page)).toBe(false);

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(page.getByRole('button', { name: 'Back to top' })).toBeVisible();
  expect(await reachable(page)).toBe(true);
});

test('it returns the page to the top and stands down again', async ({ page }) => {
  await openWorkspace(page);
  await page.evaluate(() => window.scrollTo(0, 600));

  const control = page.getByRole('button', { name: 'Back to top' });
  await expect(control).toBeVisible();
  await control.click();

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(control).toBeHidden();
});

test('it is measured against the window, not against the canvas', async ({ page }) => {
  await openWorkspace(page);
  const circle = page.locator(button);
  /* Hidden still has a box, so the size can be read without scrolling first. */
  const sizeAt = async (width: number) => {
    await page.setViewportSize({ width, height: 420 });
    return circle.evaluate((el) => el.getBoundingClientRect().width);
  };

  /* The canvas' own scale stops growing at 1920px. A control stated in canvas
     units therefore reached full size on a laptop and stayed there, giving an
     ultrawide display and a laptop the same circle — which is what this range
     exists to catch. */
  const ultrawide = await sizeAt(3440);
  const laptop = await sizeAt(1920);
  const narrow = await sizeAt(1280);
  expect(ultrawide).toBeGreaterThan(laptop);
  expect(laptop).toBeGreaterThan(narrow);
  /* And it stops at the stated ceiling rather than running away with the width. */
  expect(ultrawide).toBeLessThanOrEqual(76);
});

test('it is chrome: hovering it moves nothing on the page', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monster Stats', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));

  const control = page.getByRole('button', { name: 'Back to top' });
  await expect(control).toBeVisible();
  const rail = page.locator('.rail');
  const chevron = control.locator('svg');
  const before = {
    control: await control.boundingBox(),
    chevron: await chevron.boundingBox(),
    rail: await rail.boundingBox(),
  };

  await control.hover();
  /* The hover is colour, ring and shadow, and nothing else: the control sits
     in the corner of every reading, so neither it nor the mark inside it may
     twitch as the pointer crosses. Its box is exactly where it was. */
  expect(await control.boundingBox()).toEqual(before.control);
  expect(await chevron.boundingBox()).toEqual(before.chevron);
  expect(await rail.boundingBox()).toEqual(before.rail);
});
