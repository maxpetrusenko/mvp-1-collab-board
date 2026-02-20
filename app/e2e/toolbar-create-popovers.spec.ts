import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Toolbar create popovers', () => {
  test.setTimeout(180_000)

  test('creates shape, connector, and text objects from dedicated popovers', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-toolbar-popovers-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const shapeText = `Shape ${Date.now()}`
      await page.getByTestId('add-shape-button').click()
      await expect(page.getByTestId('shape-create-popover')).toBeVisible()
      await expect(page.locator('button[title="Set new shape type to Line"]')).toHaveCount(0)
      await page.locator('button[title="Set new shape type to Circle"]').click()
      await page.locator('button[title="Set new shape color to green"]').click()
      await page.getByTestId('shape-create-text-input').fill(shapeText)
      await page.getByTestId('shape-create-submit').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const newestShape = newestObjectByType(objects, 'shape')
          if (!newestShape) {
            return ''
          }
          return `${newestShape.shapeType || ''}:${newestShape.color || ''}:${newestShape.text || ''}`
        })
        .toBe(`circle:#86efac:${shapeText}`)

      await page.getByTestId('add-connector-button').click()
      await expect(page.getByTestId('connector-create-popover')).toBeVisible()
      await page.locator('button[title="Set new connector style to Line"]').click()
      await page.locator('button[title="Set new connector color to royal blue"]').click()
      await page.getByTestId('connector-create-submit').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const newestConnector = newestObjectByType(objects, 'connector')
          if (!newestConnector) {
            return ''
          }
          return `${newestConnector.style || ''}:${newestConnector.color || ''}`
        })
        .toBe('line:#1d4ed8')

      const textValue = `Standalone text ${Date.now()}`
      await page.getByTestId('add-text-button').click()
      await expect(page.getByTestId('text-create-popover')).toBeVisible()
      await page.getByTestId('text-create-input').fill(textValue)
      await page.locator('button[title="Set new text color to crimson"]').click()
      await page.getByTestId('text-create-font-size').fill('34')
      await page.getByTestId('text-create-submit').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const newestText = newestObjectByType(objects, 'text')
          if (!newestText) {
            return ''
          }
          return `${newestText.text || ''}:${newestText.color || ''}:${newestText.fontSize || ''}`
        })
        .toBe(`${textValue}:#dc2626:34`)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
