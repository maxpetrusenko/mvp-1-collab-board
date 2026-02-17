import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const deleteButtonSelector = 'button[aria-label="Delete selected object"]'

const clickObjectCenter = async (page: Page, boardObject: BoardObject) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox || !boardObject.position || !boardObject.size) {
    throw new Error('Object center cannot be resolved')
  }

  const centerX = canvasBox.x + (boardObject.position.x ?? 0) + ((boardObject.size.width ?? 180) / 2)
  const centerY = canvasBox.y + (boardObject.position.y ?? 0) + ((boardObject.size.height ?? 110) / 2)
  await page.mouse.click(centerX, centerY)
}

const createStickyAndResolve = async (page: Page, boardId: string, idToken: string) => {
  await page.locator('button[title="Add sticky note (S)"]').click()

  let sticky: BoardObject | null = null
  await expect
    .poll(async () => {
      const objects = await fetchBoardObjects(boardId, idToken)
      sticky = newestObjectByType(objects, 'stickyNote')
      return sticky?.id || ''
    })
    .not.toBe('')

  if (!sticky) {
    throw new Error('Sticky note not created')
  }

  return sticky
}

test.describe('Object deletion', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('deletes selected object using toolbar delete button', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-delete-toolbar-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const sticky = await createStickyAndResolve(page, boardId, user.idToken)
    await clickObjectCenter(page, sticky)
    await page.locator(deleteButtonSelector).click()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.id === sticky.id)
      })
      .toBe(false)
  })

  test('deletes selected object with Delete key', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-delete-key-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const sticky = await createStickyAndResolve(page, boardId, user.idToken)
    await clickObjectCenter(page, sticky)
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.id === sticky.id)
      })
      .toBe(false)
  })

  test('deletes selected object with Backspace key', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-delete-backspace-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const sticky = await createStickyAndResolve(page, boardId, user.idToken)
    await clickObjectCenter(page, sticky)
    await page.keyboard.press('Backspace')

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.id === sticky.id)
      })
      .toBe(false)
  })

  test('delete button is disabled with no current selection', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-delete-disabled-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const deleteButton = page.locator(deleteButtonSelector)
    await expect(deleteButton).toBeDisabled()

    const sticky = await createStickyAndResolve(page, boardId, user.idToken)
    await clickObjectCenter(page, sticky)
    await expect(deleteButton).toBeEnabled()

    const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
    if (!canvasBox) {
      throw new Error('Canvas bounds unavailable')
    }

    await page.mouse.click(canvasBox.x + 12, canvasBox.y + 12)
    await expect(deleteButton).toBeDisabled()
  })
})
