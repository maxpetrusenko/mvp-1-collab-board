import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'
const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const clickBoardCenter = async (page: Page) => {
  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable')
  }

  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
}

const fitBoardViewport = async (page: Page) => {
  await page.getByRole('button', { name: 'Fit all objects' }).click()
  await page.waitForTimeout(250)
}

const voteCountForObject = async (boardId: string, idToken: string, objectId: string) => {
  const objects = await fetchBoardObjects(boardId, idToken)
  const boardObject = objects.find((entry) => entry.id === objectId)
  return Object.keys(boardObject?.votesByUser || {}).length
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

    await page.addInitScript(() => {
      window.localStorage.clear()
    })

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

    await clickBoardCenter(page)
    await expect.poll(() => voteCountForObject(boardId, user.idToken, stickyId)).toBe(1)

    await clickBoardCenter(page)
    await expect.poll(() => voteCountForObject(boardId, user.idToken, stickyId)).toBe(0)
  })

  test('VOTING-E2E-002: voting applies to shape + frame (not sticky-only)', async ({ page }) => {
    if (!user) {
      throw new Error('Test user unavailable')
    }

    await page.addInitScript(() => {
      window.localStorage.clear()
    })

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
      await clickBoardCenter(page)

      await expect.poll(() => voteCountForObject(boardId, user.idToken, objectId)).toBe(1)
    }
  })
})
