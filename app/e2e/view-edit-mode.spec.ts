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

const getStickyById = async (boardId: string, idToken: string, stickyId: string) => {
  const objects = await fetchBoardObjects(boardId, idToken)
  return objects.find((entry) => entry.id === stickyId) || null
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

      await page.locator('button[title="Add sticky note (S)"]').click()

      let stickyId = ''
      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          stickyId = newestObjectByType(objects, 'stickyNote')?.id || ''
          return stickyId
        })
        .not.toBe('')

      const createdSticky = await getStickyById(boardId, user.idToken, stickyId)
      if (!createdSticky?.position) {
        throw new Error('Created sticky position unavailable')
      }

      await page.getByTestId('interaction-mode-view').click()
      await expect(page.getByTestId('interaction-mode-pill')).toHaveText('View mode')

      const stickyCenter = await resolveObjectCenter(page, createdSticky)
      await page.mouse.click(stickyCenter.x, stickyCenter.y)
      await dragBoardObjectCenterTo(page, createdSticky, {
        x: createdSticky.position.x + 180,
        y: createdSticky.position.y + 140,
      })

      await expect
        .poll(async () => {
          const currentSticky = await getStickyById(boardId, user.idToken, stickyId)
          return {
            x: Math.round(currentSticky?.position?.x || 0),
            y: Math.round(currentSticky?.position?.y || 0),
          }
        })
        .toEqual({
          x: Math.round(createdSticky.position.x),
          y: Math.round(createdSticky.position.y),
        })

      await page.getByTestId('interaction-mode-edit').click()
      await expect(page.getByTestId('interaction-mode-pill')).toHaveText('Edit mode')

      const stickyBeforeEditDrag = await getStickyById(boardId, user.idToken, stickyId)
      if (!stickyBeforeEditDrag?.position) {
        throw new Error('Sticky position unavailable before edit drag assertion')
      }

      await dragBoardObjectCenterTo(page, stickyBeforeEditDrag, {
        x: stickyBeforeEditDrag.position.x + 180,
        y: stickyBeforeEditDrag.position.y + 140,
      })

      await expect
        .poll(async () => {
          const currentSticky = await getStickyById(boardId, user.idToken, stickyId)
          if (!currentSticky?.position) {
            return 0
          }
          return (
            Math.abs(currentSticky.position.x - stickyBeforeEditDrag.position.x) +
            Math.abs(currentSticky.position.y - stickyBeforeEditDrag.position.y)
          )
        })
        .toBeGreaterThan(80)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
