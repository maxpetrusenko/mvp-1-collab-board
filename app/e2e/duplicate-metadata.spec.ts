import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const duplicateShortcut = process.platform === 'darwin' ? 'Meta+D' : 'Control+D'

const clickBoardCenter = async (page: Page) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
}

const fitBoardViewport = async (page: Page) => {
  await page.getByRole('button', { name: 'Fit all objects' }).click()
  await page.waitForTimeout(250)
}

const waitForSticky = async (boardId: string, idToken: string) => {
  const sticky = newestObjectByType(await fetchBoardObjects(boardId, idToken), 'stickyNote')
  if (!sticky) {
    throw new Error('Sticky note unavailable')
  }
  return sticky
}

test.describe('Object duplication metadata isolation', () => {
  test.setTimeout(180_000)

  test('DUPLICATE-E2E-001: duplicate keeps visual style but strips votes/comments', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-dup-meta-${Date.now()}`

    try {
      await page.addInitScript(() => {
        window.localStorage.clear()
      })
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add sticky note (S)"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((entry) => entry.type === 'stickyNote').length
        })
        .toBe(1)

      const sourceSticky = await waitForSticky(boardId, user.idToken)
      await fitBoardViewport(page)
      await clickBoardCenter(page)

      await page.locator('button[title="Set shape to Circle"]').click()
      await page.locator('button[title="Set color to blue"]').click()

      await expect
        .poll(async () => {
          const refreshed = await fetchBoardObjects(boardId, user.idToken)
          const updated = refreshed.find((entry) => entry.id === sourceSticky.id)
          return `${updated?.shapeType || ''}:${updated?.color || ''}`
        })
        .toBe('circle:#93c5fd')

      await page.locator('button[aria-label="Toggle voting mode"]').click()
      await clickBoardCenter(page)
      await page.locator('button[aria-label="Toggle voting mode"]').click()
      await expect
        .poll(async () => {
          const refreshed = await fetchBoardObjects(boardId, user.idToken)
          const updated = refreshed.find((entry) => entry.id === sourceSticky.id)
          return Object.keys(updated?.votesByUser || {}).length
        })
        .toBe(1)

      await page.getByRole('button', { name: 'Comments' }).click()
      await page.locator('textarea.comment-input').fill('Duplicate metadata isolation comment')
      await page.getByRole('button', { name: 'Add Comment' }).click()

      await expect
        .poll(async () => {
          const refreshed = await fetchBoardObjects(boardId, user.idToken)
          const updated = refreshed.find((entry) => entry.id === sourceSticky.id)
          return updated?.comments?.length || 0
        })
        .toBe(1)

      await page.keyboard.press(duplicateShortcut)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((entry) => entry.type === 'stickyNote').length
        })
        .toBe(2)

      const allStickies = (await fetchBoardObjects(boardId, user.idToken))
        .filter((entry) => entry.type === 'stickyNote')
        .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0))

      const source = allStickies[0]
      const duplicate = allStickies[1]
      if (!source || !duplicate || !source.position || !duplicate.position) {
        throw new Error('Unable to resolve source and duplicate stickies')
      }

      expect(source.id).not.toBe(duplicate.id)
      expect(source.shapeType).toBe(duplicate.shapeType)
      expect(source.color).toBe(duplicate.color)
      expect(source.text).toBe(duplicate.text)
      expect(duplicate.position.x - source.position.x).toBe(24)
      expect(duplicate.position.y - source.position.y).toBe(24)

      expect(source.comments?.length || 0).toBeGreaterThan(0)
      expect(Object.keys(source.votesByUser || {}).length).toBeGreaterThan(0)
      expect(duplicate.comments?.length || 0).toBe(0)
      expect(Object.keys(duplicate.votesByUser || {}).length).toBe(0)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
