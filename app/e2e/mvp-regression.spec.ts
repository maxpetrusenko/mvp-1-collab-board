import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('MVP regression', () => {
  test.setTimeout(180_000)

  test('core board flows: create, style, undo/redo', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-mvp-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.locator('.presence-strip')).toBeVisible()
      await expect(page.getByTestId('selection-mode-select')).toBeVisible()
      await expect(page.getByTestId('selection-mode-area')).toBeVisible()

      await page.getByTestId('selection-mode-area').click()
      await expect
        .poll(async () => {
          return page.locator('.board-stage').evaluate((node) => node.classList.contains('board-stage-area'))
        })
        .toBe(true)

      await page.getByTestId('selection-mode-select').click()
      await expect
        .poll(async () => {
          return page.locator('.board-stage').evaluate((node) => node.classList.contains('board-stage-area'))
        })
        .toBe(false)

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

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const stickyCenterX = canvasBox.x + (newestSticky.position.x ?? 0) + ((newestSticky.size?.width ?? 180) / 2)
      const stickyCenterY = canvasBox.y + (newestSticky.position.y ?? 0) + ((newestSticky.size?.height ?? 110) / 2)

      await page.mouse.click(stickyCenterX, stickyCenterY)
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
