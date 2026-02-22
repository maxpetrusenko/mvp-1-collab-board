import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const addStickyAndOpenContext = async (page: Page) => {
  await page.locator('button[title="Add sticky note (S)"]').click()
  await expect(page.getByTestId('object-color-picker')).toBeVisible()
}

const waitForNewestObject = async (
  boardId: string,
  idToken: string,
  objectType: string,
  timeoutMs = 8_000,
): Promise<BoardObject> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const objects = await fetchBoardObjects(boardId, idToken)
    const target = newestObjectByType(objects, objectType)
    if (target?.position && target?.size) {
      return target
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Newest ${objectType} object with position metadata was not found in time`)
}

const selectObjectCenter = async (page: Page, boardObject: BoardObject) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Board canvas bounds unavailable')
  }
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Board object missing position metadata')
  }
  const centerX = canvasBox.x + boardObject.position.x + boardObject.size.width / 2
  const centerY = canvasBox.y + boardObject.position.y + boardObject.size.height / 2
  await page.mouse.click(centerX, centerY)
}

const getObjectColorSwatch = (page: Page, colorLabel: string) =>
  page.getByLabel(new RegExp(`color to ${colorLabel}$`, 'i')).first()

test.describe('Color changes', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
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
    await addStickyAndOpenContext(page)

    const blueSwatch = getObjectColorSwatch(page, 'blue')
    await blueSwatch.click()
    await expect(blueSwatch).toHaveClass(/active/)
  })

  test('keeps sticky color controls visible after creating another sticky', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-sticky-shape-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await addStickyAndOpenContext(page)
    await page.locator('button[title="Add sticky note (S)"]').click()
    const newestSticky = await waitForNewestObject(boardId, user.idToken, 'stickyNote')
    await selectObjectCenter(page, newestSticky)
    await expect(page.getByTestId('object-color-picker')).toBeVisible()
    await expect(getObjectColorSwatch(page, 'red')).toBeVisible()
    await expect(getObjectColorSwatch(page, 'blue')).toBeVisible()
  })

  test('shows all five sticky color options when sticky is selected', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-options-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await addStickyAndOpenContext(page)
    await expect(page.getByTestId('object-color-picker').locator('.swatch-button')).toHaveCount(5)

    const stickyPaletteLabels = ['yellow', 'orange', 'red', 'green', 'blue']
    for (const colorLabel of stickyPaletteLabels) {
      await expect(getObjectColorSwatch(page, colorLabel)).toBeVisible()
    }
  })

  test('changes standalone text object color from swatch palette', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-color-text-${Date.now()}`
    const textValue = `Text color ${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await page.getByTestId('add-text-button').click()
    await expect(page.getByTestId('text-create-popover')).toBeVisible()
    await page.getByTestId('text-create-input').fill(textValue)
    await page.getByTestId('text-create-submit').click()

    const newestText = await waitForNewestObject(boardId, user.idToken, 'text')
    await selectObjectCenter(page, newestText)
    await expect(page.getByTestId('object-color-picker')).toBeVisible()

    const crimsonSwatch = getObjectColorSwatch(page, 'crimson')
    await crimsonSwatch.click()
    await expect(crimsonSwatch).toHaveClass(/active/)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const updated = objects.find((object) => object.id === newestText.id)
        if (!updated) {
          return ''
        }
        return `${updated.text || ''}:${updated.color || ''}`
      })
      .toBe(`${textValue}:#dc2626`)
  })
})
