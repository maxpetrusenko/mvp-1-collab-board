import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects, newestObjectByType } from '../helpers/firestore'
import {
  measureDragFrameRate,
  measureTimeToFirstSticky,
  requestBestEffortGc,
  seedBoardObjects,
} from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const FIRST_STICKY_SLA = { target: 500, warning: 750, critical: 2_500 }
const DRAG_FPS_SLA = { target: 55, warning: 45, critical: 30 }
const ZOOM_FPS_SLA = { target: 55, warning: 50, critical: 45 }

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
  unit: 'ms' | 'fps',
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${Math.round(value)}${unit} (target ${bounds.target}${unit}, warning ${bounds.warning}${unit}, critical ${bounds.critical}${unit})`,
  })
}

const measureFrameRateDuringZoom = async (page: Page) => {
  const durationMs = 900
  const stepDelay = 300
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  const zoomOut = page.getByRole('button', { name: 'Zoom out' })

  await expect(zoomIn).toBeVisible()
  await expect(zoomOut).toBeVisible()

  const fpsPromise = page.evaluate(async (measureMs) => {
    const start = performance.now()
    let frames = 0
    return new Promise<number>((resolve) => {
      const tick = (now: number) => {
        frames += 1
        const elapsed = now - start
        if (elapsed >= measureMs) {
          resolve((frames * 1000) / elapsed)
          return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, durationMs)

  await zoomIn.click()
  await page.waitForTimeout(stepDelay)
  await zoomOut.click()
  await page.waitForTimeout(stepDelay)

  return fpsPromise
}

test.describe('Performance: Rendering', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('time-to-first-sticky is within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-first-sticky-${Date.now()}`

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

    const measurement = await measureTimeToFirstSticky(page, boardId, user.idToken)
    console.log(`[PERF] Time to first sticky: ${measurement.elapsedMs}ms (sticky count: ${measurement.stickyCount})`)
    annotateSla(testInfo, 'time-to-first-sticky', measurement.elapsedMs, FIRST_STICKY_SLA, 'ms')
    expect(measurement.elapsedMs).toBeLessThanOrEqual(FIRST_STICKY_SLA.critical)
  })

  test('drag interaction keeps FPS above critical threshold', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-drag-fps-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await seedBoardObjects(boardId, user.idToken, 20, { kind: 'mixed' })
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const objects = await fetchBoardObjects(boardId, user.idToken)
    const draggableObject = newestObjectByType(objects, 'stickyNote') || newestObjectByType(objects, 'shape')
    if (!draggableObject) {
      throw new Error('No draggable object available for FPS test')
    }

    const fps = await measureDragFrameRate(page, draggableObject, {
      durationMs: 1_300,
      deltaX: 260,
      deltaY: 140,
    })

    console.log(`[PERF] Drag FPS with 20 objects: ${fps.toFixed(1)} FPS`)
    annotateSla(testInfo, 'drag-fps', fps, DRAG_FPS_SLA, 'fps')
    expect(fps).toBeGreaterThanOrEqual(DRAG_FPS_SLA.critical)
  })

  test('zoom interaction keeps FPS above critical threshold', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-zoom-fps-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await requestBestEffortGc(page)

    const fps = await measureFrameRateDuringZoom(page)
    console.log(`[PERF] Zoom FPS with 20 objects: ${fps.toFixed(1)} FPS`)
    annotateSla(testInfo, 'zoom-fps', fps, ZOOM_FPS_SLA, 'fps')
    expect(fps).toBeGreaterThanOrEqual(ZOOM_FPS_SLA.critical)
  })
})
