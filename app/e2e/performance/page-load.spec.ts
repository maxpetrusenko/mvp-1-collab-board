import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects } from '../helpers/firestore'
import { capturePerformanceMetrics, measureBoardLoadTime, measureTimeToFirstSticky, seedBoardObjects } from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const LOGIN_SLA = { target: 1_500, warning: 2_000, critical: 3_000 }
const EMPTY_BOARD_SLA = { target: 2_000, warning: 3_000, critical: 5_000 }
const FIRST_STICKY_SLA = { target: 500, warning: 750, critical: 2_500 }
const SEEDED_BOARD_SLA = { target: 4_000, warning: 6_000, critical: 10_000 }

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${Math.round(value)}ms (target ${bounds.target}ms, warning ${bounds.warning}ms, critical ${bounds.critical}ms)`,
  })
}

test.describe('Performance: Page load', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('login page loads within critical SLA', async ({ page }, testInfo) => {
    const startedAt = Date.now()
    await page.goto(`${APP_URL}/login`)
    await expect(page.getByTestId('google-signin-button')).toBeVisible()
    const elapsedMs = Date.now() - startedAt

    console.log(`[PERF] Login page load: ${elapsedMs}ms`)
    annotateSla(testInfo, 'login-page-load', elapsedMs, LOGIN_SLA)
    expect(elapsedMs).toBeLessThanOrEqual(LOGIN_SLA.critical)
  })

  test('empty board loads within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-empty-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    const measurement = await measureBoardLoadTime(page, `${APP_URL}/b/${boardId}`)

    console.log(`[PERF] Empty board load: ${measurement.totalMs}ms`)
    console.log(`[PERF] DCL: ${measurement.metrics.domContentLoadedMs?.toFixed(0) ?? 'N/A'}ms`)
    console.log(`[PERF] FCP: ${measurement.metrics.firstContentfulPaintMs?.toFixed(0) ?? 'N/A'}ms`)

    annotateSla(testInfo, 'board-load-empty', measurement.totalMs, EMPTY_BOARD_SLA)
    expect(measurement.totalMs).toBeLessThanOrEqual(EMPTY_BOARD_SLA.critical)
  })

  test('time to first sticky render within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-sticky-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Warm one create/delete cycle so the measured run excludes one-time init overhead.
    await page.locator('button[title="Add sticky note (S)"]').click()
    await page.locator('button[aria-label="Delete selected object"]').click()
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.length
      })
      .toBe(0)

    const result = await measureTimeToFirstSticky(page, boardId, user.idToken)

    console.log(`[PERF] Time to first sticky: ${result.elapsedMs}ms (sticky count: ${result.stickyCount})`)

    annotateSla(testInfo, 'time-to-first-sticky', result.elapsedMs, FIRST_STICKY_SLA)
    expect(result.elapsedMs).toBeLessThanOrEqual(FIRST_STICKY_SLA.critical)
    expect(result.stickyCount).toBeGreaterThan(0)
  })

  test('board with 50 objects loads within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-board50-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    const preSeededObjects = await fetchBoardObjects(boardId, user.idToken)
    const missingCount = Math.max(0, 50 - preSeededObjects.length)
    if (missingCount > 0) {
      await seedBoardObjects(boardId, user.idToken, missingCount, { kind: 'mixed' })
    }

    const measurement = await measureBoardLoadTime(page, `${APP_URL}/b/${boardId}`)
    const loadedObjects = await fetchBoardObjects(boardId, user.idToken)

    console.log(`[PERF] Board with 50 objects load: ${measurement.totalMs}ms`)
    console.log(`[PERF] Loaded object count: ${loadedObjects.length}`)

    annotateSla(testInfo, 'board-load-50-objects', measurement.totalMs, SEEDED_BOARD_SLA)
    expect(loadedObjects.length).toBeGreaterThanOrEqual(50)
    expect(measurement.totalMs).toBeLessThanOrEqual(SEEDED_BOARD_SLA.critical)
  })

  test('navigation metrics are captured and logged', async ({ page }) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-metrics-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const metrics = await capturePerformanceMetrics(page)

    console.log('[PERF] Navigation Metrics:')
    console.log(`  - DOM Content Loaded: ${metrics.domContentLoadedMs?.toFixed(0) ?? 'N/A'}ms`)
    console.log(`  - Load Event: ${metrics.loadEventMs?.toFixed(0) ?? 'N/A'}ms`)
    console.log(`  - First Paint: ${metrics.firstPaintMs?.toFixed(0) ?? 'N/A'}ms`)
    console.log(`  - First Contentful Paint: ${metrics.firstContentfulPaintMs?.toFixed(0) ?? 'N/A'}ms`)
    console.log(`  - Response Start: ${metrics.responseStartMs?.toFixed(0) ?? 'N/A'}ms`)

    expect(metrics.domContentLoadedMs).not.toBeNull()
    expect(metrics.responseStartMs).not.toBeNull()
  })
})
