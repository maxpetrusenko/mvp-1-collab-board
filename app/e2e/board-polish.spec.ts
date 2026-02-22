import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Board polish tasks', () => {
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

  test('T-060: boards panel exposes rename action for owner boards', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-rename-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await page.getByTestId('open-boards-panel').click()
    await expect(page.getByTestId('boards-panel')).toBeVisible()

    const ownerRow = page.getByTestId(`board-list-item-${boardId}`)
    await expect(ownerRow).toBeVisible()
    await expect(page.getByTestId(`board-name-${boardId}`)).toBeVisible()

    const renameButton = ownerRow.getByRole('button', { name: /Rename board/i })
    await expect(renameButton).toBeVisible()
    await expect(renameButton).toBeEnabled()

    const currentUrl = page.url()
    await renameButton.click()
    await expect(page).toHaveURL(currentUrl)
    await expect(page.getByTestId('boards-panel')).toBeVisible()
  })

  test('T-061: slash command palette creates sticky notes', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-command-palette-${Date.now()}`

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
  })

  test('T-113: current board name supports inline rename from main board header', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-header-rename-${Date.now()}`
    const renamedTitle = `Header Renamed ${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await page.getByTestId('current-board-name').dblclick()
    const renameInput = page.getByTestId('current-board-name-input')
    await expect(renameInput).toBeVisible()
    await renameInput.fill(renamedTitle)
    await renameInput.press('Enter')

    await expect(page.getByTestId('current-board-name')).toHaveText(renamedTitle)
    await page.getByTestId('open-boards-panel').click()
    await expect(page.getByTestId(`board-name-${boardId}`)).toHaveText(renamedTitle)
  })

  test('T-114: header no longer shows Firebase LWW or Connected labels', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-header-labels-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await expect(page.locator('.board-header').getByText('Firebase LWW', { exact: true })).toHaveCount(0)
    await expect(page.locator('.board-header').getByText('Connected', { exact: true })).toHaveCount(0)
    await expect
      .poll(async () => page.getByTestId('connection-status-pill').count(), {
        timeout: 10_000,
        message: 'connection status pill should disappear once synced',
      })
      .toBe(0)
  })
})
