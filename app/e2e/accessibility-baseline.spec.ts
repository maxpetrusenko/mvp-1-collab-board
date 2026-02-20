import { expect, test, type Locator, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const tabUntilFocused = async (page: Page, locator: Locator, maxTabs = 80) => {
  const target = locator.first()

  for (let step = 0; step < maxTabs; step += 1) {
    await page.keyboard.press('Tab')
    const focused = await target.evaluate((element) => element === document.activeElement).catch(() => false)
    if (focused) {
      return
    }
  }

  throw new Error(`Target did not receive keyboard focus within ${maxTabs} Tab presses`)
}

const expectVisibleFocusIndicator = async (locator: Locator) => {
  const target = locator.first()
  const styles = await target.evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth || '0'),
      boxShadow: computed.boxShadow,
    }
  })

  const hasOutline = styles.outlineStyle !== 'none' && styles.outlineWidth > 0
  const hasShadow = styles.boxShadow && styles.boxShadow !== 'none'
  expect(hasOutline || hasShadow).toBeTruthy()
}

test.describe('Accessibility baseline', () => {
  test.setTimeout(180_000)

  test('A11Y-001: keyboard-only flow can open boards panel and create a board', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-a11y-keyboard-${Date.now()}`
    const createdBoardName = `Keyboard Board ${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const openBoardsButton = page.getByRole('button', { name: 'Open boards panel' })
      await tabUntilFocused(page, openBoardsButton, 30)
      await expectVisibleFocusIndicator(openBoardsButton)
      await page.keyboard.press('Enter')

      await expect(page.getByTestId('boards-panel')).toBeVisible()

      const nameInput = page.getByTestId('board-name-input')
      await tabUntilFocused(page, nameInput, 40)
      await expectVisibleFocusIndicator(nameInput)
      await page.keyboard.type(createdBoardName)

      await page.keyboard.press('Tab')
      await page.keyboard.type('Created using keyboard-only flow')

      const createButton = page.getByTestId('create-board-button')
      await tabUntilFocused(page, createButton, 10)
      await expectVisibleFocusIndicator(createButton)
      await page.keyboard.press('Enter')

      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.getByTestId('current-board-name')).toContainText(createdBoardName, { timeout: 12_000 })
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('A11Y-002: icon controls expose accessible names and keyboard focus indication', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-a11y-controls-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await expect(page.getByRole('button', { name: 'Open boards panel' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open keyboard shortcuts' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reset timer' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Toggle voting mode' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export current viewport as PNG' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export current viewport as PDF' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Duplicate selected object' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Delete selected object' })).toBeDisabled()

      const openBoardsButton = page.getByRole('button', { name: 'Open boards panel' })
      await tabUntilFocused(page, openBoardsButton, 30)
      await expectVisibleFocusIndicator(openBoardsButton)

      const shortcutsButton = page.getByRole('button', { name: 'Open keyboard shortcuts' })
      await tabUntilFocused(page, shortcutsButton, 10)
      await expectVisibleFocusIndicator(shortcutsButton)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('A11Y-003: AI command panel exposes labeled controls and live status region', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-a11y-ai-panel-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await expect(page.getByLabel('AI command input')).toBeVisible()
      await expect(page.getByTestId('ai-status-pill')).toHaveAttribute('role', 'status')
      await expect(page.getByTestId('ai-status-pill')).toHaveAttribute('aria-live', 'polite')
      await expect(page.locator('input[type="file"][aria-label="Import screenshot"]')).toBeAttached()
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
