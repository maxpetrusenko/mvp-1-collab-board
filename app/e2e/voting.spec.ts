import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'
const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const fitBoardViewport = async (page: Page) => {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Fit all objects' }).click({ force: true })
  await page.waitForTimeout(250)
}

const voteCountForObject = async (boardId: string, idToken: string, objectId: string) => {
  const objects = await fetchBoardObjects(boardId, idToken)
  const boardObject = objects.find((entry) => entry.id === objectId)
  return Object.keys(boardObject?.votesByUser || {}).length
}

const waitForVoteCount = async (
  boardId: string,
  idToken: string,
  objectId: string,
  expected: number,
  timeoutMs = 1_200,
) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const count = await voteCountForObject(boardId, idToken, objectId)
    if (count === expected) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return false
}

const toggleVoteAtLikelyObject = async (args: {
  page: Page
  boardId: string
  idToken: string
  objectId: string
  expectedCount: number
}) => {
  const canvasBox = await args.page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  const center = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  }
  const offsets = [
    { x: 0, y: 0 },
    { x: 90, y: 0 },
    { x: -90, y: 0 },
    { x: 0, y: 70 },
    { x: 0, y: -70 },
    { x: 120, y: 80 },
    { x: -120, y: 80 },
    { x: 120, y: -80 },
    { x: -120, y: -80 },
  ]

  for (const offset of offsets) {
    await args.page.mouse.click(center.x + offset.x, center.y + offset.y)
    if (await waitForVoteCount(args.boardId, args.idToken, args.objectId, args.expectedCount)) {
      return
    }
  }

  throw new Error(`Unable to reach vote count ${args.expectedCount} for ${args.objectId}`)
}

test.describe('Voting mode behavior', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('VOTING-E2E-001: sticky vote toggles on second click', async ({ page }) => {
    if (!user) {
      throw new Error('Test user unavailable')
    }

    const boardId = `pw-vote-sticky-${Date.now()}`
    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await page.locator('button[title="Add sticky note (S)"]').click()

    let stickyId = ''
    await expect
      .poll(async () => {
        stickyId = newestObjectByType(await fetchBoardObjects(boardId, user.idToken), 'stickyNote')?.id || ''
        return stickyId
      })
      .not.toBe('')

    await fitBoardViewport(page)
    await page.locator('button[aria-label="Toggle voting mode"]').click()

    await toggleVoteAtLikelyObject({
      page,
      boardId,
      idToken: user.idToken,
      objectId: stickyId,
      expectedCount: 1,
    })

    await toggleVoteAtLikelyObject({
      page,
      boardId,
      idToken: user.idToken,
      objectId: stickyId,
      expectedCount: 0,
    })
  })

  test('VOTING-E2E-002: voting applies to shape + frame (not sticky-only)', async ({ page }) => {
    if (!user) {
      throw new Error('Test user unavailable')
    }

    const fixtures: Array<{ kind: 'shape' | 'frame'; expectedType: 'shape' | 'frame' }> = [
      { kind: 'shape', expectedType: 'shape' },
      { kind: 'frame', expectedType: 'frame' },
    ]

    for (const fixture of fixtures) {
      const boardId = `pw-vote-${fixture.kind}-${Date.now()}`
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      if (fixture.kind === 'shape') {
        await page.getByTestId('add-shape-button').click()
        await page.getByTestId('shape-create-submit').click()
      } else {
        await page.locator('button[title="Add frame (F)"]').click()
      }

      let objectId = ''
      await expect
        .poll(async () => {
          objectId = newestObjectByType(await fetchBoardObjects(boardId, user.idToken), fixture.expectedType)?.id || ''
          return objectId
        })
        .not.toBe('')

      await fitBoardViewport(page)
      await page.locator('button[aria-label="Toggle voting mode"]').click()
      await toggleVoteAtLikelyObject({
        page,
        boardId,
        idToken: user.idToken,
        objectId,
        expectedCount: 1,
      })
    }
  })
})
