import { expect, test, type Page } from '@playwright/test'
import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { seedBoardObjects } from './helpers/performance'
import { fetchBoardObjects } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const ROTATION_HANDLE_OFFSET = 30

const getObjectRotation = async (boardId: string, idToken: string, objectId: string) => {
  const objects = await fetchBoardObjects(boardId, idToken)
  return objects.find((candidate) => candidate.id === objectId)?.rotation ?? 0
}

const toCanvasScreenPoint = async (page: Page, worldX: number, worldY: number) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Board canvas is unavailable')
  }

  return {
    x: canvasBox.x + worldX,
    y: canvasBox.y + worldY,
  }
}

const selectSeededObject = async (
  page: Page,
  boardObject: { position?: { x?: number; y?: number }; size?: { width?: number; height?: number } },
) => {
  const centerX = (boardObject.position?.x ?? 0) + (boardObject.size?.width ?? 180) / 2
  const centerY = (boardObject.position?.y ?? 0) + (boardObject.size?.height ?? 110) / 2
  const point = await toCanvasScreenPoint(page, centerX, centerY)
  await page.mouse.click(point.x, point.y)
}

const dragRotationHandle = async (
  page: Page,
  boardObject: { position?: { x?: number; y?: number }; size?: { width?: number; height?: number } },
  deltaX: number,
  deltaY: number,
) => {
  const handleX = (boardObject.position?.x ?? 0) + (boardObject.size?.width ?? 180) / 2
  const handleY = (boardObject.position?.y ?? 0) - ROTATION_HANDLE_OFFSET
  const start = await toCanvasScreenPoint(page, handleX, handleY)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + deltaX, start.y + deltaY)
  await page.mouse.up()
}

test.describe('Rotation: drag-to-rotate handle', () => {
  test.setTimeout(120_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('ROTATION-E2E-001: drag-to-rotate handle works on sticky notes', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-sticky-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const [sticky] = await seedBoardObjects(boardId, user.idToken, 1, {
      kind: 'sticky',
      columns: 1,
      startX: 160,
      startY: 160,
    })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await selectSeededObject(page, sticky)
    const initialRotation = await getObjectRotation(boardId, user.idToken, sticky.id)

    await dragRotationHandle(page, sticky, 100, 0)
    await page.waitForTimeout(500)

    const newRotation = await getObjectRotation(boardId, user.idToken, sticky.id)
    expect(newRotation).not.toBe(initialRotation)
  })

  test('ROTATION-E2E-002: drag-to-rotate handle works on shapes', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-shape-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const [shape] = await seedBoardObjects(boardId, user.idToken, 1, {
      kind: 'shape',
      columns: 1,
      startX: 180,
      startY: 180,
    })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await selectSeededObject(page, shape)
    const initialRotation = await getObjectRotation(boardId, user.idToken, shape.id)
    await dragRotationHandle(page, shape, -80, 50)
    await page.waitForTimeout(500)

    const finalRotation = await getObjectRotation(boardId, user.idToken, shape.id)
    expect(finalRotation).not.toBe(initialRotation)
  })

  test('ROTATION-E2E-003: drag-to-rotate handle works on frames', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-frame-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const [frame] = await seedBoardObjects(boardId, user.idToken, 1, {
      kind: 'frame',
      columns: 1,
      startX: 220,
      startY: 180,
    })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await selectSeededObject(page, frame)
    const initialRotation = await getObjectRotation(boardId, user.idToken, frame.id)
    await dragRotationHandle(page, frame, 60, 60)
    await page.waitForTimeout(500)

    const finalRotation = await getObjectRotation(boardId, user.idToken, frame.id)
    expect(finalRotation).not.toBe(initialRotation)
  })

  test('ROTATION-E2E-004: rotation handle only appears when object is selected', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-select-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const [sticky] = await seedBoardObjects(boardId, user.idToken, 1, {
      kind: 'sticky',
      columns: 1,
      startX: 180,
      startY: 160,
    })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Without selection, dragging where handle would be should do nothing.
    const initialRotation = await getObjectRotation(boardId, user.idToken, sticky.id)
    await dragRotationHandle(page, sticky, 100, 0)
    await page.waitForTimeout(500)
    const afterUnselectedDrag = await getObjectRotation(boardId, user.idToken, sticky.id)
    expect(afterUnselectedDrag).toBe(initialRotation)

    // After selecting, dragging the same area should rotate.
    await selectSeededObject(page, sticky)
    await dragRotationHandle(page, sticky, 100, 0)
    await page.waitForTimeout(500)
    const afterSelectedDrag = await getObjectRotation(boardId, user.idToken, sticky.id)
    expect(afterSelectedDrag).not.toBe(afterUnselectedDrag)
  })

  test('ROTATION-E2E-005: rotation handle not visible in view mode', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-viewmode-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    const [sticky] = await seedBoardObjects(boardId, user.idToken, 1, {
      kind: 'sticky',
      columns: 1,
      startX: 180,
      startY: 160,
    })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    await selectSeededObject(page, sticky)
    const selectedRotation = await getObjectRotation(boardId, user.idToken, sticky.id)

    // Switch to view mode.
    const viewModeToggle = page.locator('[data-testid="interaction-mode-view"]')
    if (await viewModeToggle.count()) {
      await viewModeToggle.click()
    } else {
      await page.keyboard.press('Shift+E')
    }

    await dragRotationHandle(page, sticky, 120, 0)
    await page.waitForTimeout(500)

    const rotationInViewMode = await getObjectRotation(boardId, user.idToken, sticky.id)
    expect(rotationInViewMode).toBe(selectedRotation)
  })
})
