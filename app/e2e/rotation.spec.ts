import { expect, test } from '@playwright/test'
import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { seedBoardObjects } from './helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

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

    // Create a sticky note
    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'sticky', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Click to select the sticky note (shows rotation handle)
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Verify rotation handle exists (check via presence in DOM)
    const rotationHandle = page.locator('[data-testid^="rotation-handle-"]')
    await expect(rotationHandle).toHaveCount(1)

    // Get initial rotation from Firestore
    const initialRotation = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where, limit } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'), limit(1))
      const snap = await getDocs(q)
      if (snap.empty) return 0
      return snap.docs[0].data().rotation || 0
    }, boardId)

    // Drag the rotation handle to rotate the object
    // The handle is at the top of the object, dragging it sideways should rotate
    const handleBox = await rotationHandle.boundingBox()
    if (!handleBox) throw new Error('Rotation handle not found')

    // Drag from handle position to the right (should rotate clockwise)
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 100, handleBox.y + handleBox.height / 2)
    await page.mouse.up()

    // Wait for rotation to be saved
    await page.waitForTimeout(500)

    // Verify rotation changed in Firestore
    const newRotation = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where, limit } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'), limit(1))
      const snap = await getDocs(q)
      if (snap.empty) return 0
      return snap.docs[0].data().rotation || 0
    }, boardId)

    expect(newRotation).not.toBe(initialRotation)
    expect(newRotation).toBeGreaterThan(0)
  })

  test('ROTATION-E2E-002: drag-to-rotate handle works on shapes', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-shape-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create a shape
    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'rectangle', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Click to select the shape
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Verify rotation handle exists
    const rotationHandle = page.locator('[data-testid^="rotation-handle-"]')
    await expect(rotationHandle).toHaveCount(1)

    // Drag rotation handle
    const handleBox = await rotationHandle.boundingBox()
    if (!handleBox) throw new Error('Rotation handle not found')

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 - 80, handleBox.y + handleBox.height / 2 + 50)
    await page.mouse.up()

    // Verify rotation changed
    await page.waitForTimeout(500)

    const finalRotation = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where, limit } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'rectangle'), limit(1))
      const snap = await getDocs(q)
      if (snap.empty) return 0
      return snap.docs[0].data().rotation || 0
    }, boardId)

    expect(finalRotation).not.toBe(0)
  })

  test('ROTATION-E2E-003: drag-to-rotate handle works on frames', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-frame-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create a frame
    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'frame', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Click to select the frame
    await page.locator('.board-stage').click({ position: { x: 300, y: 150 } })

    // Verify rotation handle exists
    const rotationHandle = page.locator('[data-testid^="rotation-handle-"]')
    await expect(rotationHandle).toHaveCount(1)

    // Drag rotation handle
    const handleBox = await rotationHandle.boundingBox()
    if (!handleBox) throw new Error('Rotation handle not found')

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 60, handleBox.y + handleBox.height / 2 + 60)
    await page.mouse.up()

    // Verify rotation changed
    await page.waitForTimeout(500)

    const finalRotation = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where, limit } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('type', '==', 'frame'), limit(1))
      const snap = await getDocs(q)
      if (snap.empty) return 0
      return snap.docs[0].data().rotation || 0
    }, boardId)

    expect(finalRotation).not.toBe(0)
  })

  test('ROTATION-E2E-004: rotation handle only appears when object is selected', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-select-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'sticky', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Initially no rotation handle visible (nothing selected)
    const rotationHandle = page.locator('[data-testid^="rotation-handle-"]')
    await expect(rotationHandle).toHaveCount(0)

    // Click to select
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Now rotation handle should be visible
    await expect(rotationHandle).toHaveCount(1)

    // Click elsewhere to deselect
    await page.locator('.board-stage').click({ position: { x: 50, y: 50 } })

    // Rotation handle should disappear
    await expect(rotationHandle).toHaveCount(0)
  })

  test('ROTATION-E2E-005: rotation handle not visible in view mode', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-rotate-viewmode-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'sticky', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Switch to view mode
    await page.keyboard.press('Shift+E')
    await expect(page.locator('[data-testid="interaction-mode-pill"]')).toContainText('View mode')

    // Try to select and verify no rotation handle appears
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    const rotationHandle = page.locator('[data-testid^="rotation-handle-"]')
    await expect(rotationHandle).toHaveCount(0)
  })
})
