import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Voice input UI', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('voice button is visible and disabled when speech API is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const host = window as unknown as {
        SpeechRecognition?: unknown
        webkitSpeechRecognition?: unknown
      }
      host.SpeechRecognition = undefined
      host.webkitSpeechRecognition = undefined
    })

    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-voice-ui-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const launcher = page.getByTestId('ai-chat-widget-launcher')
    if (await launcher.count()) {
      await launcher.click()
    }

    const voiceButton = page.getByRole('button', { name: 'Voice Input' })
    await expect(voiceButton).toBeVisible()
    await expect(voiceButton).toBeDisabled()
    await expect(voiceButton).toHaveAttribute('title', 'Voice input is not supported in this browser')
  })

  test('shows unsupported message if speech API becomes unavailable before click', async ({ page }) => {
    await page.addInitScript(() => {
      const host = window as unknown as {
        SpeechRecognition?: new () => {
          start: () => void
          stop: () => void
          abort?: () => void
          continuous: boolean
          interimResults: boolean
          lang?: string
          maxAlternatives?: number
          onresult: ((event: unknown) => void) | null
          onerror: ((event: unknown) => void) | null
          onend: (() => void) | null
        }
      }

      host.SpeechRecognition = class {
        continuous = false
        interimResults = false
        lang = 'en-US'
        maxAlternatives = 1
        onresult = null
        onerror = null
        onend = null

        start() {}

        stop() {}
      }
    })

    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-voice-error-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const launcher = page.getByTestId('ai-chat-widget-launcher')
    if (await launcher.count()) {
      await launcher.click()
    }

    const voiceButton = page.getByRole('button', { name: 'Voice Input' })
    await expect(voiceButton).toBeVisible()
    await expect(voiceButton).toBeEnabled()

    await page.evaluate(() => {
      const host = window as unknown as {
        SpeechRecognition?: unknown
        webkitSpeechRecognition?: unknown
      }
      host.SpeechRecognition = undefined
      host.webkitSpeechRecognition = undefined
    })

    await voiceButton.click()
    await expect(page.locator('.ai-chat-widget .ai-message.error')).toContainText(
      'Voice input is not supported in this browser.',
    )
  })

})
