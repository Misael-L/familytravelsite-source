import { defineConfig, devices } from '@playwright/test'

const port = 5178
const FAKE_ANON = 'family-days-e2e-public-anon'

function isolatedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue
    if (key === 'SERVICE_ROLE_KEY' || key === 'DB_URL' || key === 'DATABASE_URL' || key === 'JWT_SECRET' || key === 'POSTGRES_PASSWORD') continue
    if (/SERVICE_ROLE|JWT_SECRET|DATABASE_URL/i.test(key)) continue
    env[key] = value
  }
  env.VITE_DATA_PLANE = 'supabase'
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:5199'
  env.VITE_SUPABASE_ANON_KEY = FAKE_ANON
  env.VITE_MAPBOX_ACCESS_TOKEN = 'pk.family-public-fixture'
  return env
}

export default defineConfig({
  testDir: './e2e/family',
  testMatch: /days-presentation\.spec\.ts/,
  outputDir: './test-results/family-days',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'phone-light', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
    { name: 'phone-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'tablet-light', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, colorScheme: 'light' } },
    { name: 'tablet-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, colorScheme: 'dark' } },
    { name: 'desktop-light', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
  ],
  webServer: {
    command: `npx vite --mode family-days.e2e --port ${port} --strictPort --host 127.0.0.1`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: isolatedEnv(),
  },
})
