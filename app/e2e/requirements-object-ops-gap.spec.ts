import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'
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

const dragBoardObjectCenterTo = async (
  page: Page,
  boardObject: BoardObject,
  targetTopLeft: { x: number; y: number },
) => {
  if (!boardObject.position || !boardObject.size) {
    throw new Error('Board object missing position/size')
  }

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const halfWidth = boardObject.size.width / 2
  const halfHeight = boardObject.size.height / 2
  const startX = canvasBox.x + boardObject.position.x + halfWidth
  const startY = canvasBox.y + boardObject.position.y + halfHeight
  const endX = canvasBox.x + targetTopLeft.x + halfWidth
  const endY = canvasBox.y + targetTopLeft.y + halfHeight

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 5 })
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

test.describe('Requirements: object operation gaps', () => {
  test.setTimeout(180_000)

  test('FR-24: duplicate has a visible toolbar action in addition to keyboard shortcut', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-req-duplicate-ui-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const sticky = await createStickyAndResolve(page, boardId, user.idToken)
      await clickObjectCenter(page, sticky)

      await expect(page.getByTestId('duplicate-selected-button')).toBeVisible()
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('FR-25: copy/paste keeps sticky style and applies deterministic offset', async ({ page }) => {
    const user = await createTempUser()
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
      expect(duplicate.position.x - sourceSnapshot.position.x).toBe(24)
      expect(duplicate.position.y - sourceSnapshot.position.y).toBe(24)
    } finally {
      await deleteTempUser(user.idToken)
    }
  })

  test('FR-7: supports multi-select and bulk delete for two selected stickies', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-req-multi-select-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const first = await createStickyAndResolve(page, boardId, user.idToken)
      const second = await createStickyAndResolve(page, boardId, user.idToken)
      await dragBoardObjectCenterTo(page, first, { x: 180, y: 180 })

      const movedObjects = await fetchBoardObjects(boardId, user.idToken)
      const firstMoved = movedObjects.find((object) => object.id === first.id)
      const secondCurrent = movedObjects.find((object) => object.id === second.id)
      if (!firstMoved || !secondCurrent) {
        throw new Error('Missing stickies for multi-select assertion')
      }

      if (!firstMoved.position || !firstMoved.size || !secondCurrent.position || !secondCurrent.size) {
        throw new Error('Missing bounds for marquee multi-select assertion')
      }

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      const minX = Math.min(firstMoved.position.x, secondCurrent.position.x) - 20
      const minY = Math.min(firstMoved.position.y, secondCurrent.position.y) - 20
      const maxX = Math.max(
        firstMoved.position.x + firstMoved.size.width,
        secondCurrent.position.x + secondCurrent.size.width,
      ) + 20
      const maxY = Math.max(
        firstMoved.position.y + firstMoved.size.height,
        secondCurrent.position.y + secondCurrent.size.height,
      ) + 20

      await page.keyboard.down('Shift')
      await page.mouse.move(canvasBox.x + minX, canvasBox.y + minY)
      await page.mouse.down()
      await page.mouse.move(canvasBox.x + maxX, canvasBox.y + maxY, { steps: 6 })
      await page.mouse.up()
      await page.keyboard.up('Shift')
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
      await deleteTempUser(user.idToken)
    }
  })
})
