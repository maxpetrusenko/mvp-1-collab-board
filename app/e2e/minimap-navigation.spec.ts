import { expect, test, type Locator } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { seedBoardObjects } from './helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const readViewportPosition = async (locator: Locator) =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const parentRect = element.parentElement?.getBoundingClientRect()
    return {
      left: rect.left - (parentRect?.left ?? 0),
      top: rect.top - (parentRect?.top ?? 0),
    }
  })

test.describe('Mini-map navigation', () => {
  test.setTimeout(180_000)

  test('T-070: clicking the mini-map moves the viewport indicator', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-minimap-nav-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await seedBoardObjects(boardId, user.idToken, 16, {
        kind: 'sticky',
        columns: 4,
        spacingX: 1200,
        spacingY: 900,
        startX: 60,
        startY: 60,
      })
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const minimap = page.getByTestId('minimap')
      const minimapViewport = page.getByTestId('minimap-viewport')

      await expect(minimap).toBeVisible()
      await expect(minimapViewport).toBeVisible()

      const before = await readViewportPosition(minimapViewport)

      const bounds = await minimap.boundingBox()
      if (!bounds) {
        throw new Error('Mini-map bounds unavailable')
      }

      await page.mouse.click(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10)
      await expect(minimapViewport).toBeVisible()

      const after = await readViewportPosition(minimapViewport)
      expect(Number.isFinite(before.left)).toBe(true)
      expect(Number.isFinite(before.top)).toBe(true)
      expect(Number.isFinite(after.left)).toBe(true)
      expect(Number.isFinite(after.top)).toBe(true)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
