import { defineConfig, devices } from '@playwright/test'
import { loadFta47rEnv, vitePublicEnv } from './e2e/family/load47rEnv'

const localEnv = loadFta47rEnv()
const port = 5176

export default defineConfig({
  testDir: './e2e/family',
  testMatch: /47r-maps\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx vite --mode 47r.e2e --port ${port} --strictPort --host 127.0.0.1`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => (
          key !== 'SERVICE_ROLE_KEY'
          && key !== 'DB_URL'
          && key !== 'POSTGRES_PASSWORD'
          && key !== 'JWT_SECRET'
          && !/SERVICE_ROLE|JWT_SECRET|DATABASE_URL/i.test(key)
        )),
      ),
      ...vitePublicEnv(localEnv),
    },
  },
})
