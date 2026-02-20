import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'

const submitAiCommand = async (page: Page, command: string) => {
  const aiInput = page.locator(`${AI_PANEL} .ai-input`).first()
  await expect(aiInput).toBeVisible()
  await aiInput.fill(command)
  await page.locator(AI_PANEL).getByRole('button', { name: 'Send Command' }).click()
}

test.describe('AI conversational responses', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('returns an AI text response for non-board prompts without mutating the board', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-conversation-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, '2+2')
    const successMessage = page.locator(`${AI_PANEL} .ai-message.success`)
    await expect(successMessage).toBeVisible()
    await expect(successMessage).toContainText(/4|temporarily unavailable/i)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.length
      })
      .toBe(0)
  })

  test('keeps working for board mutations after a conversational response', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-conversation-then-board-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'What is 3 + 5?')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    const recoveryToken = `ai-conversation-recovery-${Date.now()}`
    await submitAiCommand(page, `add green sticky note saying ${recoveryToken}`)
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const stickyCount = countByType(objects, 'stickyNote')
        const hasRecoverySticky = objects.some(
          (object) => object.type === 'stickyNote' && object.text?.includes(recoveryToken),
        )
        return { stickyCount, hasRecoverySticky }
      })
      .toEqual({ stickyCount: 1, hasRecoverySticky: true })
  })
})
