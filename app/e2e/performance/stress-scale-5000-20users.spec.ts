import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type TestInfo } from '@playwright/test'

import { createTempUser, deleteTempUser, getUserIdFromIdToken, loadAuthTestConfig } from '../helpers/auth'
import { fetchBoardObjects } from '../helpers/firestore'
import { fetchBoardPresenceMap, seedBoardObjects, writeCursorPresence } from '../helpers/performance'

const RUN_EXTREME_STRESS = process.env.RUN_EXTREME_STRESS === '1'
const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const TARGET_OBJECT_COUNT = 5_000
const SIMULATED_USERS = Math.max(20, Number.parseInt(process.env.STRESS_SIMULATED_USERS || '20', 10) || 20)
const MOVE_ROUNDS = 2
const END_TO_END_SLA_MS = { target: 180_000, warning: 360_000, critical: 720_000 }

type FirestoreEncodedValue =
  | { stringValue: string }
  | { integerValue: string }
  | { mapValue: { fields: Record<string, FirestoreEncodedValue> } }
  | { arrayValue: { values: FirestoreEncodedValue[] } }

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${Math.round(value)}ms (target ${bounds.target}ms, warning ${bounds.warning}ms, critical ${bounds.critical}ms)`,
  })
}

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const splitIndex = line.indexOf('=')
        if (splitIndex < 1) {
          return null
        }
        const key = line.slice(0, splitIndex).trim()
        const value = line.slice(splitIndex + 1).trim().replace(/^['"]|['"]$/g, '')
        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

const loadAiApiBaseUrl = (): string => {
  const envPath = path.resolve(process.cwd(), '.env')
  const fileEnv = parseEnvFile(envPath)
  const configured = process.env.VITE_AI_API_BASE_URL ?? fileEnv.VITE_AI_API_BASE_URL
  const normalized = String(configured || '').trim().replace(/\/$/, '')
  if (!normalized) {
    throw new Error('Missing VITE_AI_API_BASE_URL in app/.env for stress share simulation')
  }
  return normalized
}

const toFirestoreEncodedValue = (value: unknown): FirestoreEncodedValue => {
  if (typeof value === 'string') {
    return { stringValue: value }
  }
  if (typeof value === 'number') {
    return { integerValue: String(Math.trunc(value)) }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((entry) => toFirestoreEncodedValue(entry)) } }
  }
  if (value && typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, toFirestoreEncodedValue(nested)]),
        ),
      },
    }
  }
  return { stringValue: String(value ?? '') }
}

const toFirestoreFields = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).map(([key, value]) => [key, toFirestoreEncodedValue(value)]))

const ensureBoardMeta = async (args: {
  projectId: string
  boardId: string
  ownerId: string
  ownerToken: string
}) => {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${args.projectId}/databases/(default)/documents/boards` +
    `?documentId=${encodeURIComponent(args.boardId)}`
  const now = Date.now()

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.ownerToken}`,
    },
    body: JSON.stringify({
      fields: toFirestoreFields({
        id: args.boardId,
        name: `Stress board ${args.boardId.slice(-8)}`,
        description: '5000 cards + 20 users stress simulation',
        ownerId: args.ownerId,
        sharedWith: [],
        sharedRoles: {},
        createdBy: args.ownerId,
        updatedBy: args.ownerId,
        createdAt: now,
        updatedAt: now,
      }),
    }),
  })

  if (response.ok || response.status === 409) {
    return
  }

  const body = await response.text().catch(() => '')
  throw new Error(`Failed to create stress board metadata (${response.status}): ${body.slice(0, 200)}`)
}

const shareBoardWithUser = async (args: {
  apiBaseUrl: string
  boardId: string
  ownerToken: string
  collaboratorId: string
}) => {
  const response = await fetch(`${args.apiBaseUrl}/api/boards/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.ownerToken}`,
    },
    body: JSON.stringify({
      boardId: args.boardId,
      userId: args.collaboratorId,
      role: 'edit',
      action: 'share',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Failed to share board with collaborator ${args.collaboratorId} (${response.status}): ${body.slice(0, 200)}`,
    )
  }
}

const patchObjectPosition = async (args: {
  projectId: string
  boardId: string
  objectId: string
  token: string
  x: number
  y: number
  updatedBy: string
}) => {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${args.projectId}/databases/(default)/documents/boards/${args.boardId}/objects/${args.objectId}` +
    '?updateMask.fieldPaths=position.x&updateMask.fieldPaths=position.y&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=updatedBy'
  const now = Date.now()

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      fields: {
        position: {
          mapValue: {
            fields: {
              x: { integerValue: String(Math.trunc(args.x)) },
              y: { integerValue: String(Math.trunc(args.y)) },
            },
          },
        },
        updatedAt: { integerValue: String(now) },
        updatedBy: { stringValue: args.updatedBy },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to patch object ${args.objectId} (${response.status}): ${body.slice(0, 200)}`)
  }
}

test.describe('Extreme stress: 5000 cards + 20 users simulation', () => {
  test.skip(!RUN_EXTREME_STRESS, 'Set RUN_EXTREME_STRESS=1 to run heavy stress simulation')
  test.setTimeout(1_200_000)

  test('STRESS-5000-20: seeds 5000 objects and simulates 20 concurrent authenticated collaborators', async ({
    page,
  }, testInfo) => {
    const { firebaseProjectId } = loadAuthTestConfig()
    const apiBaseUrl = loadAiApiBaseUrl()
    const owner = await createTempUser()
    const collaborators = await Promise.all(Array.from({ length: SIMULATED_USERS }, () => createTempUser()))
    const boardId = `pw-stress-5000-20-${Date.now()}`
    const ownerId = getUserIdFromIdToken(owner.idToken)

    try {
      const scenarioStartedAt = Date.now()
      await ensureBoardMeta({
        projectId: firebaseProjectId,
        boardId,
        ownerId,
        ownerToken: owner.idToken,
      })

      await seedBoardObjects(boardId, owner.idToken, TARGET_OBJECT_COUNT, {
        kind: 'sticky',
        columns: 80,
        spacingX: 200,
        spacingY: 125,
        startX: 40,
        startY: 40,
      })

      const seededObjects = await fetchBoardObjects(boardId, owner.idToken)
      expect(seededObjects.length).toBeGreaterThanOrEqual(TARGET_OBJECT_COUNT)

      // Ensure canvas can still load with seeded scale.
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const collaboratorIds = collaborators.map((user) => getUserIdFromIdToken(user.idToken))
      for (let index = 0; index < collaboratorIds.length; index += 5) {
        const chunk = collaboratorIds.slice(index, index + 5)
        await Promise.all(
          chunk.map((collaboratorId) =>
            shareBoardWithUser({
              apiBaseUrl,
              boardId,
              ownerToken: owner.idToken,
              collaboratorId,
            }),
          ),
        )
      }

      await Promise.all(
        collaborators.map((user, index) =>
          writeCursorPresence({
            boardId,
            userId: collaboratorIds[index],
            idToken: user.idToken,
            displayName: user.email,
            x: 120 + index * 18,
            y: 200 + index * 9,
            connectionId: `stress-${index}`,
          }),
        ),
      )

      await expect
        .poll(async () => {
          const presence = await fetchBoardPresenceMap(boardId, owner.idToken)
          return collaboratorIds.filter((userId) => Boolean(presence[userId])).length
        })
        .toBe(SIMULATED_USERS)

      const targetObjectIds = seededObjects.slice(0, SIMULATED_USERS).map((object) => object.id)
      expect(targetObjectIds.length).toBe(SIMULATED_USERS)

      for (let round = 0; round < MOVE_ROUNDS; round += 1) {
        await Promise.all(
          collaborators.map((user, index) =>
            patchObjectPosition({
              projectId: firebaseProjectId,
              boardId,
              objectId: targetObjectIds[index],
              token: user.idToken,
              updatedBy: collaboratorIds[index],
              x: 1_000 + round * 40 + index * 13,
              y: 700 + round * 25 + index * 11,
            }),
          ),
        )
      }

      await expect
        .poll(async () => {
          const latestObjects = await fetchBoardObjects(boardId, owner.idToken)
          const lookup = new Map(latestObjects.map((object) => [object.id, object]))
          return targetObjectIds.every((objectId, index) => {
            const object = lookup.get(objectId)
            if (!object?.position) {
              return false
            }
            const expectedX = 1_000 + (MOVE_ROUNDS - 1) * 40 + index * 13
            const expectedY = 700 + (MOVE_ROUNDS - 1) * 25 + index * 11
            return object.position.x === expectedX && object.position.y === expectedY
          })
        })
        .toBe(true)

      const elapsedMs = Date.now() - scenarioStartedAt
      annotateSla(testInfo, 'stress-5000-20-end-to-end', elapsedMs, END_TO_END_SLA_MS)
      expect(elapsedMs).toBeLessThanOrEqual(END_TO_END_SLA_MS.critical)
    } finally {
      await Promise.all([
        deleteTempUser(owner.idToken).catch(() => undefined),
        ...collaborators.map((user) => deleteTempUser(user.idToken).catch(() => undefined)),
      ])
    }
  })
})
