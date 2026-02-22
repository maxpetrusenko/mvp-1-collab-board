import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects, type BoardObject } from '../helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const OBJECT_SYNC_SLA = { target: 100, warning: 1_500, critical: 2_500 }
const RAPID_SYNC_TOTAL_SLA = { target: 3_000, warning: 8_000, critical: 15_000 }

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

const createShapeObject = async (page: Page) => {
  await page.getByTestId('add-shape-button').click()
  await expect(page.getByTestId('shape-create-popover')).toBeVisible()
  await page.getByTestId('shape-create-submit').click()
}

const dragObjectByDelta = async (page: Page, boardObject: BoardObject, delta: { x: number; y: number }) => {
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Board object missing position/size for drag')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const startX = canvasBox.x + boardObject.position.x + boardObject.size.width / 2
  const startY = canvasBox.y + boardObject.position.y + boardObject.size.height / 2
  const endX = startX + delta.x
  const endY = startY + delta.y

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 10 })
  await page.mouse.up()
}

test.describe('Performance: object sync latency', () => {
  test.setTimeout(300_000)

  test('NFR-OBJ-001: rapid sticky/shape create+move stays within object-sync critical SLA', async ({
    browser,
  }, testInfo) => {
    const userA = await createTempUser()
    const userB = await createTempUser()
    const boardId = `pw-perf-obj-sync-${Date.now()}`
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    const createLatencies: number[] = []
    const moveLatencies: number[] = []

    try {
      await loginWithEmail(pageA, APP_URL, userA.email, userA.password)
      await loginWithEmail(pageB, APP_URL, userB.email, userB.password)

      await pageA.goto(`${APP_URL}/b/${boardId}`)
      await pageB.goto(`${APP_URL}/b/${boardId}`)
      await expect(pageA.locator('.board-stage')).toBeVisible({ timeout: 20_000 })
      await expect(pageB.locator('.board-stage')).toBeVisible({ timeout: 20_000 })

      const knownObjectIds = new Set((await fetchBoardObjects(boardId, userA.idToken)).map((object) => object.id))
      const createdIds: string[] = []

      const createActions: Array<'sticky' | 'shape'> = ['sticky', 'shape', 'sticky', 'shape', 'sticky', 'shape']
      for (const createAction of createActions) {
        const startedAt = Date.now()

        if (createAction === 'sticky') {
          await pageA.locator('button[title="Add sticky note (S)"]').click()
        } else {
          await createShapeObject(pageA)
        }

        let createdObjectId = ''
        await expect
          .poll(async () => {
            const objects = await fetchBoardObjects(boardId, userA.idToken)
            const newest = objects.find((object) => !knownObjectIds.has(object.id))
            createdObjectId = newest?.id || ''
            return createdObjectId
          })
          .not.toBe('')

        knownObjectIds.add(createdObjectId)
        createdIds.push(createdObjectId)

        await expect
          .poll(async () => {
            const collaboratorObjects = await fetchBoardObjects(boardId, userB.idToken)
            return collaboratorObjects.some((object) => object.id === createdObjectId)
          })
          .toBe(true)

        createLatencies.push(Date.now() - startedAt)
      }

      const moveObjectIds = createdIds.slice(-4).reverse()
      for (const [index, objectId] of moveObjectIds.entries()) {
        const beforeMove = (await fetchBoardObjects(boardId, userA.idToken)).find((object) => object.id === objectId)
        if (!beforeMove?.position || !beforeMove.size) {
          continue
        }
        const baseline = { x: beforeMove.position.x, y: beforeMove.position.y }
        const startedAt = Date.now()

        await dragObjectByDelta(pageA, beforeMove, { x: 110 + index * 10, y: 60 })

        await expect
          .poll(
            async () => {
              const ownerObjects = await fetchBoardObjects(boardId, userA.idToken)
              const moved = ownerObjects.find((object) => object.id === objectId)
              if (!moved?.position) {
                return false
              }
              return (
                Math.abs((moved.position.x ?? baseline.x) - baseline.x) >= 8 ||
                Math.abs((moved.position.y ?? baseline.y) - baseline.y) >= 8
              )
            },
            { timeout: 10_000 },
          )
          .toBe(true)

        await expect
          .poll(
            async () => {
              const collaboratorObjects = await fetchBoardObjects(boardId, userB.idToken)
              const moved = collaboratorObjects.find((object) => object.id === objectId)
              if (!moved?.position) {
                return false
              }
              return (
                Math.abs((moved.position.x ?? baseline.x) - baseline.x) >= 8 ||
                Math.abs((moved.position.y ?? baseline.y) - baseline.y) >= 8
              )
            },
            { timeout: 10_000 },
          )
          .toBe(true)

        moveLatencies.push(Date.now() - startedAt)
      }

      // Ignore first create as warm-up (initial board + auth sync).
      const createSamples = createLatencies.length > 1 ? createLatencies.slice(1) : createLatencies
      const moveSamples = moveLatencies.length > 1 ? moveLatencies.slice(1) : moveLatencies
      const averageCreateMs = createSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, createSamples.length)
      const averageMoveMs = moveSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, moveSamples.length)
      const totalScenarioMs = createLatencies.reduce((sum, value) => sum + value, 0) +
        moveLatencies.reduce((sum, value) => sum + value, 0)

      annotateSla(testInfo, 'object-sync-create-average', averageCreateMs, OBJECT_SYNC_SLA)
      annotateSla(testInfo, 'object-sync-move-average', averageMoveMs, OBJECT_SYNC_SLA)
      annotateSla(testInfo, 'object-sync-rapid-total', totalScenarioMs, RAPID_SYNC_TOTAL_SLA)

      expect(createLatencies.length).toBeGreaterThanOrEqual(6)
      expect(moveLatencies.length).toBeGreaterThanOrEqual(3)
      expect(averageCreateMs).toBeLessThanOrEqual(OBJECT_SYNC_SLA.critical)
      expect(averageMoveMs).toBeLessThanOrEqual(OBJECT_SYNC_SLA.critical)
      expect(totalScenarioMs).toBeLessThanOrEqual(RAPID_SYNC_TOTAL_SLA.critical)
    } finally {
      await Promise.all([
        contextA.close().catch(() => undefined),
        contextB.close().catch(() => undefined),
      ])
      await Promise.all([
        deleteTempUser(userA.idToken).catch(() => undefined),
        deleteTempUser(userB.idToken).catch(() => undefined),
      ])
    }
  })
})
