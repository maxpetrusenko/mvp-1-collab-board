import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const parseTimerDisplayToSeconds = (value: string | null): number => {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    throw new Error(`Unexpected timer value: "${raw}"`)
  }
  return Number(match[1]) * 60 + Number(match[2])
}

test.describe('Timer Editing', () => {
  test.setTimeout(90_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('timer displays default 5:00 on load', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-default-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await expect(timerDisplay).toBeVisible()
    await expect(timerDisplay).toHaveText('05:00')
  })

  test('clicking timer enables edit mode with input field', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-edit-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await expect(timerDisplay).toBeVisible()
    await timerDisplay.click()

    const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
    await expect(timerInput).toBeVisible()
    await expect(timerInput).toBeFocused()
  })

  test('editing timer and pressing Enter saves the new time', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-enter-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await timerDisplay.click()

    const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
    await expect(timerInput).toBeVisible()

    await timerInput.fill('10:30')
    await page.keyboard.press('Enter')

    await expect(timerInput).not.toBeVisible()
    await expect(timerDisplay).toBeVisible()
    await expect(timerDisplay).toHaveText('10:30')
  })

  test('editing timer and pressing Escape cancels and reverts to original', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-escape-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await expect(timerDisplay).toHaveText('05:00')
    await timerDisplay.click()

    const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
    await expect(timerInput).toBeVisible()
    await timerInput.fill('15:45')
    await page.keyboard.press('Escape')

    await expect(timerInput).not.toBeVisible()
    await expect(timerDisplay).toBeVisible()
    await expect(timerDisplay).toHaveText('05:00')
  })

  test('timer input validates MM:SS format and rejects invalid input', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-invalid-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await timerDisplay.click()

    const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
    await expect(timerInput).toBeVisible()
    await timerInput.fill('12345')
    await page.keyboard.press('Enter')

    await expect(timerInput).not.toBeVisible()
    await expect(timerDisplay).toBeVisible()
    await expect(timerDisplay).toHaveText('05:00')
  })

  test('timer input rejects out-of-range values (seconds > 59)', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-oor-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await timerDisplay.click()

    const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
    await expect(timerInput).toBeVisible()
    await timerInput.fill('05:99')
    await page.keyboard.press('Enter')

    await expect(timerInput).not.toBeVisible()
    await expect(timerDisplay).toHaveText('05:00')
  })

  test('timer start button starts countdown', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-start-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const startButton = page
      .locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]')
      .first()
    await expect(startButton).toBeVisible()

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await expect(timerDisplay).toHaveText('05:00')
    await startButton.click()

    const pauseButton = page
      .locator('button[aria-label="Pause timer"], button[title="Pause timer"], [data-testid="timer-pause-button"]')
      .first()
    await expect(pauseButton).toBeVisible()

    await page.waitForTimeout(2000)
    await expect(timerDisplay).not.toHaveText('05:00')
  })

  test('timer pause button stops countdown', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-pause-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const startButton = page
      .locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]')
      .first()
    await startButton.click()

    const pauseButton = page
      .locator('button[aria-label="Pause timer"], button[title="Pause timer"], [data-testid="timer-pause-button"]')
      .first()
    await expect(pauseButton).toBeVisible()

    await page.waitForTimeout(2000)

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    const pausedTime = await timerDisplay.textContent()
    await pauseButton.click()

    await page.waitForTimeout(2000)
    const stillPausedTime = await timerDisplay.textContent()

    const pausedSeconds = parseTimerDisplayToSeconds(pausedTime)
    const stillPausedSeconds = parseTimerDisplayToSeconds(stillPausedTime)
    expect(Math.abs(stillPausedSeconds - pausedSeconds)).toBeLessThanOrEqual(1)
  })

  test('timer reset button returns to 5:00 and stops timer', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-timer-reset-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const startButton = page
      .locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]')
      .first()
    await startButton.click()
    await page.waitForTimeout(2000)

    const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
    await expect(timerDisplay).not.toHaveText('05:00')

    const resetButton = page
      .locator('button[aria-label="Reset timer"], button[title="Reset timer"], [data-testid="timer-reset-button"]')
      .first()
    await resetButton.click()

    await expect(timerDisplay).toHaveText('05:00')
    await expect(startButton).toBeVisible()
  })
})
