import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const resolveObjectCenter = async (page: Page, boardObject: BoardObject) => {
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Object center cannot be resolved')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  return {
    x: canvasBox.x + boardObject.position.x + boardObject.size.width / 2,
    y: canvasBox.y + boardObject.position.y + boardObject.size.height / 2,
  }
}

const confettiCount = async (page: Page) =>
  Number.parseInt((await page.getByTestId('confetti-particle-count').textContent()) || '0', 10) || 0

test.describe('Voting confetti', () => {
  test.setTimeout(180_000)

  test('voting mode emits confetti on vote add and not on vote removal', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-vote-confetti-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await expect(page.getByTestId('confetti-particle-count')).toHaveText('0')
      await page.locator('button[title="Add sticky note (S)"]').click()

      let stickyId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      const sticky = (await fetchBoardObjects(boardId, user.idToken)).find((object) => object.id === stickyId)
      if (!sticky) {
        throw new Error('Sticky note not found after creation')
      }

      const center = await resolveObjectCenter(page, sticky)
      await page.locator('button[title="Toggle voting mode (V)"]').click()
      await page.mouse.click(center.x, center.y)

      await expect.poll(() => confettiCount(page)).toBeGreaterThan(0)
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const current = objects.find((object) => object.id === stickyId)
          return Object.keys(current?.votesByUser || {}).length
        })
        .toBe(1)

      await expect.poll(() => confettiCount(page), { timeout: 6_000 }).toBe(0)

      await page.mouse.click(center.x, center.y)
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const current = objects.find((object) => object.id === stickyId)
          return Object.keys(current?.votesByUser || {}).length
        })
        .toBe(0)

      await expect.poll(() => confettiCount(page), { timeout: 1_200 }).toBe(0)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
