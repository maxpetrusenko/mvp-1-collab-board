import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Inline editing + viewport export', () => {
  test.setTimeout(180_000)

  test('edits sticky inline and exports viewport in png/pdf', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-inline-export-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.getByTestId('zoom-percentage')).toHaveText('100%')
      const zoomControls = page.locator('.zoom-controls')
      await expect(zoomControls).toBeVisible()
      await zoomControls.getByRole('button', { name: 'Zoom in' }).click()
      await zoomControls.getByRole('button', { name: 'Reset zoom to 100%' }).click()
      await expect(page.getByTestId('zoom-percentage')).toHaveText('100%')

      await page.evaluate(() => {
        const win = window as typeof window & {
          __exportEvents?: Array<{ format?: string; fileBase?: string; scope?: string }>
          __exportListenerInstalled?: boolean
        }

        win.__exportEvents = []
        if (win.__exportListenerInstalled) {
          return
        }

        window.addEventListener('board-export-complete', (event) => {
          const host = window as typeof window & {
            __exportEvents?: Array<{ format?: string; fileBase?: string; scope?: string }>
          }
          const customEvent = event as CustomEvent<{ format?: string; fileBase?: string; scope?: string }>
          host.__exportEvents = host.__exportEvents || []
          host.__exportEvents.push(customEvent.detail || {})
        })

        win.__exportListenerInstalled = true
      })

      await page.locator('button[title="Add sticky note (S)"]').click()

      let newestSticky: BoardObject | null = null
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          newestSticky = newestObjectByType(objects, 'stickyNote')
          return Boolean(newestSticky)
        })
        .toBe(true)

      if (!newestSticky) {
        throw new Error('Sticky note was not created for inline-edit test')
      }

      if (!newestSticky.position || !newestSticky.size) {
        throw new Error('Sticky note position/size missing for inline-edit test')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const targetX = canvasBox.x + (newestSticky.position.x ?? 0) + ((newestSticky.size.width ?? 180) / 2)
      const targetY = canvasBox.y + (newestSticky.position.y ?? 0) + ((newestSticky.size.height ?? 110) / 2)

      await page.mouse.dblclick(targetX, targetY)
      await expect(page.locator('.inline-editor-textarea')).toBeVisible()

      const inlineText = `Inline edit ${Date.now()}`
      await page.locator('.inline-editor-textarea').fill(inlineText)
      await page.mouse.click(canvasBox.x + 24, canvasBox.y + 24)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestSticky.id)?.text ?? ''
        })
        .toBe(inlineText)

      await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20)
      await page.mouse.down()
      await page.mouse.move(canvasBox.x + 160, canvasBox.y + 120)
      await page.mouse.up()

      await page.getByTestId('export-viewport-png').click()
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const win = window as typeof window & {
              __exportEvents?: Array<{ format?: string; fileBase?: string; scope?: string }>
            }
            const events = win.__exportEvents || []
            return events.at(-1) || null
          }),
        )
        .toMatchObject({ format: 'png', fileBase: 'board-selection', scope: 'selection' })

      await page.getByTestId('export-viewport-pdf').click()
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const win = window as typeof window & {
              __exportEvents?: Array<{ format?: string; fileBase?: string; scope?: string }>
            }
            const events = win.__exportEvents || []
            return events.at(-1) || null
          }),
        )
        .toMatchObject({ format: 'pdf', fileBase: 'board-selection', scope: 'selection' })
    } finally {
      await cleanupTestUser(user)
    }
  })
})
