import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Template chooser', () => {
  test.setTimeout(180_000)

  test('T-062: template chooser inserts retro layout objects', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-template-chooser-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.getByTestId('template-chooser-button').click()
      await expect(page.getByTestId('template-chooser')).toBeVisible()
      await page.getByTestId('template-option-retro').click()
      await expect(page.getByTestId('template-chooser')).toBeHidden()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return {
            total: objects.length,
            frames: countByType(objects, 'frame'),
            stickies: countByType(objects, 'stickyNote'),
          }
        })
        .toEqual({
          total: 6,
          frames: 3,
          stickies: 3,
        })
    } finally {
      await cleanupTestUser(user)
    }
  })

  test('T-062: mindmap template creates attached connectors between central topic and branches', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-template-mindmap-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.getByTestId('template-chooser-button').click()
      await expect(page.getByTestId('template-chooser')).toBeVisible()
      await page.getByTestId('template-option-mindmap').click()
      await expect(page.getByTestId('template-chooser')).toBeHidden()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const connectors = objects.filter((object) => object.type === 'connector')
          const allAttached =
            connectors.length > 0 &&
            connectors.every(
              (connector) =>
                typeof connector.fromObjectId === 'string' &&
                connector.fromObjectId.length > 0 &&
                typeof connector.toObjectId === 'string' &&
                connector.toObjectId.length > 0 &&
                typeof connector.fromAnchor === 'string' &&
                connector.fromAnchor.length > 0 &&
                typeof connector.toAnchor === 'string' &&
                connector.toAnchor.length > 0,
            )
          return {
            shapes: countByType(objects, 'shape'),
            connectors: connectors.length,
            allAttached,
          }
        })
        .toEqual({
          shapes: 5,
          connectors: 4,
          allAttached: true,
        })
    } finally {
      await cleanupTestUser(user)
    }
  })
})
