import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const copyShortcut = process.platform === 'darwin' ? 'Meta+C' : 'Control+C'
const pasteShortcut = process.platform === 'darwin' ? 'Meta+V' : 'Control+V'

const resolveObjectCenter = async (page: Page, boardObject: BoardObject) => {
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Object center cannot be resolved')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  return {
    x: canvasBox.x + boardObject.position.x + boardObject.size.width / 2,
    y: canvasBox.y + boardObject.position.y + boardObject.size.height / 2,
  }
}

const clickObjectCenter = async (page: Page, boardObject: BoardObject) => {
  const center = await resolveObjectCenter(page, boardObject)
  await page.mouse.click(center.x, center.y)
}

const marqueeSelectObjects = async (page: Page, objects: BoardObject[]) => {
  const selectable = objects.filter((object) => object.position && object.size)
  if (selectable.length === 0) {
    throw new Error('No selectable objects were provided for marquee selection')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const minX = Math.min(...selectable.map((object) => (object.position?.x ?? 0) - 16))
  const minY = Math.min(...selectable.map((object) => (object.position?.y ?? 0) - 16))
  const maxX = Math.max(
    ...selectable.map((object) => (object.position?.x ?? 0) + (object.size?.width ?? 0) + 16),
  )
  const maxY = Math.max(
    ...selectable.map((object) => (object.position?.y ?? 0) + (object.size?.height ?? 0) + 16),
  )

  await page.getByTestId('selection-mode-area').click()
  await page.mouse.move(canvasBox.x + minX, canvasBox.y + minY)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + maxX, canvasBox.y + maxY, { steps: 8 })
  await page.mouse.up()
}

const createStickyAndResolve = async (page: Page, boardId: string, idToken: string): Promise<BoardObject> => {
  await page.locator('button[title="Add sticky note (S)"]').click()

  let stickyId = ''
  await expect
    .poll(async () => {
      const objects = await fetchBoardObjects(boardId, idToken)
      stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
      return stickyId
    })
    .not.toBe('')

  const objects = await fetchBoardObjects(boardId, idToken)
  const sticky = objects.find((object) => object.id === stickyId)
  if (!sticky) {
    throw new Error('Sticky note not found after creation')
  }
  return sticky
}

const createShapeAndResolve = async (page: Page, boardId: string, idToken: string): Promise<BoardObject> => {
  await page.getByTestId('add-shape-button').click()
  await page.getByTestId('shape-create-submit').click()

  let shapeId = ''
  await expect
    .poll(async () => {
      const objects = await fetchBoardObjects(boardId, idToken)
      shapeId = newestObjectByType(objects, 'shape')?.id || ''
      return shapeId
    })
    .not.toBe('')

  const objects = await fetchBoardObjects(boardId, idToken)
  const shape = objects.find((object) => object.id === shapeId)
  if (!shape) {
    throw new Error('Shape not found after creation')
  }
  return shape
}

test.describe('Requirements: object operation gaps', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('FR-24: duplicate has a visible toolbar action in addition to keyboard shortcut', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-req-duplicate-ui-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const sticky = await createStickyAndResolve(page, boardId, user.idToken)
      await clickObjectCenter(page, sticky)

      await expect(page.getByTestId('duplicate-selected-button')).toBeVisible()
      const sourceSnapshot = (await fetchBoardObjects(boardId, user.idToken)).find(
        (object) => object.id === sticky.id,
      )
      if (!sourceSnapshot?.position) {
        throw new Error('Source sticky missing before duplicate action')
      }

      await page.getByTestId('duplicate-selected-button').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((object) => object.type === 'stickyNote').length
        })
        .toBeGreaterThan(1)

      const allStickies = (await fetchBoardObjects(boardId, user.idToken)).filter(
        (object) => object.type === 'stickyNote',
      )
      const duplicate = allStickies.find((object) => object.id !== sticky.id)
      if (!duplicate?.position) {
        throw new Error('Duplicated sticky not found')
      }

      expect(duplicate.text).toBe(sourceSnapshot.text)
      expect(duplicate.shapeType).toBe(sourceSnapshot.shapeType)
      expect(duplicate.color).toBe(sourceSnapshot.color)
      expect(duplicate.position.x - sourceSnapshot.position.x).toBe(20)
      expect(duplicate.position.y - sourceSnapshot.position.y).toBe(20)
    } finally {
      // no-op
    }
  })

  test('FR-25: copy/paste keeps sticky style and applies deterministic offset', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-req-copy-paste-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const sticky = await createStickyAndResolve(page, boardId, user.idToken)
      await clickObjectCenter(page, sticky)
      await expect(page.getByTestId('shape-type-picker')).toBeVisible()
      await page.locator('button[title="Set shape to Circle"]').click()
      await page.locator('button[title="Set color to blue"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          const source = objects.find((object) => object.id === sticky.id)
          return `${source?.shapeType || ''}:${source?.color || ''}`
        })
        .toBe('circle:#93c5fd')

      const sourceSnapshot = (await fetchBoardObjects(boardId, user.idToken)).find(
        (object) => object.id === sticky.id,
      )
      if (!sourceSnapshot?.position) {
        throw new Error('Source sticky missing before copy/paste')
      }

      await page.keyboard.press(copyShortcut)
      await page.keyboard.press(pasteShortcut)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((object) => object.type === 'stickyNote').length
        })
        .toBeGreaterThan(1)

      const allStickies = (await fetchBoardObjects(boardId, user.idToken)).filter(
        (object) => object.type === 'stickyNote',
      )
      const duplicate = allStickies.find((object) => object.id !== sticky.id)
      if (!duplicate?.position) {
        throw new Error('Pasted sticky not found')
      }

      expect(duplicate.shapeType).toBe(sourceSnapshot.shapeType)
      expect(duplicate.color).toBe(sourceSnapshot.color)
      expect(duplicate.position.x - sourceSnapshot.position.x).toBe(20)
      expect(duplicate.position.y - sourceSnapshot.position.y).toBe(20)
    } finally {
      // no-op
    }
  })

  test('FR-24/FR-25 regression: duplicate button and copy/paste both work from current live selection', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-req-dup-copy-regression-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const shape = await createShapeAndResolve(page, boardId, user.idToken)

      await clickObjectCenter(page, shape)
      await page.getByTestId('duplicate-selected-button').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((object) => object.type === 'shape').length
        })
        .toBeGreaterThan(1)

      const latestObjects = await fetchBoardObjects(boardId, user.idToken)
      const sourceAfterDuplicate = latestObjects.find((object) => object.id === shape.id)
      if (!sourceAfterDuplicate) {
        throw new Error('Source shape missing before copy/paste regression step')
      }

      await clickObjectCenter(page, sourceAfterDuplicate)
      await page.keyboard.press(copyShortcut)
      await page.waitForTimeout(120)
      await page.keyboard.press(pasteShortcut)

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((object) => object.type === 'shape').length
        })
        .toBeGreaterThan(2)
    } finally {
      // no-op
    }
  })

  test('FR-7: supports multi-select and bulk delete for two selected stickies', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-req-multi-select-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const first = await createShapeAndResolve(page, boardId, user.idToken)
      const second = await createShapeAndResolve(page, boardId, user.idToken)

      await marqueeSelectObjects(page, [first, second])
      await expect(page.getByTestId('delete-selected-button')).toBeEnabled()
      await page.getByTestId('delete-selected-button').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return {
            firstExists: objects.some((object) => object.id === first.id),
            secondExists: objects.some((object) => object.id === second.id),
          }
        })
        .toEqual({ firstExists: false, secondExists: false })
    } finally {
      // no-op
    }
  })
})
