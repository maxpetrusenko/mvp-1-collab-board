import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import {
  openAiPanelIfNeeded,
  runAiMutationCommandWithRetry,
  submitAiCommandAndWaitForResponse,
} from './helpers/ai-command'
import { countByType, fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'

test.describe('AI conversational responses', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('returns an AI text response for non-board prompts with valid API payload', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-conversation-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)
    const conversationExecution = await submitAiCommandAndWaitForResponse(page, {
      boardId,
      command: '2+2',
      panelSelector: AI_PANEL,
    })
    expect(conversationExecution.httpStatus).toBe(200)
    expect(['success', 'warning']).toContain(String(conversationExecution.payload?.status || '').toLowerCase())
    const resultMessage = String(
      conversationExecution.payload?.result?.aiResponse ||
        conversationExecution.payload?.result?.message ||
        '',
    ).trim()
    expect(resultMessage.length).toBeGreaterThan(0)
    const executedTools = conversationExecution.payload?.result?.executedTools
    expect(Array.isArray(executedTools)).toBe(true)
    const objectCount = Number(conversationExecution.payload?.result?.objectCount)
    expect(Number.isFinite(objectCount)).toBe(true)
    expect(objectCount).toBeGreaterThanOrEqual(0)
  })

  test('keeps working for board mutations after a conversational response', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-conversation-then-board-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const conversationExecution = await submitAiCommandAndWaitForResponse(page, {
      boardId,
      command: 'What is 3 + 5?',
      panelSelector: AI_PANEL,
    })
    expect(conversationExecution.httpStatus).toBe(200)
    expect(['success', 'warning']).toContain(String(conversationExecution.payload?.status || '').toLowerCase())

    const recoveryToken = `ai-conversation-recovery-${Date.now()}`
    const mutationExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add green sticky note saying ${recoveryToken}`,
      panelSelector: AI_PANEL,
    })
    expect(mutationExecution.httpStatus).toBe(200)

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
