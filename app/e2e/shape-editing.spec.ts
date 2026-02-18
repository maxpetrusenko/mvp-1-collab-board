import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Sticky shape editing', () => {
  test.setTimeout(180_000)

  test('edits sticky text inline and changes sticky shape type', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-shape-edit-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add sticky note (S)"]').click()

      let newestSticky: BoardObject | null = null
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          newestSticky = newestObjectByType(objects, 'stickyNote')
          return Boolean(newestSticky)
        })
        .toBe(true)

      if (!newestSticky || !newestSticky.position || !newestSticky.size) {
        throw new Error('Sticky note object not found after create')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const targetX = canvasBox.x + (newestSticky.position.x ?? 0) + ((newestSticky.size.width ?? 180) / 2)
      const targetY = canvasBox.y + (newestSticky.position.y ?? 0) + ((newestSticky.size.height ?? 110) / 2)

      await page.mouse.dblclick(targetX, targetY)
      await expect(page.locator('.inline-editor-textarea')).toBeVisible()

      const stickyText = `Sticky text ${Date.now()}`
      await page.locator('.inline-editor-textarea').fill(stickyText)
      await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky?.id)?.text ?? ''
        })
        .toBe(stickyText)

      await page.mouse.click(targetX, targetY)
      await expect(page.getByTestId('shape-type-picker')).toBeVisible()
      await page.locator('button[title="Set shape to Circle"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky?.id)?.shapeType ?? ''
        })
        .toBe('circle')

      await page.locator('button[title="Set shape to Diamond"]').click()
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky?.id)?.shapeType ?? ''
        })
        .toBe('diamond')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
