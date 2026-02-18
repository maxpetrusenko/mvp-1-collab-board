import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const clickObjectCenter = async (page: Page, boardObject: BoardObject) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox || !boardObject.position || !boardObject.size) {
    throw new Error('Object center cannot be resolved')
  }

  const centerX = canvasBox.x + (boardObject.position.x ?? 0) + ((boardObject.size.width ?? 180) / 2)
  const centerY = canvasBox.y + (boardObject.position.y ?? 0) + ((boardObject.size.height ?? 110) / 2)
  await page.mouse.click(centerX, centerY)
}

test.describe('Color changes', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('changes sticky color from swatch palette', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-sticky-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await page.locator('button[title="Add sticky note (S)"]').click()

    let sticky: BoardObject | null = null
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        sticky = newestObjectByType(objects, 'stickyNote')
        return sticky?.id || ''
      })
      .not.toBe('')

    if (!sticky) {
      throw new Error('Sticky note not created')
    }

    await clickObjectCenter(page, sticky)
    await page.getByLabel('Set stickyNote color to #93c5fd').click()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.find((object) => object.id === sticky?.id)?.color || ''
      })
      .toBe('#93c5fd')
  })

  test('changes sticky shape and color from swatch palette', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-sticky-shape-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await page.locator('button[title="Add sticky note (S)"]').click()

    let sticky: BoardObject | null = null
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        sticky = newestObjectByType(objects, 'stickyNote')
        return sticky?.id || ''
      })
      .not.toBe('')

    if (!sticky) {
      throw new Error('Sticky note not created')
    }

    await clickObjectCenter(page, sticky)
    await page.locator('button[title="Set shape to Circle"]').click()
    await page.getByLabel('Set stickyNote color to #93c5fd').click()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const latestSticky = objects.find((object) => object.id === sticky?.id)
        return `${latestSticky?.shapeType || ''}:${latestSticky?.color || ''}`
      })
      .toBe('circle:#93c5fd')
  })

  test('shows all six sticky color options when sticky is selected', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-options-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await page.locator('button[title="Add sticky note (S)"]').click()

    let sticky: BoardObject | null = null
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        sticky = newestObjectByType(objects, 'stickyNote')
        return sticky?.id || ''
      })
      .not.toBe('')

    if (!sticky) {
      throw new Error('Sticky note not created')
    }

    await clickObjectCenter(page, sticky)
    await expect(page.locator('.swatch-button')).toHaveCount(6)

    const stickyPalette = ['#fde68a', '#fdba74', '#fca5a5', '#86efac', '#93c5fd', '#c4b5fd']
    for (const color of stickyPalette) {
      await expect(page.getByLabel(`Set stickyNote color to ${color}`)).toBeVisible()
    }
  })
})
