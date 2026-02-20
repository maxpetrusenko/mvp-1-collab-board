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
  await page.mouse.move(endX, endY, { steps: 5 })
  await page.mouse.up()
}

const openAiWidgetIfNeeded = async (page: Page) => {
  const launcher = page.getByTestId('ai-chat-widget-launcher')
  if (await launcher.count()) {
    await launcher.click()
  }
}

const submitAiCommand = async (page: Page, command: string) => {
  const aiInput = page.locator('.ai-panel .ai-input').first()
  await expect(aiInput).toBeVisible()
  await aiInput.fill(command)
  await page.locator('.ai-panel').first().getByRole('button', { name: 'Send Command' }).click()
}

const expectAiSuccess = async (page: Page) => {
  await expect(page.getByTestId('ai-status-pill')).toHaveText('success')
  await expect(page.locator('.ai-panel .ai-message.error')).toHaveCount(0)
  await expect(page.locator('.ai-panel .ai-message.warning')).toHaveCount(0)
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
      await expect(pageA.locator('.board-stage')).toBeVisible()

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

      await openAiWidgetIfNeeded(pageA)
      await submitAiCommand(pageA, `add green sticky note saying ${marker}`)
      await expectAiSuccess(pageA)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, userB.idToken)
          return objects.some((object) => object.type === 'stickyNote' && object.text?.includes(marker))
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
})
