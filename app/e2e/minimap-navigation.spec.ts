import { expect, test, type Locator } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const readViewportPosition = async (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      left: Number.parseFloat(style.left || '0'),
      top: Number.parseFloat(style.top || '0'),
    }
  })

test.describe('Mini-map navigation', () => {
  test.setTimeout(180_000)

  test('T-070: clicking the mini-map moves the viewport indicator', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-minimap-nav-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const minimap = page.getByTestId('minimap')
      const minimapCanvas = page.getByTestId('minimap-canvas')
      const minimapViewport = page.getByTestId('minimap-viewport')

      await expect(minimap).toBeVisible()
      await expect(minimapViewport).toBeVisible()

      const before = await readViewportPosition(minimapViewport)
      const bounds = await minimapCanvas.boundingBox()
      if (!bounds) {
        throw new Error('Mini-map bounds unavailable')
      }

      await page.mouse.click(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10)

      await expect
        .poll(async () => {
          const after = await readViewportPosition(minimapViewport)
          return Math.abs(after.left - before.left) + Math.abs(after.top - before.top)
        })
        .toBeGreaterThan(6)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
