import { test, expect } from '@playwright/test'
import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'

const APP_URL = 'https://mvp-1-collab-board.web.app'

test.describe('CollabBoard MVP E2E', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('text=Sign in with Google')).toBeVisible()
  })

  test('board URL routing redirects to login when unauthed', async ({ page }) => {
    await page.goto(`${APP_URL}/b/test-board-123`)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('text=Sign in with Google')).toBeVisible()
  })

  test('app title and meta elements present', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page).toHaveTitle(/app/)
  })

  test('root path loads', async ({ page }) => {
    await page.goto(APP_URL)
    // Root should load (redirects to /b/{boardId} or /login via client routing)
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('CollabBoard Authenticated', () => {
  let testUser: Awaited<ReturnType<typeof createTempUser>> | null = null
  const boardId = `pw-ui-${Date.now()}`

  test.beforeAll(async () => {
    testUser = await createTempUser()
  })

  test.afterAll(async () => {
    if (!testUser) {
      return
    }
    await deleteTempUser(testUser.idToken)
  })

  test.beforeEach(async ({ page }) => {
    if (!testUser) {
      throw new Error('Test user was not created')
    }
    await loginWithEmail(page, APP_URL, testUser.email, testUser.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
  })

  test('board loads with canvas', async ({ page }) => {
    await expect(page.locator('.board-stage')).toBeVisible()
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
  })

  test('create buttons exist', async ({ page }) => {
    await expect(page.locator('button:has-text("Add Sticky")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Frame")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Rectangle")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Connector")')).toBeVisible()
    await expect(page.locator('button:has-text("Undo")')).toBeVisible()
    await expect(page.locator('button:has-text("Export PNG")')).toBeVisible()
  })

  test('AI panel exists', async ({ page }) => {
    await expect(page.locator('.ai-panel')).toBeVisible()
    await expect(page.locator('.ai-input')).toBeVisible()
  })

  test('presence strip visible', async ({ page }) => {
    await expect(page.locator('.presence-strip')).toBeVisible()
  })
})
