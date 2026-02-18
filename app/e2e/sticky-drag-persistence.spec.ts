import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const POSITION_TOLERANCE_PX = 6

const stickyById = (objects: BoardObject[], stickyId: string): BoardObject | null =>
  objects.find((object) => object.id === stickyId && object.type === 'stickyNote') || null

const withinTolerance = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) <= tolerance

const dragStickyCenterTo = async (
  page: Page,
  sticky: BoardObject,
  targetTopLeft: { x: number; y: number },
) => {
  if (!sticky.position || !sticky.size) {
    throw new Error('Sticky is missing position/size')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const halfWidth = (sticky.size.width ?? 180) / 2
  const halfHeight = (sticky.size.height ?? 110) / 2
  const startX = canvasBox.x + (sticky.position.x ?? 0) + halfWidth
  const startY = canvasBox.y + (sticky.position.y ?? 0) + halfHeight
  const endX = canvasBox.x + targetTopLeft.x + halfWidth
  const endY = canvasBox.y + targetTopLeft.y + halfHeight

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 2 })
  await page.mouse.up()
}

test.describe('Sticky drag persistence', () => {
  test.setTimeout(180_000)

  test('keeps sticky at release position after drag end', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-sticky-drag-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add sticky note (S)"]').click()

      let stickyId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      const targets = [
        { x: 100, y: 120 },
        { x: 360, y: 180 },
        { x: 620, y: 280 },
        { x: 240, y: 360 },
        { x: 520, y: 120 },
      ]

      for (const targetTopLeft of targets) {
        const preDragObjects = await fetchBoardObjects(boardId, user.idToken)
        const stickyBeforeDrag = stickyById(preDragObjects, stickyId)
        if (!stickyBeforeDrag) {
          throw new Error('Sticky not found before drag')
        }

        await dragStickyCenterTo(page, stickyBeforeDrag, targetTopLeft)

        await expect
          .poll(async () => {
            const objects = await fetchBoardObjects(boardId, user.idToken)
            const sticky = stickyById(objects, stickyId)
            if (!sticky?.position) {
              return false
            }
            return (
              withinTolerance(sticky.position.x ?? NaN, targetTopLeft.x, POSITION_TOLERANCE_PX) &&
              withinTolerance(sticky.position.y ?? NaN, targetTopLeft.y, POSITION_TOLERANCE_PX)
            )
          })
          .toBe(true)

        await page.waitForTimeout(600)

        const objectsAfterSettle = await fetchBoardObjects(boardId, user.idToken)
        const stickyAfterSettle = stickyById(objectsAfterSettle, stickyId)
        if (!stickyAfterSettle?.position) {
          throw new Error('Sticky missing after settle check')
        }

        expect(
          withinTolerance(stickyAfterSettle.position.x ?? NaN, targetTopLeft.x, POSITION_TOLERANCE_PX),
        ).toBe(true)
        expect(
          withinTolerance(stickyAfterSettle.position.y ?? NaN, targetTopLeft.y, POSITION_TOLERANCE_PX),
        ).toBe(true)
      }
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
