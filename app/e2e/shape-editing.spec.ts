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
    shapeType: typeof mapped.shapeType === 'string' ? mapped.shapeType : undefined,
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

test.describe('Shape editing', () => {
  test.setTimeout(180_000)

  test('edits shape text inline and changes shape type', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-shape-edit-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add rectangle (R)"]').click()

      let newestShape: BoardObject | null = null
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          newestShape = objects
            .filter((object) => object.type === 'shape')
            .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] || null
          return Boolean(newestShape)
        })
        .toBe(true)

      if (!newestShape || !newestShape.position || !newestShape.size) {
        throw new Error('Shape object not found after create')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const targetX = canvasBox.x + (newestShape.position.x ?? 0) + ((newestShape.size.width ?? 180) / 2)
      const targetY = canvasBox.y + (newestShape.position.y ?? 0) + ((newestShape.size.height ?? 110) / 2)

      await page.mouse.dblclick(targetX, targetY)
      await expect(page.locator('.inline-editor-textarea')).toBeVisible()

      const shapeText = `Shape text ${Date.now()}`
      await page.locator('.inline-editor-textarea').fill(shapeText)
      await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.text ?? ''
        })
        .toBe(shapeText)

      await page.mouse.click(targetX, targetY)
      await expect(page.getByTestId('shape-type-picker')).toBeVisible()
      await page.locator('button[title="Set shape to Circle"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.shapeType ?? ''
        })
        .toBe('circle')

      await page.locator('button[title="Set shape to Diamond"]').click()
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.find((object) => object.id === newestShape?.id)?.shapeType ?? ''
        })
        .toBe('diamond')
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
