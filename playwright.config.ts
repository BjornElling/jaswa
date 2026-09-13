import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  preserveOutput: 'always',
  /* Every workspace but Home is a dynamic import, and the suite runs eight
     browsers against one Vite dev server that transforms a module the first
     time it is asked for. Clicking into a workspace nobody has opened yet can
     therefore sit on `Opening workspace…` for longer than the 5 s default, and
     the twenty-odd places that navigate by rail button and then assert a
     heading would each have to wait for that fallback to clear. Waiting longer
     here is the one change that covers all of them, and it costs nothing on a
     passing run — the assertions resolve as soon as the page arrives. */
  expect: { timeout: 15_000 },
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
