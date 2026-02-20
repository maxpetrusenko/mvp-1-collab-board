import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, getUserIdFromIdToken, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardMeta, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Board duplicate', () => {
  test.setTimeout(180_000)

  test('T-069: duplicate board creates owned copy with cloned objects', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const sourceBoardId = `pw-board-duplicate-${Date.now()}`
    const ownerId = getUserIdFromIdToken(user.idToken)

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${sourceBoardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const textValue = `Duplicate text ${Date.now()}`
      await page.locator('button[title="Add sticky note (S)"]').click()
      await page.getByTestId('add-text-button').click()
      await expect(page.getByTestId('text-create-popover')).toBeVisible()
      await page.getByTestId('text-create-input').fill(textValue)
      await page.getByTestId('text-create-submit').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(sourceBoardId, user.idToken)
          return {
            total: objects.length,
            sticky: countByType(objects, 'stickyNote'),
            hasText: objects.some((entry) => entry.type === 'text' && entry.text === textValue),
          }
        })
        .toEqual({ total: 2, sticky: 1, hasText: true })

      await expect
        .poll(async () => {
          const metadata = await fetchBoardMeta(sourceBoardId, user.idToken)
          return metadata?.name || ''
        })
        .not.toBe('')

      const sourceMeta = await fetchBoardMeta(sourceBoardId, user.idToken)
      if (!sourceMeta || !sourceMeta.name) {
        throw new Error('Source board metadata not ready for duplication assertions')
      }

      const sourceObjects = await fetchBoardObjects(sourceBoardId, user.idToken)
      const sourceStickyCount = countByType(sourceObjects, 'stickyNote')
      const sourceTextCount = countByType(sourceObjects, 'text')

      await page.getByTestId('open-boards-panel').click()
      await expect(page.getByTestId('boards-panel')).toBeVisible()
      await page.getByTestId(`duplicate-board-${sourceBoardId}`).click()

      await expect
        .poll(() => {
          const currentPath = new URL(page.url()).pathname
          return currentPath.replace(/^\/b\//, '')
        })
        .not.toBe(sourceBoardId)

      const duplicatedBoardId = new URL(page.url()).pathname.replace(/^\/b\//, '')
      expect(duplicatedBoardId).toBeTruthy()

      await expect
        .poll(async () => {
          const duplicatedMeta = await fetchBoardMeta(duplicatedBoardId, user.idToken)
          const duplicatedObjects = await fetchBoardObjects(duplicatedBoardId, user.idToken)
          return {
            name: duplicatedMeta?.name || '',
            ownerId: duplicatedMeta?.ownerId || '',
            sharedWithCount: duplicatedMeta?.sharedWith?.length || 0,
            sticky: countByType(duplicatedObjects, 'stickyNote'),
            text: countByType(duplicatedObjects, 'text'),
            total: duplicatedObjects.length,
            hasDuplicatedText: duplicatedObjects.some(
              (entry) => entry.type === 'text' && entry.text === textValue,
            ),
          }
        })
        .toEqual({
          name: `${sourceMeta.name} (Copy)`,
          ownerId,
          sharedWithCount: 0,
          sticky: sourceStickyCount,
          text: sourceTextCount,
          total: sourceObjects.length,
          hasDuplicatedText: true,
        })
    } finally {
      await cleanupTestUser(user)
    }
  })
})
