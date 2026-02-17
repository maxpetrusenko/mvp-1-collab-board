import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Shape editing', () => {
  test.setTimeout(180_000)

  test('edits shape text inline and changes shape type', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-shape-edit-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add rectangle (R)"]').click()

      let newestShape: BoardObject | null = null
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          newestShape = newestObjectByType(objects, 'shape')
          return Boolean(newestShape)
        })
        .toBe(true)

      if (!newestShape || !newestShape.position || !newestShape.size) {
        throw new Error('Shape object not found after create')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const targetX = canvasBox.x + (newestShape.position.x ?? 0) + ((newestShape.size.width ?? 180) / 2)
      const targetY = canvasBox.y + (newestShape.position.y ?? 0) + ((newestShape.size.height ?? 110) / 2)

      await page.mouse.dblclick(targetX, targetY)
      await expect(page.locator('.inline-editor-textarea')).toBeVisible()

      const shapeText = `Shape text ${Date.now()}`
      await page.locator('.inline-editor-textarea').fill(shapeText)
      await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.text ?? ''
        })
        .toBe(shapeText)

      await page.mouse.click(targetX, targetY)
      await expect(page.getByTestId('shape-type-picker')).toBeVisible()
      await page.locator('button[title="Set shape to Circle"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.shapeType ?? ''
        })
        .toBe('circle')

      await page.locator('button[title="Set shape to Diamond"]').click()
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.shapeType ?? ''
        })
        .toBe('diamond')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
