import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import {
  openAiPanelIfNeeded,
  runAiMutationCommandWithRetry,
} from './helpers/ai-command'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const POSITION_TOLERANCE_PX = 8

const withinTolerance = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) <= tolerance

const dragBoardObjectCenterTo = async (
  page: Page,
  boardObject: BoardObject,
  targetTopLeft: { x: number; y: number },
) => {
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Board object missing position/size')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const halfWidth = boardObject.size.width / 2
  const halfHeight = boardObject.size.height / 2
  const startX = canvasBox.x + boardObject.position.x + halfWidth
  const startY = canvasBox.y + boardObject.position.y + halfHeight
  const endX = canvasBox.x + targetTopLeft.x + halfWidth
  const endY = canvasBox.y + targetTopLeft.y + halfHeight

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 5 })
  await page.mouse.up()
}

const waitForStickyMarker = async (args: {
  boardId: string
  idToken: string
  marker: string
  timeoutMs?: number
}): Promise<boolean> => {
  const timeoutMs = args.timeoutMs ?? 12_000
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const objects = await fetchBoardObjects(args.boardId, args.idToken)
    if (objects.some((object) => object.type === 'stickyNote' && object.text?.includes(args.marker))) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return false
}

test.describe('Requirements: collaboration parity', () => {
  test.setTimeout(240_000)

  test('FR-9/AC-2: syncs sticky create and move between two authenticated browsers', async ({ browser }) => {
    const userA = await createTempUser()
    const userB = await createTempUser()
    const boardId = `pw-req-sync-${Date.now()}`
    const targetTopLeft = { x: 520, y: 260 }
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      await loginWithEmail(pageA, APP_URL, userA.email, userA.password)
      await loginWithEmail(pageB, APP_URL, userB.email, userB.password)

      await pageA.goto(`${APP_URL}/b/${boardId}`)
      await pageB.goto(`${APP_URL}/b/${boardId}`)
      await expect(pageA.locator('.board-stage')).toBeVisible()
      await expect(pageB.locator('.board-stage')).toBeVisible()

      await pageA.locator('button[title="Add sticky note (S)"]').click()

      let stickyId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userA.idToken)
          stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userB.idToken)
          return objects.some((object) => object.id === stickyId)
        })
        .toBe(true)

      const beforeDrag = await fetchBoardObjects(boardId, userA.idToken)
      const sticky = beforeDrag.find((object) => object.id === stickyId)
      if (!sticky) {
        throw new Error('Sticky note missing before drag')
      }

      await dragBoardObjectCenterTo(pageA, sticky, targetTopLeft)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userB.idToken)
          const moved = objects.find((object) => object.id === stickyId)
          if (!moved?.position) {
            return false
          }
          return (
            withinTolerance(moved.position.x ?? NaN, targetTopLeft.x, POSITION_TOLERANCE_PX) &&
            withinTolerance(moved.position.y ?? NaN, targetTopLeft.y, POSITION_TOLERANCE_PX)
          )
        })
        .toBe(true)
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

  test('FR-14/AC-2: keeps shared board state consistent after collaborator refresh', async ({ browser }) => {
    const userA = await createTempUser()
    const userB = await createTempUser()
    const boardId = `pw-req-refresh-${Date.now()}`
    const targetTopLeft = { x: 460, y: 220 }
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      await loginWithEmail(pageA, APP_URL, userA.email, userA.password)
      await loginWithEmail(pageB, APP_URL, userB.email, userB.password)

      await pageA.goto(`${APP_URL}/b/${boardId}`)
      await pageB.goto(`${APP_URL}/b/${boardId}`)
      await expect(pageA.locator('.board-stage')).toBeVisible()
      await expect(pageB.locator('.board-stage')).toBeVisible()

      await pageA.locator('button[title="Add sticky note (S)"]').click()

      let stickyId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userA.idToken)
          stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      const beforeDrag = await fetchBoardObjects(boardId, userA.idToken)
      const sticky = beforeDrag.find((object) => object.id === stickyId)
      if (!sticky) {
        throw new Error('Sticky note missing before drag')
      }

      await dragBoardObjectCenterTo(pageA, sticky, targetTopLeft)
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userA.idToken)
          const moved = objects.find((object) => object.id === stickyId)
          if (typeof moved?.position?.x !== 'number' || typeof moved?.position?.y !== 'number') {
            return ''
          }
          return `${moved.position.x},${moved.position.y}`
        })
        .not.toBe('')
      const beforeReloadObjects = await fetchBoardObjects(boardId, userA.idToken)
      const movedBeforeReload = beforeReloadObjects.find((object) => object.id === stickyId)
      if (
        typeof movedBeforeReload?.position?.x !== 'number' ||
        typeof movedBeforeReload?.position?.y !== 'number'
      ) {
        throw new Error('Missing server position before reload')
      }
      const serverPositionBeforeReload = {
        x: movedBeforeReload.position.x,
        y: movedBeforeReload.position.y,
      }

      await pageA.reload()
      await expect(pageA).toHaveURL(/\/b\//, { timeout: 20_000 })

      const assertTargetPosition = async (idToken: string) => {
        const objects = await fetchBoardObjects(boardId, idToken)
        const moved = objects.find((object) => object.id === stickyId)
        if (!moved?.position) {
          return false
        }
        return (
          withinTolerance(moved.position.x ?? NaN, serverPositionBeforeReload.x, POSITION_TOLERANCE_PX) &&
          withinTolerance(moved.position.y ?? NaN, serverPositionBeforeReload.y, POSITION_TOLERANCE_PX)
        )
      }

      await expect.poll(async () => assertTargetPosition(userA.idToken)).toBe(true)
      await expect.poll(async () => assertTargetPosition(userB.idToken)).toBe(true)
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

  test('FR-19: AI-created content becomes visible to other collaborators on same board', async ({ browser }) => {
    const userA = await createTempUser()
    const userB = await createTempUser()
    const boardId = `pw-req-ai-shared-${Date.now()}`
    const marker = `shared-ai-${Date.now()}`
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      await loginWithEmail(pageA, APP_URL, userA.email, userA.password)
      await loginWithEmail(pageB, APP_URL, userB.email, userB.password)

      await pageA.goto(`${APP_URL}/b/${boardId}`)
      await pageB.goto(`${APP_URL}/b/${boardId}`)
      await expect(pageA.locator('.board-stage')).toBeVisible()
      await expect(pageB.locator('.board-stage')).toBeVisible()

      await openAiPanelIfNeeded(pageA)
      await openAiPanelIfNeeded(pageB)
      const candidateCommands = [
        `add sticky note saying ${marker}`,
        `create sticky note with text ${marker}`,
      ]
      const candidateExecutors = [
        { label: 'userA', page: pageA, writerIdToken: userA.idToken, observerIdToken: userB.idToken },
        { label: 'userB', page: pageB, writerIdToken: userB.idToken, observerIdToken: userA.idToken },
      ]
      let aiCompleted = false
      let lastFailureDetails = 'unknown'
      for (const executor of candidateExecutors) {
        for (const command of candidateCommands) {
          try {
            const execution = await runAiMutationCommandWithRetry(executor.page, {
              boardId,
              command,
              maxAttempts: 2,
            })
            if (execution.httpStatus !== 200) {
              lastFailureDetails = `${executor.label} command "${command}" returned HTTP ${execution.httpStatus}.`
              continue
            }
            const visibleToWriter = await waitForStickyMarker({
              boardId,
              idToken: executor.writerIdToken,
              marker,
            })
            if (!visibleToWriter) {
              lastFailureDetails = `${executor.label} command "${command}" returned 200 without writer marker visibility.`
              continue
            }
            const visibleToObserver = await waitForStickyMarker({
              boardId,
              idToken: executor.observerIdToken,
              marker,
            })
            if (!visibleToObserver) {
              lastFailureDetails = `${executor.label} command "${command}" returned 200 without observer marker visibility.`
              continue
            }

            aiCompleted = true
            break
          } catch (error) {
            lastFailureDetails = error instanceof Error ? error.message : String(error)
          }
        }
        if (aiCompleted) {
          break
        }
      }
      expect(
        aiCompleted,
        `AI command failed to create marker "${marker}" after retry commands. Last details: ${lastFailureDetails}.`,
      ).toBe(true)

      await expect
        .poll(async () => {
          const [objectsA, objectsB] = await Promise.all([
            fetchBoardObjects(boardId, userA.idToken),
            fetchBoardObjects(boardId, userB.idToken),
          ])
          return {
            visibleToA: objectsA.some((object) => object.type === 'stickyNote' && object.text?.includes(marker)),
            visibleToB: objectsB.some((object) => object.type === 'stickyNote' && object.text?.includes(marker)),
          }
        })
        .toEqual({ visibleToA: true, visibleToB: true })
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
