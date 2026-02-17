import { test, expect, type Page } from '@playwright/test'
import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const openAiWidgetIfNeeded = async (page: Page) => {
  const launcher = page.getByTestId('ai-chat-widget-launcher')
  if (await launcher.count()) {
    await launcher.click()
  }
}

test.describe('CollabBoard MVP E2E', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.getByTestId('google-signin-button')).toBeVisible()
  })

  test('board URL routing redirects to login when unauthed', async ({ page }) => {
    await page.goto(`${APP_URL}/b/test-board-123`)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('google-signin-button')).toBeVisible()
  })

  test('app title and meta elements present', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page).toHaveTitle(/CollabBoard/i)
  })

  test('root path loads', async ({ page }) => {
    await page.goto(APP_URL)
    // Root should load (redirects to /b/{boardId} or /login via client routing)
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('CollabBoard Authenticated', () => {
  test.setTimeout(180_000)
  let testUser: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null
  const boardId = `pw-ui-${Date.now()}`

  test.beforeAll(async () => {
    testUser = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(testUser)
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
    const syncModePill = page.getByTestId('sync-mode-pill')
    if (await syncModePill.count()) {
      await expect(syncModePill).toHaveText(/Firebase LWW|Yjs Pilot/)
    } else {
      await expect(page.locator('.board-header h1')).toHaveText(/CollabBoard/i)
    }
  })

  test('create buttons exist', async ({ page }) => {
    await expect(page.locator('button[title="Add sticky note (S)"]')).toBeVisible()
    await expect(page.locator('button[title="Add frame (F)"]')).toBeVisible()
    await expect(page.locator('button[title="Add rectangle (R)"]')).toBeVisible()
    await expect(page.locator('button[title="Add connector (C)"]')).toBeVisible()
    await expect(page.locator('button[title="Undo (Cmd+Z)"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-viewport-png"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-viewport-pdf"]')).toBeVisible()
    await expect(page.locator('[data-testid="zoom-percentage"]')).toBeVisible()
  })

  test('AI panel exists', async ({ page }) => {
    await openAiWidgetIfNeeded(page)
    await expect(page.getByTestId('ai-chat-widget')).toBeVisible()
    await expect(page.locator('.ai-panel')).toBeVisible()
    await expect(page.locator('.ai-input')).toBeVisible()
  })

  test('AI chat starts as launcher icon on the right side', async ({ page }) => {
    const launcher = page.getByTestId('ai-chat-widget-launcher')
    await expect(launcher).toBeVisible()
    await expect(page.getByTestId('ai-chat-widget')).toHaveCount(0)
    await expect(launcher.locator('.ai-chat-widget-launcher-icon')).toHaveText('💬')

    const layout = await page.evaluate(() => {
      const widgetRoot = document.querySelector('.ai-chat-widget') as HTMLElement | null
      const launcherButton = document.querySelector(
        '[data-testid="ai-chat-widget-launcher"]',
      ) as HTMLElement | null
      if (!widgetRoot || !launcherButton) {
        return null
      }
      const style = window.getComputedStyle(widgetRoot)
      const rect = launcherButton.getBoundingClientRect()
      return {
        position: style.position,
        right: style.right,
        launcherCenterX: rect.left + rect.width / 2,
        viewportWidth: window.innerWidth,
      }
    })

    expect(layout).not.toBeNull()
    if (!layout) {
      return
    }
    expect(layout.position).toBe('absolute')
    expect(layout.right).not.toBe('auto')
    expect(layout.launcherCenterX).toBeGreaterThan(layout.viewportWidth * 0.5)
  })

  test('AI chat widget can minimize and reopen', async ({ page }) => {
    await openAiWidgetIfNeeded(page)
    await expect(page.getByTestId('ai-chat-widget')).toBeVisible()
    await page.getByLabel('Minimize AI chat panel').click()
    await expect(page.getByTestId('ai-chat-widget-launcher')).toBeVisible()
    await page.getByTestId('ai-chat-widget-launcher').click()
    await expect(page.getByTestId('ai-chat-widget')).toBeVisible()
  })

  test('comments and timeline toggles work independently', async ({ page }) => {
    const commentsButton = page.getByRole('button', { name: 'Comments' })
    const timelineButton = page.getByRole('button', { name: 'Timeline' })
    const commentsPanel = page.locator('.comments-panel')
    const timelinePanel = page.locator('.timeline-panel')

    await expect(commentsPanel).toBeVisible()
    await expect(timelinePanel).toHaveCount(0)
    await expect(commentsButton).toHaveAttribute('aria-pressed', 'true')
    await expect(timelineButton).toHaveAttribute('aria-pressed', 'false')

    await timelineButton.click()
    await expect(commentsPanel).toBeVisible()
    await expect(timelinePanel).toBeVisible()
    await expect(commentsButton).toHaveAttribute('aria-pressed', 'true')
    await expect(timelineButton).toHaveAttribute('aria-pressed', 'true')

    await commentsButton.click()
    await expect(commentsPanel).toHaveCount(0)
    await expect(timelinePanel).toBeVisible()
    await expect(commentsButton).toHaveAttribute('aria-pressed', 'false')
    await expect(timelineButton).toHaveAttribute('aria-pressed', 'true')

    await timelineButton.click()
    await expect(commentsPanel).toHaveCount(0)
    await expect(timelinePanel).toHaveCount(0)
    await expect(page.locator('.side-panel-empty')).toBeVisible()
    await expect(commentsButton).toHaveAttribute('aria-pressed', 'false')
    await expect(timelineButton).toHaveAttribute('aria-pressed', 'false')

    await commentsButton.click()
    await expect(commentsPanel).toBeVisible()
    await expect(page.locator('.side-panel-empty')).toHaveCount(0)
  })

  test('presence strip visible', async ({ page }) => {
    await expect(page.locator('.presence-strip')).toBeVisible()
  })

  test('active user presence indicator stays green', async ({ page }) => {
    if (!testUser) {
      throw new Error('Test user was not created')
    }

    const selfPresence = page.locator('.presence-pill', { hasText: testUser.email })
    await expect(selfPresence).toBeVisible()
    await expect(selfPresence.locator('.presence-dot')).toBeVisible()
    await expect(selfPresence.locator('.presence-dot.away')).toHaveCount(0)
  })

  test('laptop layout keeps minimap and side tabs visible without page scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 920 })

    await expect(page.locator('.board-shell')).toBeVisible()
    await expect(page.locator('.minimap')).toBeVisible()
    await expect(page.locator('.side-tabs')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Comments' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible()

    const viewportFit = await page.evaluate(() => ({
      bodyScrollHeight: document.body.scrollHeight,
      innerHeight: window.innerHeight,
      rootScrollHeight: document.documentElement.scrollHeight,
    }))

    expect(viewportFit.bodyScrollHeight).toBeLessThanOrEqual(viewportFit.innerHeight + 2)
    expect(viewportFit.rootScrollHeight).toBeLessThanOrEqual(viewportFit.innerHeight + 2)
  })
})
