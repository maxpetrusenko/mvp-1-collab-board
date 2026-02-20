import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'

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

    await submitAiCommand(page, `add green sticky note saying ai-ui-${Date.now()}`)
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.text?.includes('ai-ui-'))
      })
      .toBe(true)

    await submitAiCommand(page, 'add circle')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.shapeType === 'circle')
      })
      .toBe(true)
  })

  test('creates two circle stickies from a numbered multi-sticky command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-multi-sticky-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, 'create two stickers with circle form one say 1 another says 2')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const circleStickies = objects.filter(
          (object) => object.type === 'stickyNote' && object.shapeType === 'circle',
        )
        const labels = new Set(
          circleStickies.map((object) => String(object.text || '').trim()).filter((text) => text.length > 0),
        )
        return {
          circleStickyCount: circleStickies.length,
          hasOne: labels.has('1'),
          hasTwo: labels.has('2'),
        }
      })
      .toEqual({
        circleStickyCount: 2,
        hasOne: true,
        hasTwo: true,
      })
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

    await submitAiCommand(page, 'change the sticky note color to blue')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.id === stickyId)
        return sticky?.color || ''
      })
      .toBe('#93c5fd')
  })

  test('creates red sticky note via AI command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-red-sticky-${Date.now()}`
    const testText = `red-sticky-test-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Command: "add red sticky note" with text
    await submitAiCommand(page, `add red sticky note saying ${testText}`)
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    // Verify sticky note created with red color and correct text
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const redSticky = objects.find(
          (object) => object.type === 'stickyNote' && object.color === '#fca5a5' && object.text?.includes(testText)
        )
        return redSticky || null
      })
      .toBeTruthy()
  })

  test('creates red sticky note when command includes numeric count prefix', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-red-sticky-count-${Date.now()}`
    const testText = `red-sticky-count-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, `add 1 red sticky note saying ${testText}`)
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const redSticky = objects.find(
          (object) => object.type === 'stickyNote' && object.color === '#fca5a5' && object.text?.includes(testText),
        )
        return redSticky || null
      })
      .toBeTruthy()
  })

  test('creates green circle sticky from color-and-text instruction phrasing', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-green-round-${Date.now()}`
    const testText = `yo yo yo ${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await submitAiCommand(page, `add round sticky note with green color and text: ${testText}`)
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find(
          (object) =>
            object.type === 'stickyNote' &&
            object.color === '#86efac' &&
            object.shapeType === 'circle' &&
            object.text?.includes(testText),
        )
        return sticky || null
      })
      .toBeTruthy()
  })

  test('AI command completes within 2 seconds', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-perf-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const startTime = Date.now()
    await submitAiCommand(page, 'add yellow sticky note saying performance test')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()
    const endTime = Date.now()

    const duration = endTime - startTime
    expect(duration).toBeLessThan(4000) // 4s allowance for network latency (2s target + buffer)
  })

  test('creates sticky at specific screen position via AI', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-position-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Test position understanding: "add sticky at top left"
    await submitAiCommand(page, 'add blue sticky note at top left')
    await expect(page.locator(`${AI_PANEL} .ai-message.success`)).toBeVisible()

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.color === '#93c5fd')
      })
      .toBe(true)
  })
})
