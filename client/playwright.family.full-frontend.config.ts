import { defineConfig } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(),'Library/Caches/ms-playwright')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cache) ? readdirSync(cache).filter(name=>name.startsWith('chromium_headless_shell-')).sort().reverse().map(name=>join(cache,name,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(path=>existsSync(path)) : undefined)
export default defineConfig({
  testDir:'./e2e/family',testMatch:/fullFrontend.*\.spec\.ts/,outputDir:'./test-results/family-full-frontend',timeout:60000,workers:1,
  use:{baseURL:'http://127.0.0.1:5791',viewport:{width:1440,height:1000},serviceWorkers:'block',launchOptions:executablePath?{executablePath}:{},screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}}],
  webServer:{command:'node ../node_modules/vite/bin/vite.js --config vite.family-full.config.ts --mode family-full.e2e',cwd:root,url:'http://127.0.0.1:5791',reuseExistingServer:false,timeout:45000},
})
