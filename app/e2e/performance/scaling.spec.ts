import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects, newestObjectByType } from '../helpers/firestore'
import { measureBoardLoadTime, measureDragFrameRate, seedBoardObjects } from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const LOAD_SLA_500 = { target: 10_000, warning: 14_000, critical: 20_000 }
const LOAD_SLA_1000 = { target: 14_000, warning: 20_000, critical: 28_000 }
const DRAG_FPS_SLA_500 = { target: 32, warning: 24, critical: 18 }

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

test.describe('Performance: board scaling', () => {
  test.setTimeout(300_000)

  test('T-090: 500-object board loads and drags above critical thresholds', async ({ page }, testInfo) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-perf-scale-500-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await seedBoardObjects(boardId, user.idToken, 500, {
        kind: 'mixed',
        columns: 22,
      })

      const loadMeasurement = await measureBoardLoadTime(page, `${APP_URL}/b/${boardId}`)
      const objects = await fetchBoardObjects(boardId, user.idToken)
      const draggableObject = newestObjectByType(objects, 'stickyNote') || newestObjectByType(objects, 'shape')
      if (!draggableObject) {
        throw new Error('No draggable object found in 500-object board')
      }

      const dragFps = await measureDragFrameRate(page, draggableObject, {
        durationMs: 1_400,
        deltaX: 280,
        deltaY: 150,
      })

      annotateSla(testInfo, 'board-load-500', loadMeasurement.totalMs, LOAD_SLA_500, 'ms')
      annotateSla(testInfo, 'board-drag-fps-500', dragFps, DRAG_FPS_SLA_500, 'fps')

      expect(objects.length).toBeGreaterThanOrEqual(500)
      expect(loadMeasurement.totalMs).toBeLessThanOrEqual(LOAD_SLA_500.critical)
      expect(dragFps).toBeGreaterThanOrEqual(DRAG_FPS_SLA_500.critical)
    } finally {
      await cleanupTestUser(user)
    }
  })

  test('T-090: 1000-object board loads within critical threshold', async ({ page }, testInfo) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-perf-scale-1000-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await seedBoardObjects(boardId, user.idToken, 1000, {
        kind: 'sticky',
        columns: 28,
      })

      const loadMeasurement = await measureBoardLoadTime(page, `${APP_URL}/b/${boardId}`)
      const objects = await fetchBoardObjects(boardId, user.idToken)

      annotateSla(testInfo, 'board-load-1000', loadMeasurement.totalMs, LOAD_SLA_1000, 'ms')

      expect(objects.length).toBeGreaterThanOrEqual(1000)
      expect(loadMeasurement.totalMs).toBeLessThanOrEqual(LOAD_SLA_1000.critical)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
