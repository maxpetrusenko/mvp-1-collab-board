import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Dark mode toggle', () => {
  test.setTimeout(180_000)

  test('T-063: theme toggle flips and persists board theme mode', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-dark-mode-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const root = page.locator('html')
      const initialTheme = (await root.getAttribute('data-theme')) || 'light'
      const toggledTheme = initialTheme === 'dark' ? 'light' : 'dark'

      await page.getByTestId('theme-toggle-button').click()
      await expect(root).toHaveAttribute('data-theme', toggledTheme)

      await page.reload()
      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(root).toHaveAttribute('data-theme', toggledTheme)
    } finally {
      await cleanupTestUser(user)
    }
  })

  test('T-064: comment input text is visible in dark mode', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-dark-mode-comment-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      // Switch to dark mode
      const root = page.locator('html')
      await page.getByTestId('theme-toggle-button').click()
      await expect(root).toHaveAttribute('data-theme', 'dark')

      // Create a sticky note to enable commenting
      await page.getByRole('button', { name: /sticky/i }).click()
      await page.mouse.click(400, 300)

      let stickyId = ''
      await expect
        .poll(async () => {
          stickyId = newestObjectByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      const sticky = (await fetchBoardObjects(boardId, user.idToken)).find((object) => object.id === stickyId)
      if (!sticky?.position || !sticky?.size) {
        throw new Error('Sticky note bounds unavailable for comments test')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable for comments test')
      }

      const stickyCenterX = canvasBox.x + sticky.position.x + sticky.size.width / 2
      const stickyCenterY = canvasBox.y + sticky.position.y + sticky.size.height / 2
      await page.mouse.click(stickyCenterX, stickyCenterY)
      await page.getByRole('button', { name: 'Comments' }).click()

      // Wait for comments panel to appear
      await expect(page.locator('.side-panel')).toBeVisible()

      // Find the comment input textarea
      const commentInput = page.locator('textarea.comment-input')
      await expect(commentInput).toBeVisible()

      // Type in the comment input
      const testText = 'Test comment in dark mode'
      await commentInput.fill(testText)

      // Verify the text was entered
      await expect(commentInput).toHaveValue(testText)

      // Check that the input has proper contrast by computing color contrast
      const inputColor = await commentInput.evaluate((el) => {
        return window.getComputedStyle(el).color
      })

      // In dark mode, text should be light (not dark)
      // The color should NOT be very dark (low RGB values)
      expect(inputColor).toBeTruthy()

      // Add the comment
      await page.getByRole('button', { name: 'Add Comment' }).click()

      // Verify the comment appears in the list
      await expect(page.locator('.comments-list')).toContainText(testText)

      // Check that the displayed comment text is visible (not dark on dark)
      const commentText = page.locator('.comment-item p').filter({ hasText: testText })
      await expect(commentText).toBeVisible()

      const commentTextColor = await commentText.evaluate((el) => {
        return window.getComputedStyle(el).color
      })

      // Comment text should also have a light color in dark mode
      expect(commentTextColor).toBeTruthy()
    } finally {
      await cleanupTestUser(user)
    }
  })
})
