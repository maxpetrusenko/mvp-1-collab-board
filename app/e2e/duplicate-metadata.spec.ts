import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loadAuthTestConfig, loginWithEmail } from './helpers/auth'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

const waitForSticky = async (boardId: string, idToken: string) => {
  const sticky = newestObjectByType(await fetchBoardObjects(boardId, idToken), 'stickyNote')
  if (!sticky) {
    throw new Error('Sticky note unavailable')
  }
  return sticky
}

const patchStickyMetadata = async (args: { boardId: string; objectId: string; idToken: string }) => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${args.boardId}/objects/${args.objectId}` +
    '?updateMask.fieldPaths=shapeType&updateMask.fieldPaths=color&updateMask.fieldPaths=votesByUser&updateMask.fieldPaths=comments&updateMask.fieldPaths=updatedAt'

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.idToken}`,
    },
    body: JSON.stringify({
      fields: {
        shapeType: { stringValue: 'circle' },
        color: { stringValue: '#93c5fd' },
        votesByUser: {
          mapValue: {
            fields: {
              playwright_user: { booleanValue: true },
            },
          },
        },
        comments: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    id: { stringValue: 'comment-1' },
                    text: { stringValue: 'Duplicate metadata isolation comment' },
                    createdBy: { stringValue: 'playwright-user' },
                    createdByName: { stringValue: 'Playwright User' },
                    createdAt: { integerValue: String(Date.now()) },
                  },
                },
              },
            ],
          },
        },
        updatedAt: { integerValue: String(Date.now()) },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to patch source sticky metadata (${response.status}): ${body.slice(0, 200)}`)
  }
}

test.describe('Object duplication metadata isolation', () => {
  test.setTimeout(180_000)

  test('DUPLICATE-E2E-001: duplicate keeps visual style but strips votes/comments', async ({ page }) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-dup-meta-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible({ timeout: 20_000 })

      await page.locator('button[title="Add sticky note (S)"]').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((entry) => entry.type === 'stickyNote').length
        })
        .toBe(1)

      const sourceSticky = await waitForSticky(boardId, user.idToken)
      await patchStickyMetadata({
        boardId,
        objectId: sourceSticky.id,
        idToken: user.idToken,
      })

      await expect
        .poll(async () => {
          const refreshed = await fetchBoardObjects(boardId, user.idToken)
          const updated = refreshed.find((entry) => entry.id === sourceSticky.id)
          return `${updated?.shapeType || ''}:${updated?.color || ''}:${Object.keys(updated?.votesByUser || {}).length}:${updated?.comments?.length || 0}`
        })
        .toBe('circle:#93c5fd:1:1')

      await expect(page.getByTestId('duplicate-selected-button')).toBeVisible()
      await page.getByTestId('duplicate-selected-button').click()

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.filter((entry) => entry.type === 'stickyNote').length
        })
        .toBe(2)

      const allStickies = (await fetchBoardObjects(boardId, user.idToken))
        .filter((entry) => entry.type === 'stickyNote')
        .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0))

      const source = allStickies[0]
      const duplicate = allStickies[1]
      if (!source || !duplicate || !source.position || !duplicate.position) {
        throw new Error('Unable to resolve source and duplicate stickies')
      }

      expect(source.id).not.toBe(duplicate.id)
      expect(source.shapeType).toBe(duplicate.shapeType)
      expect(source.color).toBe(duplicate.color)
      expect(source.text).toBe(duplicate.text)
      expect(duplicate.position.x - source.position.x).toBe(20)
      expect(duplicate.position.y - source.position.y).toBe(20)

      expect(source.comments?.length || 0).toBeGreaterThan(0)
      expect(Object.keys(source.votesByUser || {}).length).toBeGreaterThan(0)
      expect(duplicate.comments?.length || 0).toBe(0)
      expect(Object.keys(duplicate.votesByUser || {}).length).toBe(0)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
