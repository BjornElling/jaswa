import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* Web Locks are scoped to a browser context, and every test gets its own, so
     the writer lock never crosses tests; the two-tab contract opens its second
     tab in the same context on purpose. */
  fullyParallel: true,
  preserveOutput: 'always',
  /* Keep two browser contexts in flight so their local worker pools can share
     the processor while the suite drives real calculations. */
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
