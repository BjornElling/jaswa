import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

export * from '@playwright/test';

/* Browser tests must never edit the user's machine-wide personalization. The
   sharing tests register their own in-memory helper after this fallback. */
export const test = base.extend<{ isolatePersonalization: void }>({
  isolatePersonalization: [async ({ context }, use) => {
    await context.route('http://127.0.0.1:37654/preferences', (route) => route.fulfill({ status: 404, json: {} }));
    await use();
  }, { auto: true }],
});

/* The graphics card is a setting on Settings; the helper goes there, makes the
   choice, and comes back Home, where every caller imports its account. */
export async function chooseGraphicsCard(page: Page, use: boolean) {
  const rail = page.getByRole('navigation');
  await rail.getByRole('button', { name: 'Settings', exact: true }).click();
  await openSettingsBar(page, 'General');
  const checkbox = page.getByRole('checkbox', { name: 'Use the graphics card for heavy calculations' });
  await checkbox.setChecked(use);
  await rail.getByRole('button', { name: 'Home', exact: true }).click();
}

/* A bar keeps its open state for the session, so it is opened only when shut. */
export async function openSettingsBar(page: Page, title: string) {
  const bar = page.locator('main details.bar').filter({ has: page.locator('summary', { hasText: title }) }).first();
  if (!await bar.evaluate((element) => (element as HTMLDetailsElement).open)) await bar.locator('summary').click();
}
