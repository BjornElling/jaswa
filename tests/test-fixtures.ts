import { test as base } from '@playwright/test';

export * from '@playwright/test';

/* Browser tests must never edit the user's machine-wide personalization. The
   sharing tests register their own in-memory helper after this fallback. */
export const test = base.extend<{ isolatePersonalization: void }>({
  isolatePersonalization: [async ({ context }, use) => {
    await context.route('http://127.0.0.1:37654/preferences', (route) => route.fulfill({ status: 404, json: {} }));
    await use();
  }, { auto: true }],
});
