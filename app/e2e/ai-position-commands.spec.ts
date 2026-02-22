import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'

const submitAiCommand = async (page: Page, command: string) => {
  const aiInput = page.locator(`${AI_PANEL} .ai-input`).first()
  await expect(aiInput).toBeVisible()
  await aiInput.fill(command)
  await page.locator(AI_PANEL).getByRole('button', { name: 'Send Command' }).click()
}

const expectAiSuccess = async (page: Page) => {
  await expect(page.getByTestId('ai-status-pill')).toHaveText('success')
  await expect(page.locator(`${AI_PANEL} .ai-message.error`)).toHaveCount(0)
  await expect(page.locator(`${AI_PANEL} .ai-message.warning`)).toHaveCount(0)
}

test.describe('AI position commands', () => {
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

  test('creates sticky at top left position', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-pos-topleft-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'add blue sticky note at top left')
    await expectAiSuccess(page)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.type === 'stickyNote' && object.color === '#93c5fd')
        return sticky ? sticky.position : null
      })
      .toMatchObject({ x: 120, y: 120 })
  })

  test('creates sticky at bottom right position', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-pos-bottomright-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'add red sticky note at bottom right')
    await expectAiSuccess(page)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.type === 'stickyNote' && object.color === '#fca5a5')
        return sticky ? sticky.position : null
      })
      .toMatchObject({ x: 1620, y: 880 })
  })

  test('creates sticky at center position', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-pos-center-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'add green sticky note in the center')
    await expectAiSuccess(page)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.type === 'stickyNote' && object.color === '#86efac')
        return sticky ? sticky.position : null
      })
      .toMatchObject({ x: 870, y: 485 })
  })

  test('creates sticky at top right position', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-pos-topright-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'add yellow sticky note at top right')
    await expectAiSuccess(page)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.type === 'stickyNote' && object.color === '#fde68a')
        return sticky ? sticky.position : null
      })
      .toMatchObject({ x: 1620, y: 120 })
  })
})
