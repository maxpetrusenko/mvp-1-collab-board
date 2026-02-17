import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { countByType, fetchBoardObjects } from '../helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-chat-widget .ai-panel'

const SIMPLE_AI_SLA = { target: 2_500, warning: 4_000, critical: 5_000 }
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

const openAiWidgetIfNeeded = async (page: Page) => {
  const launcher = page.getByTestId('ai-chat-widget-launcher')
  if (await launcher.count()) {
    await launcher.click()
  }
}

const submitCommand = async (page: Page, command: string) => {
  const input = page.locator(`${AI_PANEL} .ai-input`).first()
  await expect(input).toBeVisible()
  await input.fill(command)
  await page.locator(AI_PANEL).getByRole('button', { name: 'Send Command' }).click()
}

test.describe('Performance: AI response', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('simple AI command responds within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-ai-simple-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    const initialStickyCount = countByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')
    const startedAt = Date.now()
    await submitCommand(page, `add green sticky note saying perf-simple-${Date.now()}`)

    await expect
      .poll(async () => {
        const stickyCount = countByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')
        return stickyCount
      })
      .toBeGreaterThan(initialStickyCount)

    const elapsedMs = Date.now() - startedAt
    console.log(`[PERF] Simple AI command response: ${elapsedMs}ms`)
    annotateSla(testInfo, 'ai-simple-command', elapsedMs, SIMPLE_AI_SLA)
    expect(elapsedMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.critical)
  })

  test('complex AI command responds within critical SLA', async ({ page }, testInfo) => {
    if (!user) {
      throw new Error('Shared performance test user unavailable')
    }
    const boardId = `pw-perf-ai-complex-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    const initialObjects = await fetchBoardObjects(boardId, user.idToken)
    const initialShapeCount = countByType(initialObjects, 'shape')
    const initialStickyCount = countByType(initialObjects, 'stickyNote')

    const startedAt = Date.now()
    await submitCommand(page, 'create a SWOT template')

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
