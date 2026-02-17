import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loadAuthTestConfig, loginWithEmail } from './helpers/auth'

const APP_URL = 'https://mvp-1-collab-board.web.app'

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
    const entries = Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, fromFirestoreValue(nested)])
    return Object.fromEntries(entries)
  }
  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item))
  }
  return undefined
}

const toBoardObject = (doc: FirestoreDocument): BoardObject => {
  const fields = doc.fields ?? {}
  const mapped = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)])) as Record<
    string,
    unknown
  >

  return {
    id: String(mapped.id ?? doc.name.split('/').at(-1) ?? ''),
    type: String(mapped.type ?? 'unknown'),
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

const countByType = (objects: BoardObject[], type: string): number => objects.filter((item) => item.type === type).length

test.describe('MVP regression', () => {
  test.setTimeout(180_000)

  test('core board flows: create, drag, undo/redo', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-mvp-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)

      await expect(page.locator('.board-stage')).toBeVisible()
      await expect(page.locator('.presence-strip')).toBeVisible()

      const initialObjects = await fetchBoardObjects(boardId, user.idToken)
      const initialStickyCount = countByType(initialObjects, 'stickyNote')
      const initialShapeCount = countByType(initialObjects, 'shape')

      await page.getByRole('button', { name: 'Add Sticky' }).click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'stickyNote')
        })
        .toBe(initialStickyCount + 1)

      const afterStickyObjects = await fetchBoardObjects(boardId, user.idToken)
      const newestSticky = afterStickyObjects
        .filter((object) => object.type === 'stickyNote')
        .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0]

      if (!newestSticky || !newestSticky.position) {
        throw new Error('Sticky note object not found after create')
      }

      const initialStickyPosition = `${Math.round(newestSticky.position.x ?? 0)}:${Math.round(newestSticky.position.y ?? 0)}`

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const dragStartX = canvasBox.x + (newestSticky.position.x ?? 0) + ((newestSticky.size?.width ?? 180) / 2)
      const dragStartY = canvasBox.y + (newestSticky.position.y ?? 0) + ((newestSticky.size?.height ?? 110) / 2)

      await page.mouse.move(dragStartX, dragStartY)
      await page.mouse.down()
      await page.mouse.move(dragStartX + 160, dragStartY + 100)
      await page.mouse.up()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const sticky = objects.find((object) => object.id === newestSticky.id)
          if (!sticky?.position) return initialStickyPosition
          return `${Math.round(sticky.position.x ?? 0)}:${Math.round(sticky.position.y ?? 0)}`
        })
        .not.toBe(initialStickyPosition)

      await page.getByRole('button', { name: 'Add Rectangle' }).click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'shape')
        })
        .toBe(initialShapeCount + 1)

      await page.getByRole('button', { name: 'Undo' }).click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'shape')
        })
        .toBe(initialShapeCount)

      await page.getByRole('button', { name: 'Redo' }).click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return countByType(objects, 'shape')
        })
        .toBe(initialShapeCount + 1)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
