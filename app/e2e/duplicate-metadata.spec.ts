import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

/**
 * E2E tests for object duplication behavior.
 *
 * Addresses T-095: Duplicating objects should NOT copy collaborative metadata
 * (comments, votes) - only visual properties should duplicate.
 */
test.describe('Object Duplication', () => {
  test.setTimeout(60_000)

  test('duplicate does not copy votes from original object', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-dup-votes-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Create a sticky note
      await page.locator('button[title="Add sticky note (S)"]').click()

      // Wait for sticky to appear
      await page.waitForTimeout(500)
      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const initialStickyCount = countByType(initialObjects, 'stickyNote')
      expect(initialStickyCount).toBe(1)

      // Click on the sticky to select it
      const firstSticky = page.locator('[data-testid^="sticky-"]').first()
      await expect(firstSticky).toBeVisible()
      await firstSticky.click()

      // Vote on the sticky note
      const voteButton = page.locator('[data-testid="vote-button"]').first()
      await expect(voteButton).toBeVisible()
      await voteButton.click()

      // Verify vote was cast
      await page.waitForTimeout(300)

      // Duplicate using keyboard shortcut (Ctrl+D / Cmd+D)
      await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+d')

      // Wait for duplicate to appear
      await page.waitForTimeout(500)

      const afterObjects = await fetchBoardObjects(boardId, user.idToken)
      const afterStickyCount = countByType(afterObjects, 'stickyNote')
      expect(afterStickyCount).toBe(2)

      // Check that the duplicate has no votes
      const duplicatedStickies = afterObjects.filter((o) => o.type === 'stickyNote')

      // One should have votes, one shouldn't
      const withVotes = duplicatedStickies.filter((o) => o.votesByUser && Object.keys(o.votesByUser).length > 0)
      const withoutVotes = duplicatedStickies.filter((o) => !o.votesByUser || Object.keys(o.votesByUser).length === 0)

      expect(withVotes.length).toBe(1)
      expect(withoutVotes.length).toBe(1)
    } finally {
      await deleteTempUser(user)
    }
  })

  test('duplicate does not copy comments from original object', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-dup-comments-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Create a sticky note
      await page.locator('button[title="Add sticky note (S)"]').click()
      await page.waitForTimeout(500)

      // Select the sticky
      const firstSticky = page.locator('[data-testid^="sticky-"]').first()
      await expect(firstSticky).toBeVisible()
      await firstSticky.click()

      // Open comments panel
      const commentsTab = page.locator('text=Comments')
      await expect(commentsTab).toBeVisible()
      await commentsTab.click()

      // Add a comment
      const commentInput = page.locator('textarea[placeholder*="comment"], textarea[placeholder*="Comment"]')
      await expect(commentInput).toBeVisible()
      await commentInput.fill('This is a test comment')

      const submitButton = page.locator('button:has-text("Send"), button:has-text("Post")').first()
      await expect(submitButton).toBeVisible()
      await submitButton.click()

      // Verify comment appears in Firestore
      await page.waitForTimeout(500)
      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const originalSticky = initialObjects.find((o: any) => o.type === 'stickyNote')!
      expect(originalSticky.comments?.length).toBeGreaterThan(0)

      // Duplicate using keyboard shortcut
      await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+d')

      // Wait for duplicate to appear
      await page.waitForTimeout(500)

      const afterObjects = await fetchBoardObjects(boardId, user.idToken)
      const duplicatedStickies = afterObjects.filter((o) => o.type === 'stickyNote')

      // One should have comments, one shouldn't
      const withComments = duplicatedStickies.filter((o) => o.comments && o.comments.length > 0)
      const withoutComments = duplicatedStickies.filter((o) => !o.comments || o.comments.length === 0)

      expect(withComments.length).toBe(1)
      expect(withoutComments.length).toBe(1)
    } finally {
      await deleteTempUser(user)
    }
  })

  test('duplicate copies visual properties (text, color)', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-dup-visual-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Create a sticky note
      await page.locator('button[title="Add sticky note (S)"]').click()
      await page.waitForTimeout(500)

      // Get the first sticky note
      const firstSticky = page.locator('[data-testid^="sticky-"]').first()
      await expect(firstSticky).toBeVisible()

      // Change its text
      await firstSticky.dblclick()
      const textArea = page.locator('textarea').first()
      await textArea.fill('Test content')
      await page.keyboard.press('Enter')

      // Change its color to red
      await firstSticky.click()
      const colorRed = page.locator('[data-color="red"]')
      await colorRed.click()

      // Get initial object state
      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const originalSticky = initialObjects.find((o) => o.type === 'stickyNote')!
      expect(originalSticky.text).toBe('Test content')
      expect(originalSticky.color).toBe('red')

      // Duplicate using keyboard shortcut
      await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+d')

      // Wait for duplicate to appear
      await page.waitForTimeout(500)

      const afterObjects = await fetchBoardObjects(boardId, user.idToken)
      const duplicatedStickies = afterObjects.filter((o) => o.type === 'stickyNote')

      // Both should have the same text and color
      expect(duplicatedStickies).toHaveLength(2)

      for (const sticky of duplicatedStickies) {
        expect(sticky.text).toBe('Test content')
        expect(sticky.color).toBe('red')
      }
    } finally {
      await deleteTempUser(user)
    }
  })

  test('duplicate offsets position by 24px', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-dup-offset-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Create a sticky note
      await page.locator('button[title="Add sticky note (S)"]').click()
      await page.waitForTimeout(500)

      // Get initial object state
      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const originalSticky = initialObjects.find((o) => o.type === 'stickyNote')!
      const originalPos = originalSticky.position

      // Duplicate using keyboard shortcut
      await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+d')

      // Wait for duplicate to appear
      await page.waitForTimeout(500)

      const afterObjects = await fetchBoardObjects(boardId, user.idToken)
      const duplicatedStickies = afterObjects.filter((o) => o.type === 'stickyNote')

      // Find the duplicate (different id, same text)
      const duplicate = duplicatedStickies.find((o) => o.id !== originalSticky.id)!
      expect(duplicate.position.x).toBe(originalPos.x + 24)
      expect(duplicate.position.y).toBe(originalPos.y + 24)
    } finally {
      await deleteTempUser(user)
    }
  })
})
