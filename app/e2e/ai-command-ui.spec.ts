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
  shapeType?: string
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
    shapeType: typeof mapped.shapeType === 'string' ? mapped.shapeType : undefined,
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

test.describe('AI command UI', () => {
  test.setTimeout(180_000)

  test('submits command from chat widget and creates board object', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-ai-ui-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const launcher = page.getByTestId('ai-chat-widget-launcher')
      if (await launcher.count()) {
        await launcher.click()
      }

      const command = `add green sticky note saying ai-ui-${Date.now()}`
      const aiInput = page.locator('.ai-chat-widget .ai-panel .ai-input').first()
      await expect(aiInput).toBeVisible()
      await aiInput.fill(command)
      await page.locator('.ai-chat-widget .ai-panel').getByRole('button', { name: 'Send Command' }).click()

      await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.some((object) => object.type === 'stickyNote' && object.text?.includes('ai-ui-'))
        })
        .toBe(true)

      await aiInput.fill('add circle')
      await page.locator('.ai-chat-widget .ai-panel').getByRole('button', { name: 'Send Command' }).click()
      await expect(page.locator('.ai-chat-widget .ai-message.success')).toBeVisible()
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.some((object) => object.type === 'shape' && object.shapeType === 'circle')
        })
        .toBe(true)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
