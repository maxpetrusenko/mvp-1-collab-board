import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('MVP regression', () => {
  test.setTimeout(180_000)

  test('core board flows: create, drag, undo/redo', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-mvp-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.locator('.presence-strip')).toBeVisible()

      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const initialStickyCount = countByType(initialObjects, 'stickyNote')

      await page.locator('button[title="Add sticky note (S)"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'stickyNote')
        })
        .toBe(initialStickyCount + 1)

      const afterStickyObjects = await fetchBoardObjects(boardId, user.idToken)
      const newestSticky = newestObjectByType(afterStickyObjects, 'stickyNote')

      if (!newestSticky || !newestSticky.position) {
        throw new Error('Sticky note object not found after create')
      }

      const initialStickyPosition = `${Math.round(newestSticky.position.x ?? 0)}:${Math.round(newestSticky.position.y ?? 0)}`

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const dragStartX = canvasBox.x + (newestSticky.position.x ?? 0) + ((newestSticky.size?.width ?? 180) / 2)
      const dragStartY = canvasBox.y + (newestSticky.position.y ?? 0) + ((newestSticky.size?.height ?? 110) / 2)

      await page.mouse.move(dragStartX, dragStartY)
      await page.mouse.down()
      await page.mouse.move(dragStartX + 160, dragStartY + 100)
      await page.mouse.up()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const sticky = objects.find((object) => object.id === newestSticky.id)
          if (!sticky?.position) return initialStickyPosition
          return `${Math.round(sticky.position.x ?? 0)}:${Math.round(sticky.position.y ?? 0)}`
        })
        .not.toBe(initialStickyPosition)

      await page.mouse.click(dragStartX + 160, dragStartY + 100)
      await expect(page.getByTestId('shape-type-picker')).toBeVisible()
      await page.locator('button[title="Set shape to Circle"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky.id)?.shapeType ?? ''
        })
        .toBe('circle')

      await page.locator('button[title="Undo (Cmd+Z)"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky.id)?.shapeType ?? 'rectangle'
        })
        .toBe('rectangle')

      await page.locator('button[title="Redo (Cmd+Shift+Z)"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky.id)?.shapeType ?? ''
        })
        .toBe('circle')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
