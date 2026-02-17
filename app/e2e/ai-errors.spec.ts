import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-chat-widget .ai-panel'

const openAiWidgetIfNeeded = async (page: Page) => {
  const launcher = page.getByTestId('ai-chat-widget-launcher')
  if (await launcher.count()) {
    await launcher.click()
  }
}

const submitAiCommand = async (page: Page, command: string) => {
  const aiInput = page.locator(`${AI_PANEL} .ai-input`).first()
  await expect(aiInput).toBeVisible()
  await aiInput.fill(command)
  await page.locator(AI_PANEL).getByRole('button', { name: 'Send Command' }).click()
}

test.describe('AI errors', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('shows unsupported-command error for unrecognized request', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-error-unsupported-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    await submitAiCommand(page, 'turn this board into a quantum spreadsheet')
    const errorMessage = page.locator('.ai-chat-widget .ai-message.error')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('Unsupported command')

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.length
      })
      .toBe(0)
  })

  test('shows error for malformed AI command syntax', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-error-malformed-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    await submitAiCommand(page, 'create a blue octagon at position 40,40')
    const errorMessage = page.locator('.ai-chat-widget .ai-message.error')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('Unsupported command')

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.length
      })
      .toBe(0)
  })

  test('recovers from error and succeeds on valid retry command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-error-recovery-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    await submitAiCommand(page, 'make all my ideas perfect instantly')
    await expect(page.locator('.ai-chat-widget .ai-message.error')).toBeVisible()

    const recoveryToken = `ai-recovery-${Date.now()}`
    await submitAiCommand(page, `add green sticky note saying ${recoveryToken}`)
    await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()

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
