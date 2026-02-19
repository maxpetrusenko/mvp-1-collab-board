import { expect, test } from '@playwright/test'
import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { seedBoardObjects } from './helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Voting: all object types', () => {
  test.setTimeout(120_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('VOTING-E2E-001: voting mode works on sticky notes', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-vote-sticky-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create sticky notes with text
    await seedBoardObjects(boardId, user.idToken, 3, { kind: 'sticky', columns: 3 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Enable voting mode via keyboard (V key)
    await page.keyboard.press('v')

    // Click on a sticky note to vote
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Vote badge should appear (need to check via Firestore since canvas doesn't expose DOM)
    const response = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }, boardId)

    const votedObject = response.find(
      (obj: { votesByUser?: Record<string, boolean> }) => obj.votesByUser && Object.keys(obj.votesByUser).length > 0,
    )
    expect(votedObject).toBeTruthy()

    // Click again to unvote
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    const response2 = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }, boardId)

    const unvotedObject = response2.find(
      (obj: { votesByUser?: Record<string, boolean> }) =>
        !obj.votesByUser || Object.keys(obj.votesByUser).length === 0,
    )
    expect(unvotedObject).toBeTruthy()
  })

  test('VOTING-E2E-002: voting mode works on shapes', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-vote-shape-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create shapes with text
    await seedBoardObjects(boardId, user.idToken, 3, { kind: 'rectangle', columns: 3 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Enable voting mode
    await page.keyboard.press('v')

    // Click on a shape to vote
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Verify vote was recorded
    const response = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'rectangle'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }, boardId)

    const votedObject = response.find(
      (obj: { votesByUser?: Record<string, boolean> }) => obj.votesByUser && Object.keys(obj.votesByUser).length > 0,
    )
    expect(votedObject).toBeTruthy()
  })

  test('VOTING-E2E-003: voting mode works on frames', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-vote-frame-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    // Create frames
    await seedBoardObjects(boardId, user.idToken, 2, { kind: 'frame', columns: 2 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Enable voting mode
    await page.keyboard.press('v')

    // Click on a frame to vote
    await page.locator('.board-stage').click({ position: { x: 200, y: 100 } })

    // Verify vote was recorded
    const response = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'frame'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }, boardId)

    const votedObject = response.find(
      (obj: { votesByUser?: Record<string, boolean> }) => obj.votesByUser && Object.keys(obj.votesByUser).length > 0,
    )
    expect(votedObject).toBeTruthy()
  })

  test('VOTING-E2E-004: voting mode toggle button works', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-vote-toggle-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'sticky', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Find voting mode button (has Vote icon and button-primary class when active)
    const voteButton = page.locator('button[aria-label="Toggle voting mode"]')

    // Click to enable voting mode
    await voteButton.click()
    await expect(voteButton).toHaveClass(/button-primary/)

    // Click on sticky to vote
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Verify vote
    const response = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'))
      const snap = await getDocs(q)
      const obj = snap.docs[0]?.data()
      return obj ? Object.keys(obj.votesByUser || {}).length : 0
    }, boardId)

    expect(response).toBeGreaterThan(0)

    // Click button again to disable voting mode
    await voteButton.click()
    await expect(voteButton).not.toHaveClass(/button-primary/)
  })

  test('VOTING-E2E-005: voting disabled in view mode', async ({ page }) => {
    if (!user) throw new Error('Test user unavailable')

    const boardId = `pw-vote-viewmode-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)

    await seedBoardObjects(boardId, user.idToken, 1, { kind: 'sticky', columns: 1 })

    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    // Switch to view mode (Shift+E)
    await page.keyboard.press('Shift+E')
    await expect(page.locator('[data-testid="interaction-mode-pill"]')).toContainText('View mode')

    // Enable voting mode
    await page.keyboard.press('v')

    // Try to vote - should not work in view mode
    await page.locator('.board-stage').click({ position: { x: 200, y: 200 } })

    // Verify no vote was recorded
    const response = await page.evaluate(async (boardId) => {
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const { getFirestore } = await import('firebase/firestore')
      const db = getFirestore()
      const q = query(collection(db, 'boards', boardId, 'objects'), where('kind', '==', 'stickyNote'))
      const snap = await getDocs(q)
      const obj = snap.docs[0]?.data()
      return obj ? Object.keys(obj.votesByUser || {}).length : 0
    }, boardId)

    expect(response).toBe(0)
  })
})
