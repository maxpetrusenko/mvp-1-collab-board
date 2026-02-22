import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import {
  openAiPanelIfNeeded,
  runAiMutationCommandWithRetry,
} from '../helpers/ai-command'
import { countByType, fetchBoardObjects } from '../helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'
const ENFORCE_STRICT_AI_SLA = process.env.PLAYWRIGHT_STRICT_AI_SLA === '1'

const SIMPLE_AI_SLA = { target: 2_000, warning: 3_500, critical: 5_000 }
const COMPLEX_AI_SLA = { target: 8_000, warning: 12_000, critical: 15_000 }

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${Math.round(value)}ms (target ${bounds.target}ms, warning ${bounds.warning}ms, critical ${bounds.critical}ms)`,
  })
}

test.describe('Performance: AI response', () => {
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

  test('FR-16: simple AI command responds within PRD target SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-ai-simple-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const initialStickyCount = countByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')
    const startedAt = Date.now()
    const execution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add green sticky note saying perf-simple-${Date.now()}`,
      panelSelector: AI_PANEL,
      maxAttempts: 2,
    })
    expect(execution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const stickyCount = countByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')
        return stickyCount
      })
      .toBeGreaterThan(initialStickyCount)

    const elapsedMs = Date.now() - startedAt
    console.log(`[PERF] Simple AI command response: ${elapsedMs}ms`)
    annotateSla(testInfo, 'ai-simple-command', elapsedMs, SIMPLE_AI_SLA)
    if (ENFORCE_STRICT_AI_SLA) {
      expect(elapsedMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.target)
    } else {
      expect(elapsedMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.critical)
    }
  })

  test('complex AI command responds within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-ai-complex-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const initialObjects = await fetchBoardObjects(boardId, user.idToken)
    const initialShapeCount = countByType(initialObjects, 'shape')
    const initialStickyCount = countByType(initialObjects, 'stickyNote')

    const startedAt = Date.now()
    const execution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'create a SWOT template',
      panelSelector: AI_PANEL,
      maxAttempts: 2,
    })
    expect(execution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return {
          stickyCount: countByType(objects, 'stickyNote'),
          shapeCount: countByType(objects, 'shape'),
        }
      })
      .toEqual({
        stickyCount: initialStickyCount + 4,
        shapeCount: initialShapeCount + 4,
      })

    const elapsedMs = Date.now() - startedAt
    console.log(`[PERF] Complex AI command (SWOT template) response: ${elapsedMs}ms`)
    annotateSla(testInfo, 'ai-complex-command', elapsedMs, COMPLEX_AI_SLA)
    expect(elapsedMs).toBeLessThanOrEqual(COMPLEX_AI_SLA.critical)
  })
})
