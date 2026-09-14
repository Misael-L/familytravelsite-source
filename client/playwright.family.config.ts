import { defineConfig, devices } from '@playwright/test'

/**
 * Family UUID smoke — isolated from the Nest/SQLite harness.
 *
 * Requires an approved linked member and an existing UUID trip:
 *   FAMILY_E2E_EMAIL
 *   FAMILY_E2E_PASSWORD
 *   FAMILY_E2E_TRIP_ID
 *
 * Does not start Nest. Does not write credentials. Specs skip when env is unset.
 * Intercepts `sync_trip_days` so the workspace open stays read-only.
 */
export default defineConfig({
  testDir: './e2e/family',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'family', testMatch: /\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_DATA_PLANE: 'supabase',
    },
  },
})
