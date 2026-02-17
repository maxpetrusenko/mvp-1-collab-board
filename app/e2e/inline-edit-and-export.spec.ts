import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loadAuthTestConfig, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

type FirestoreValue = {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  nullValue?: null
  mapValue?: { fields?: Record<string, FirestoreValue> }
  arrayValue?: { values?: FirestoreValue[] }
}

type FirestoreDocument = {
  name: string
  fields?: Record<string, FirestoreValue>
}

type BoardObject = {
  id: string
  type: string
  text?: string
  position?: { x?: number; y?: number }
  size?: { width?: number; height?: number }
  createdAt?: number
  deleted?: boolean
}

const fromFirestoreValue = (value: FirestoreValue | undefined): unknown => {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.integerValue !== undefined) return Number(value.integerValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.booleanValue !== undefined) return value.booleanValue
  if (value.nullValue !== undefined) return null
  if (value.mapValue) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, fromFirestoreValue(nested)]),
    )
  }
  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item))
  }
  return undefined
}

const toBoardObject = (doc: FirestoreDocument): BoardObject => {
  const fields = doc.fields ?? {}
  const mapped = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  ) as Record<string, unknown>

  return {
    id: String(mapped.id ?? doc.name.split('/').at(-1) ?? ''),
    type: String(mapped.type ?? 'unknown'),
    text: typeof mapped.text === 'string' ? mapped.text : undefined,
    position: mapped.position as BoardObject['position'],
    size: mapped.size as BoardObject['size'],
    createdAt: typeof mapped.createdAt === 'number' ? mapped.createdAt : undefined,
    deleted: Boolean(mapped.deleted),
  }
}

const fetchBoardObjects = async (boardId: string, idToken: string): Promise<BoardObject[]> => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}/objects`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to read board objects (${response.status})`)
  }

  const body = (await response.json()) as { documents?: FirestoreDocument[] }
  return (body.documents ?? []).map(toBoardObject).filter((object) => !object.deleted)
}

test.describe('Inline editing + viewport export', () => {
  test.setTimeout(180_000)

  test('edits sticky inline and exports viewport in png/pdf', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-inline-export-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.getByTestId('zoom-percentage')).toHaveText('100%')
      await page.getByRole('button', { name: 'Zoom in' }).click()
      await expect(page.getByTestId('zoom-percentage')).toHaveText('125%')
      await page.getByRole('button', { name: 'Reset zoom to 100%' }).click()
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
          newestSticky = objects
            .filter((object) => object.type === 'stickyNote')
            .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] || null
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
      await deleteTempUser(user.idToken)
    }
  })
})
