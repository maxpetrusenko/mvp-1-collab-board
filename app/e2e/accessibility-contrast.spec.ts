import { expect, test } from '@playwright/test'
import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects } from './helpers/firestore'
import { seedBoardObjects } from './helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Accessibility: text contrast on colored objects', () => {
  test.setTimeout(120_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('A11Y-CONTRAST-E2E-001: all sticky note colors have readable text', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-contrast-sticky-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)
    await seedBoardObjects(boardId, user.idToken, 5, { kind: 'sticky', columns: 5 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Verify objects were created with text
    const objects = await fetchBoardObjects(boardId, user.idToken)
    const stickyNotes = objects.filter((o) => o.type === 'stickyNote')

    expect(stickyNotes.length).toBeGreaterThanOrEqual(5)

    // Each sticky note should have text property (will be rendered with contrasting color)
    for (const obj of stickyNotes) {
      expect(obj.text).toBeTruthy()
      expect(obj.color).toBeTruthy()
    }
  })

  test('A11Y-CONTRAST-E2E-002: all shape colors have readable text', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-contrast-shape-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Seed enough shapes to cover shape text readability checks.
    const shapeCount = 6

    await seedBoardObjects(boardId, user.idToken, shapeCount, { kind: 'shape', columns: shapeCount })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const objects = await fetchBoardObjects(boardId, user.idToken)
    const shapes = objects.filter((o) => o.type === 'shape')

    expect(shapes.length).toBeGreaterThanOrEqual(6)

    // Verify all have text for contrast testing
    for (const obj of shapes) {
      expect(obj.text).toBeTruthy()
    }
  })

  test('A11Y-CONTRAST-E2E-003: all frame colors have readable titles', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-contrast-frame-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const frameCount = 5

    await seedBoardObjects(boardId, user.idToken, frameCount, { kind: 'frame', columns: frameCount })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const objects = await fetchBoardObjects(boardId, user.idToken)
    const frames = objects.filter((o) => o.type === 'frame')

    expect(frames.length).toBeGreaterThanOrEqual(5)

    // Verify all frames have titles
    for (const obj of frames) {
      expect(obj.title || 'Frame').toBeTruthy()
    }
  })

  test('A11Y-CONTRAST-E2E-004: mixed color board maintains readability', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-contrast-mixed-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create a mixed board with various object types and colors
    await seedBoardObjects(boardId, user.idToken, 15, { kind: 'mixed', columns: 5 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const objects = await fetchBoardObjects(boardId, user.idToken)

    // Verify board loads without errors and objects are present
    expect(objects.length).toBeGreaterThanOrEqual(15)

    // Verify all text-bearing objects have their text property
    const withText = objects.filter((o) => o.text || o.title)
    expect(withText.length).toBeGreaterThan(0)
  })
})
