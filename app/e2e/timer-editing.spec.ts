import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

/**
 * E2E tests for timer functionality and inline editing.
 *
 * Addresses T-096: Timer should support inline editing with proper validation
 * (Enter to submit, Escape to cancel, MM:SS format validation).
 */
test.describe('Timer Editing', () => {
  test.setTimeout(60_000)

  test('timer displays default 5:00 on load', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-default-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Timer should display in header
      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await expect(timerDisplay).toBeVisible()
      await expect(timerDisplay).toHaveText('05:00')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('clicking timer enables edit mode with input field', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-edit-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await expect(timerDisplay).toBeVisible()

      // Click to enter edit mode
      await timerDisplay.click()

      // Input should appear
      const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
      await expect(timerInput).toBeVisible()
      await expect(timerInput).toHaveFocus()
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('editing timer and pressing Enter saves the new time', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-enter-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await timerDisplay.click()

      const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
      await expect(timerInput).toBeVisible()

      // Clear and enter new time
      await timerInput.fill('10:30')
      await page.keyboard.press('Enter')

      // Should exit edit mode and show new time
      await expect(timerInput).not.toBeVisible()
      await expect(timerDisplay).toBeVisible()
      await expect(timerDisplay).toHaveText('10:30')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('editing timer and pressing Escape cancels and reverts to original', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-escape-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await expect(timerDisplay).toHaveText('05:00')

      // Click to edit
      await timerDisplay.click()

      const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
      await expect(timerInput).toBeVisible()

      // Enter a different time
      await timerInput.fill('15:45')

      // Press Escape to cancel
      await page.keyboard.press('Escape')

      // Should revert to original time
      await expect(timerInput).not.toBeVisible()
      await expect(timerDisplay).toBeVisible()
      await expect(timerDisplay).toHaveText('05:00')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('timer input validates MM:SS format and rejects invalid input', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-invalid-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await timerDisplay.click()

      const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
      await expect(timerInput).toBeVisible()

      // Enter invalid format (missing colon)
      await timerInput.fill('12345')
      await page.keyboard.press('Enter')

      // Should revert to valid time
      await expect(timerInput).not.toBeVisible()
      await expect(timerDisplay).toBeVisible()
      await expect(timerDisplay).toHaveText('05:00')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('timer input rejects out-of-range values (seconds > 59)', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-oor-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await timerDisplay.click()

      const timerInput = page.locator('.timer-edit-input, [data-testid="timer-edit-input"]')
      await expect(timerInput).toBeVisible()

      // Enter invalid seconds
      await timerInput.fill('05:99')
      await page.keyboard.press('Enter')

      // Should revert to original time
      await expect(timerInput).not.toBeVisible()
      await expect(timerDisplay).toHaveText('05:00')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('timer start button starts countdown', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-start-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      // Find and click the start button (Play icon)
      const startButton = page.locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]').first()
      await expect(startButton).toBeVisible()

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await expect(timerDisplay).toHaveText('05:00')

      // Start timer
      await startButton.click()

      // Pause button should appear
      const pauseButton = page.locator('button[aria-label="Pause timer"], button[title="Pause timer"], [data-testid="timer-pause-button"]').first()
      await expect(pauseButton).toBeVisible()

      // Wait a moment and verify time decreased
      await page.waitForTimeout(2000)
      await expect(timerDisplay).not.toHaveText('05:00')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('timer pause button stops countdown', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-pause-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const startButton = page.locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]').first()
      await startButton.click()

      const pauseButton = page.locator('button[aria-label="Pause timer"], button[title="Pause timer"], [data-testid="timer-pause-button"]').first()
      await expect(pauseButton).toBeVisible()

      // Wait a moment
      await page.waitForTimeout(2000)

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      const pausedTime = await timerDisplay.textContent()

      // Pause the timer
      await pauseButton.click()

      // Wait more - time should not change significantly
      await page.waitForTimeout(2000)
      const stillPausedTime = await timerDisplay.textContent()
      expect(stillPausedTime).toBe(pausedTime)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('timer reset button returns to 5:00 and stops timer', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-timer-reset-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()

      const startButton = page.locator('button[aria-label="Start timer"], button[title="Start timer"], [data-testid="timer-start-button"]').first()
      await startButton.click()

      // Wait a moment
      await page.waitForTimeout(2000)

      const timerDisplay = page.locator('.timer-display, [data-testid="timer-display"]')
      await expect(timerDisplay).not.toHaveText('05:00')

      // Reset timer
      const resetButton = page.locator('button[aria-label="Reset timer"], button[title="Reset timer"], [data-testid="timer-reset-button"]').first()
      await resetButton.click()

      // Should return to default
      await expect(timerDisplay).toHaveText('05:00')

      // Timer should be stopped (start button visible again)
      await expect(startButton).toBeVisible()
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
