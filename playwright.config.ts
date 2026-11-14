import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* The application deliberately holds one Web Lock per origin for the life of
     a tab. Parallel browser workers would therefore make unrelated tests
     readers of one another and turn a test-order detail into a fake product
     failure. Multi-tab behaviour is covered explicitly in one test context. */
  fullyParallel: false,
  preserveOutput: 'always',
  workers: 1,
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
