import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || `test-results/run-${process.pid}`
const reportDir = process.env.PLAYWRIGHT_REPORT_DIR || `playwright-report/run-${process.pid}`
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || 'chromium'
const requestedWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '', 10)
const resolvedWorkers = Number.isFinite(requestedWorkers) && requestedWorkers > 0
  ? requestedWorkers
  : (process.env.CI ? 2 : 2)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Keep per-file serial ordering; parallelize at file level with workers.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: resolvedWorkers,
  outputDir,
  reporter: [['html', { outputFolder: reportDir, open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: browserChannel },
    },
  ],
})
