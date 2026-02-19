import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects } from '../helpers/firestore'
import { seedBoardObjects } from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
  unit: 'fps' | 'ms' | 'objects',
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${Math.round(value)}${unit} (target ${bounds.target}${unit}, warning ${bounds.warning}${unit}, critical ${bounds.critical}${unit})`,
  })
}

/**
 * Helper to simulate object position updates via Firestore
 * This simulates multiple users dragging objects simultaneously
 */
const simulateConcurrentObjectMoves = async (
  boardId: string,
  idToken: string,
  objectIds: string[],
  durationMs: number,
  updatesPerSecond: number,
): Promise<{ updatesCompleted: number; avgUpdateLatency: number }> => {
  const { doc, getFirestore, updateDoc } = await import('firebase/firestore')
  const db = getFirestore()

  const startTime = Date.now()
  let updatesCompleted = 0
  const latencies: number[] = []

  // Create update promises for concurrent execution
  const updatePromises = objectIds.map(async (objectId, index) => {
    const objectRef = doc(db, 'boards', boardId, 'objects', objectId)
    const intervalMs = 1000 / updatesPerSecond
    let localUpdates = 0

    while (Date.now() - startTime < durationMs) {
      const updateStart = Date.now()

      // Simulate moving object in a small circle
      const angle = (localUpdates * 0.5) % (2 * Math.PI)
      const dx = Math.round(Math.cos(angle) * 20)
      const dy = Math.round(Math.sin(angle) * 20)

      try {
        await updateDoc(objectRef, {
          'position.x': dx + (index * 50), // Spread objects across x-axis
          'position.y': dy + (index * 30), // Spread objects across y-axis
          updatedAt: Date.now(),
        })

        const updateEnd = Date.now()
        latencies.push(updateEnd - updateStart)
        localUpdates++
        updatesCompleted++
      } catch {
        // Ignore write errors for stress test
      }

      // Wait before next update for this object
      await new Promise(r => setTimeout(r, intervalMs))
    }

    return localUpdates
  })

  // Execute all object updates concurrently
  await Promise.all(updatePromises)

  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0

  return { updatesCompleted, avgUpdateLatency: avgLatency }
}

test.describe('Performance: simultaneous object movement', () => {
  test.setTimeout(300_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('NFR-5: 10 objects moving simultaneously maintains system stability', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-simult-10-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)

      // Seed 10 objects
      await seedBoardObjects(boardId, user.idToken, 10, { kind: 'mixed', columns: 5 })

      const objects = await fetchBoardObjects(boardId, user.idToken)
      const objectIds = objects.slice(0, 10).map(o => o.id)

      // Navigate to board and start monitoring for crashes
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      // Simulate 10 objects moving simultaneously for 3 seconds
      const duration = 3000
      const updatesPerSecond = 5

      const { updatesCompleted, avgUpdateLatency } = await simulateConcurrentObjectMoves(
        boardId,
        user.idToken,
        objectIds,
        duration,
        updatesPerSecond,
      )

      console.log(`[PERF] Simultaneous movement (10 objects): ${updatesCompleted} updates, ${avgUpdateLatency.toFixed(1)}ms avg latency`)

      // Verify board is still responsive
      await expect(page.locator('.board-stage')).toBeVisible()

      // Verify all objects still exist
      const finalObjects = await fetchBoardObjects(boardId, user.idToken)
      expect(finalObjects.length).toBeGreaterThanOrEqual(10)

      annotateSla(testInfo, 'simult-10-updates', updatesCompleted, { target: 150, warning: 100, critical: 50 }, 'objects')
      annotateSla(testInfo, 'simult-10-avg-latency', avgUpdateLatency, { target: 200, warning: 500, critical: 1000 }, 'ms')

      // System should not crash - basic assertion
      expect(updatesCompleted).toBeGreaterThan(0)
    } finally {
      // Cleanup
    }
  })

  test('NFR-5: 50 objects moving simultaneously maintains system stability', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-simult-50-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)

      // Seed 50 objects
      await seedBoardObjects(boardId, user.idToken, 50, { kind: 'sticky', columns: 10 })

      const objects = await fetchBoardObjects(boardId, user.idToken)
      const objectIds = objects.slice(0, 50).map(o => o.id)

      // Navigate to board
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      // Simulate 50 objects moving simultaneously for 3 seconds
      const duration = 3000
      const updatesPerSecond = 3 // Lower rate for more objects

      const { updatesCompleted, avgUpdateLatency } = await simulateConcurrentObjectMoves(
        boardId,
        user.idToken,
        objectIds,
        duration,
        updatesPerSecond,
      )

      console.log(`[PERF] Simultaneous movement (50 objects): ${updatesCompleted} updates, ${avgUpdateLatency.toFixed(1)}ms avg latency`)

      // Verify board is still responsive
      await expect(page.locator('.board-stage')).toBeVisible()

      // Verify objects still exist
      const finalObjects = await fetchBoardObjects(boardId, user.idToken)
      expect(finalObjects.length).toBeGreaterThanOrEqual(50)

      annotateSla(testInfo, 'simult-50-updates', updatesCompleted, { target: 450, warning: 300, critical: 150 }, 'objects')
      annotateSla(testInfo, 'simult-50-avg-latency', avgUpdateLatency, { target: 500, warning: 1000, critical: 2000 }, 'ms')

      expect(updatesCompleted).toBeGreaterThan(0)
    } finally {
      // Cleanup
    }
  })

  test('stress test: 100 objects moving simultaneously - system should not crash', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-simult-100-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)

      // Seed 100 objects
      await seedBoardObjects(boardId, user.idToken, 100, { kind: 'mixed', columns: 15 })

      const objects = await fetchBoardObjects(boardId, user.idToken)
      const objectIds = objects.slice(0, 100).map(o => o.id)

      // Navigate to board
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      // Simulate 100 objects moving simultaneously for 2 seconds
      const duration = 2000
      const updatesPerSecond = 2

      const { updatesCompleted, avgUpdateLatency } = await simulateConcurrentObjectMoves(
        boardId,
        user.idToken,
        objectIds,
        duration,
        updatesPerSecond,
      )

      console.log(`[PERF] Simultaneous movement (100 objects): ${updatesCompleted} updates, ${avgUpdateLatency.toFixed(1)}ms avg latency`)

      // Critical: board should still be visible (no crash)
      await expect(page.locator('.board-stage')).toBeVisible()

      // Verify objects still exist
      const finalObjects = await fetchBoardObjects(boardId, user.idToken)
      expect(finalObjects.length).toBeGreaterThanOrEqual(100)

      annotateSla(testInfo, 'simult-100-updates', updatesCompleted, { target: 400, warning: 200, critical: 100 }, 'objects')
      annotateSla(testInfo, 'simult-100-avg-latency', avgUpdateLatency, { target: 1000, warning: 2000, critical: 5000 }, 'ms')

      // Primary assertion: system does not crash
      expect(updatesCompleted).toBeGreaterThan(0)
    } finally {
      // Cleanup
    }
  })
})
