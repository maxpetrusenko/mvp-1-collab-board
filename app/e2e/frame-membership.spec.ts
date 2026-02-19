import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
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
  await page.mouse.move(endX, endY, { steps: 6 })
  await page.mouse.up()
}

const createObjectAndResolve = async (
  page: Page,
  boardId: string,
  idToken: string,
  objectType: 'stickyNote' | 'frame',
): Promise<BoardObject> => {
  if (objectType === 'stickyNote') {
    await page.locator('button[title="Add sticky note (S)"]').click()
  } else {
    await page.locator('button[title="Add frame (F)"]').click()
  }

  let objectId = ''
  await expect
    .poll(async () => {
      const objects = await fetchBoardObjects(boardId, idToken)
      objectId = newestObjectByType(objects, objectType)?.id || ''
      return objectId
    })
    .not.toBe('')

  const objects = await fetchBoardObjects(boardId, idToken)
  const boardObject = objects.find((candidate) => candidate.id === objectId)
  if (!boardObject) {
    throw new Error(`${objectType} not found after creation`)
  }
  return boardObject
}

const getObjectById = async (boardId: string, idToken: string, objectId: string): Promise<BoardObject> => {
  const objects = await fetchBoardObjects(boardId, idToken)
  const boardObject = objects.find((candidate) => candidate.id === objectId)
  if (!boardObject) {
    throw new Error(`Object not found: ${objectId}`)
  }
  return boardObject
}

test.describe('Frame membership behavior', () => {
  test.setTimeout(240_000)

  test('FR-8: frame drag does not auto-pick overlapping objects that were never attached', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-frame-no-autopick-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const frame = await createObjectAndResolve(page, boardId, user.idToken, 'frame')
      const sticky = await createObjectAndResolve(page, boardId, user.idToken, 'stickyNote')

      await dragBoardObjectCenterTo(page, frame, { x: 120, y: 120 })
      const stickyOutside = await getObjectById(boardId, user.idToken, sticky.id)
      await dragBoardObjectCenterTo(page, stickyOutside, { x: 620, y: 160 })

      const frameOverlap = await getObjectById(boardId, user.idToken, frame.id)
      await dragBoardObjectCenterTo(page, frameOverlap, { x: 500, y: 120 })

      const stickyBeforeSecondFrameMove = await getObjectById(boardId, user.idToken, sticky.id)
      if (!stickyBeforeSecondFrameMove.position) {
        throw new Error('Sticky position missing before frame move')
      }

      const frameSecondMove = await getObjectById(boardId, user.idToken, frame.id)
      await dragBoardObjectCenterTo(page, frameSecondMove, { x: 260, y: 320 })

      await expect
        .poll(async () => {
          const latestSticky = await getObjectById(boardId, user.idToken, sticky.id)
          if (!latestSticky.position) {
            return false
          }
          return (
            withinTolerance(
              latestSticky.position.x ?? NaN,
              stickyBeforeSecondFrameMove.position?.x ?? NaN,
              POSITION_TOLERANCE_PX,
            ) &&
            withinTolerance(
              latestSticky.position.y ?? NaN,
              stickyBeforeSecondFrameMove.position?.y ?? NaN,
              POSITION_TOLERANCE_PX,
            )
          )
        })
        .toBe(true)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('FR-8: sticky attaches only after being moved into frame and detaches when dragged out', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-frame-attach-detach-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const frame = await createObjectAndResolve(page, boardId, user.idToken, 'frame')
      const sticky = await createObjectAndResolve(page, boardId, user.idToken, 'stickyNote')

      await dragBoardObjectCenterTo(page, frame, { x: 140, y: 140 })
      const stickyOutside = await getObjectById(boardId, user.idToken, sticky.id)
      await dragBoardObjectCenterTo(page, stickyOutside, { x: 740, y: 170 })
      await expect
        .poll(async () => {
          const latestSticky = await getObjectById(boardId, user.idToken, sticky.id)
          if (!latestSticky.position) {
            return false
          }
          return (
            withinTolerance(latestSticky.position.x ?? NaN, 740, 24) &&
            withinTolerance(latestSticky.position.y ?? NaN, 170, 24)
          )
        })
        .toBe(true)

      const stickyToAttach = await getObjectById(boardId, user.idToken, sticky.id)
      const frameForAttach = await getObjectById(boardId, user.idToken, frame.id)
      if (!frameForAttach.position || !frameForAttach.size || !stickyToAttach.size) {
        throw new Error('Missing frame/sticky geometry for attach step')
      }
      const attachTarget = {
        x: Math.min(
          frameForAttach.position.x + 24,
          frameForAttach.position.x + Math.max(0, frameForAttach.size.width - stickyToAttach.size.width - 12),
        ),
        y: Math.min(
          frameForAttach.position.y + 48,
          frameForAttach.position.y + Math.max(0, frameForAttach.size.height - stickyToAttach.size.height - 12),
        ),
      }
      await dragBoardObjectCenterTo(page, stickyToAttach, attachTarget)
      await expect
        .poll(async () => {
          const latestSticky = await getObjectById(boardId, user.idToken, sticky.id)
          if (!latestSticky.position) {
            return false
          }
          return (
            withinTolerance(latestSticky.position.x ?? NaN, attachTarget.x, 24) &&
            withinTolerance(latestSticky.position.y ?? NaN, attachTarget.y, 24)
          )
        })
        .toBe(true)

      await expect
        .poll(async () => {
          const attachedSticky = await getObjectById(boardId, user.idToken, sticky.id)
          return attachedSticky.frameId || null
        })
        .toBe(frame.id)

      const frameBeforeMove = await getObjectById(boardId, user.idToken, frame.id)
      const stickyBeforeMove = await getObjectById(boardId, user.idToken, sticky.id)
      if (!frameBeforeMove.position || !stickyBeforeMove.position) {
        throw new Error('Missing positions before frame move')
      }

      const frameMoveTarget = { x: 360, y: 320 }
      await dragBoardObjectCenterTo(page, frameBeforeMove, frameMoveTarget)

      await expect
        .poll(async () => {
          const movedSticky = await getObjectById(boardId, user.idToken, sticky.id)
          const movedFrame = await getObjectById(boardId, user.idToken, frame.id)
          if (!movedSticky.position || !movedFrame.position) {
            return false
          }
          const actualDeltaX = movedFrame.position.x - frameBeforeMove.position.x
          const actualDeltaY = movedFrame.position.y - frameBeforeMove.position.y
          return (
            withinTolerance(
              movedSticky.position.x ?? NaN,
              (stickyBeforeMove.position?.x ?? NaN) + actualDeltaX,
              POSITION_TOLERANCE_PX,
            ) &&
            withinTolerance(
              movedSticky.position.y ?? NaN,
              (stickyBeforeMove.position?.y ?? NaN) + actualDeltaY,
              POSITION_TOLERANCE_PX,
            )
          )
        })
        .toBe(true)

      const stickyToDetach = await getObjectById(boardId, user.idToken, sticky.id)
      await dragBoardObjectCenterTo(page, stickyToDetach, { x: 120, y: 120 })

      await expect
        .poll(async () => {
          const detachedSticky = await getObjectById(boardId, user.idToken, sticky.id)
          return detachedSticky.frameId === null || detachedSticky.frameId === undefined
        })
        .toBe(true)

      const stickyDetached = await getObjectById(boardId, user.idToken, sticky.id)
      if (!stickyDetached.position) {
        throw new Error('Missing detached sticky position')
      }

      const frameSecondMove = await getObjectById(boardId, user.idToken, frame.id)
      await dragBoardObjectCenterTo(page, frameSecondMove, { x: 500, y: 380 })

      await expect
        .poll(async () => {
          const stickyAfterSecondFrameMove = await getObjectById(boardId, user.idToken, sticky.id)
          if (!stickyAfterSecondFrameMove.position) {
            return false
          }
          return (
            withinTolerance(
              stickyAfterSecondFrameMove.position.x ?? NaN,
              stickyDetached.position?.x ?? NaN,
              POSITION_TOLERANCE_PX,
            ) &&
            withinTolerance(
              stickyAfterSecondFrameMove.position.y ?? NaN,
              stickyDetached.position?.y ?? NaN,
              POSITION_TOLERANCE_PX,
            )
          )
        })
        .toBe(true)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
