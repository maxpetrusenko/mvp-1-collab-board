import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects, newestObjectByType } from '../helpers/firestore'
import { measureBoardLoadTime, measureDragFrameRate, seedBoardObjects } from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const LARGE_BOARD_LOAD_SLA = { target: 8_000, warning: 11_000, critical: 15_000 }
const LARGE_BOARD_DRAG_FPS_SLA = { target: 35, warning: 28, critical: 20 }

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

test.describe('Performance: Large board stress', () => {
  test.setTimeout(240_000)

  test('100-object board loads within critical SLA and keeps drag FPS above critical threshold', async ({
    page,
  }, testInfo) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-perf-large-board-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await seedBoardObjects(boardId, user.idToken, 100, { kind: 'mixed', columns: 10 })

      const loadMeasurement = await measureBoardLoadTime(page, `${APP_URL}/b/${boardId}`)
      const objects = await fetchBoardObjects(boardId, user.idToken)
      const draggableObject = newestObjectByType(objects, 'stickyNote') || newestObjectByType(objects, 'shape')
      if (!draggableObject) {
        throw new Error('No draggable object found on large board')
      }

      const dragFps = await measureDragFrameRate(page, draggableObject, {
        durationMs: 1_400,
        deltaX: 320,
        deltaY: 180,
      })

      console.log(`[PERF] Large board (100 objects) load: ${loadMeasurement.totalMs}ms`)
      console.log(`[PERF] Large board drag FPS: ${dragFps.toFixed(1)} FPS`)

      annotateSla(testInfo, 'large-board-load-100-objects', loadMeasurement.totalMs, LARGE_BOARD_LOAD_SLA, 'ms')
      annotateSla(testInfo, 'large-board-drag-fps', dragFps, LARGE_BOARD_DRAG_FPS_SLA, 'fps')

      expect(objects.length).toBeGreaterThanOrEqual(100)
      expect(loadMeasurement.totalMs).toBeLessThanOrEqual(LARGE_BOARD_LOAD_SLA.critical)
      expect(dragFps).toBeGreaterThanOrEqual(LARGE_BOARD_DRAG_FPS_SLA.critical)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
