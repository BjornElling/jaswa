import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  preserveOutput: 'always',
  /* Each isolated browser calibrates the full mixed-grade rune funnel before
     its first verdict. Two concurrent calibrations keep that CPU work realistic;
     the wait covers the cold calculation, not a different interface contract. */
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
