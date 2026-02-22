import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType, type BoardObject } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

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
  await page.mouse.move(endX, endY, { steps: 6 })
  await page.mouse.up()
}

const getObjectById = async (boardId: string, idToken: string, objectId: string) => {
  const objects = await fetchBoardObjects(boardId, idToken)
  return objects.find((entry) => entry.id === objectId) || null
}

test.describe('View/Edit mode toggle', () => {
  test.setTimeout(180_000)

  test('T-067: view mode blocks drag while edit mode allows movement', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-view-edit-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add frame (F)"]').click()

      let objectId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          objectId = newestObjectByType(objects, 'frame')?.id || ''
          return objectId
        })
        .not.toBe('')

      const createdObject = await getObjectById(boardId, user.idToken, objectId)
      if (!createdObject?.position) {
        throw new Error('Created shape position unavailable')
      }

      await page.getByTestId('interaction-mode-view').click()
      await expect(page.getByTestId('interaction-mode-pill')).toHaveText('View mode')

      const objectCenter = await resolveObjectCenter(page, createdObject)
      await page.mouse.click(objectCenter.x, objectCenter.y)
      await dragBoardObjectCenterTo(page, createdObject, {
        x: createdObject.position.x + 180,
        y: createdObject.position.y + 140,
      })

      await expect
        .poll(async () => {
          const currentObject = await getObjectById(boardId, user.idToken, objectId)
          return {
            x: Math.round(currentObject?.position?.x || 0),
            y: Math.round(currentObject?.position?.y || 0),
          }
        })
        .toEqual({
          x: Math.round(createdObject.position.x),
          y: Math.round(createdObject.position.y),
        })

      await page.getByTestId('interaction-mode-edit').click()
      await expect(page.getByTestId('interaction-mode-pill')).toHaveText('Edit mode')
      await expect(page.getByTestId('add-shape-button')).toBeEnabled()
      const objectCountBeforeEditCreate = (await fetchBoardObjects(boardId, user.idToken)).length
      await page.getByTestId('add-shape-button').click()
      await page.getByTestId('shape-create-submit').click()

      await expect
        .poll(async () => {
          const currentObjects = await fetchBoardObjects(boardId, user.idToken)
          return currentObjects.length
        })
        .toBeGreaterThan(objectCountBeforeEditCreate)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
