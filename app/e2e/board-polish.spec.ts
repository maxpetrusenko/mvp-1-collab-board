import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardMeta, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Board polish tasks', () => {
  test.setTimeout(180_000)

  test('T-060: board name supports inline rename from boards panel', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-rename-${Date.now()}`
    const renamedTitle = `Renamed ${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.getByTestId('open-boards-panel').click()
      await expect(page.getByTestId('boards-panel')).toBeVisible()

      const boardName = page.getByTestId(`board-name-${boardId}`)
      await boardName.dblclick()
      const renameInput = page.getByTestId(`rename-board-input-${boardId}`)
      await expect(renameInput).toBeVisible()
      await renameInput.fill(renamedTitle)
      await renameInput.press('Enter')

      await expect(page.getByTestId(`board-name-${boardId}`)).toHaveText(renamedTitle)
      await expect
        .poll(async () => {
          const boardMeta = await fetchBoardMeta(boardId, user.idToken)
          return boardMeta?.name || ''
        })
        .toBe(renamedTitle)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('T-061: slash command palette creates sticky notes', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-command-palette-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.keyboard.press('/')
      await expect(page.getByTestId('command-palette')).toBeVisible()
      await page.getByTestId('command-palette-input').fill('sticky')
      await page.getByTestId('command-palette-item-create-sticky').click()
      await expect(page.getByTestId('command-palette')).toBeHidden()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'stickyNote')
        })
        .toBeGreaterThan(0)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
