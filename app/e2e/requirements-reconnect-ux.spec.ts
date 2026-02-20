import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Requirements: reconnect UX', () => {
  test.setTimeout(180_000)

  test('FR-41: shows reconnecting/syncing UX state during offline->online transitions', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-req-reconnect-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.context().setOffline(true)
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await expect(page.getByTestId('connection-status-pill')).toHaveText(/reconnecting/i, { timeout: 4_000 })

      await page.context().setOffline(false)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(page.getByTestId('connection-status-pill')).toHaveText(/syncing/i, { timeout: 4_000 })
      await expect
        .poll(async () => page.getByTestId('connection-status-pill').count(), {
          timeout: 6_000,
          message: 'status pill should hide after sync settles',
        })
        .toBe(0)
    } finally {
      await page.context().setOffline(false).catch(() => undefined)
      await deleteTempUser(user.idToken)
    }
  })
})
