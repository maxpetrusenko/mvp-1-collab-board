import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

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

test.describe('AI command UI', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('submits command from chat widget and creates board object', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-ui-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiWidgetIfNeeded(page)

    await submitAiCommand(page, `add green sticky note saying ai-ui-${Date.now()}`)
    await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.text?.includes('ai-ui-'))
      })
      .toBe(true)

    await submitAiCommand(page, 'add circle')
    await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.shapeType === 'circle')
      })
      .toBe(true)
  })

  test('changes sticky color via AI command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-color-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await page.locator('button[title="Add sticky note (S)"]').click()

    let stickyId = ''
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = newestObjectByType(objects, 'stickyNote')
        stickyId = sticky?.id || ''
        return sticky?.id || ''
      })
      .not.toBe('')

    await openAiWidgetIfNeeded(page)
    await submitAiCommand(page, 'change the sticky note color to blue')
    await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.id === stickyId)
        return sticky?.color || ''
      })
      .toBe('#93c5fd')
  })
})
