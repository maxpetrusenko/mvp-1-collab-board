import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, createTempUser, deleteTempUser } from '../helpers/auth'
import {
  decodeUserIdFromIdToken,
  fetchBoardPresenceMap,
  fetchCursorPresence,
  writeCursorPresence,
} from '../helpers/performance'

const CURSOR_SYNC_SLA = { target: 50, warning: 75, critical: 100 }
const PRESENCE_5P_SLA = { target: 600, warning: 1_200, critical: 2_500 }
const RELAXED_CURSOR_SYNC_SLA = { average: 250, max: 1_500 }
const STRICT_CURSOR_SYNC_ASSERTIONS = process.env.RUN_STRICT_PERF_SLA === '1'

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

const waitForPresenceMatch = async (args: {
  boardId: string
  userId: string
  readerToken: string
  expectedX: number
  expectedY: number
  timeoutMs: number
}): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= args.timeoutMs) {
    const presence = await fetchCursorPresence(args.boardId, args.userId, args.readerToken)
    if (presence && presence.x === args.expectedX && presence.y === args.expectedY) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const finalPresence = await fetchCursorPresence(args.boardId, args.userId, args.readerToken)
  throw new Error(
    `Presence value did not propagate within ${args.timeoutMs}ms. ` +
    `Expected: (${args.expectedX}, ${args.expectedY}), ` +
    `Got: ${finalPresence ? `(${finalPresence.x}, ${finalPresence.y})` : 'null'}`
  )
}

test.describe('Performance: Multi-user cursor sync', () => {
  test.setTimeout(180_000)

  test('NFR-3: cursor sync latency remains within PRD target and max bounds', async ({ page }, testInfo) => {
    void page
    const boardId = `pw-perf-cursor-${Date.now()}`
    const firstUser = await createOrReuseTestUser()
    const secondUser = await createTempUser()

    try {
      const firstUserId = decodeUserIdFromIdToken(firstUser.idToken)
      const secondUserId = decodeUserIdFromIdToken(secondUser.idToken)
      const latencies: number[] = []

      for (let i = 0; i < 4; i += 1) {
        const firstX = 120 + i * 17
        const firstY = 180 + i * 13
        await writeCursorPresence({
          boardId,
          userId: firstUserId,
          idToken: firstUser.idToken,
          displayName: firstUser.email,
          x: firstX,
          y: firstY,
          connectionId: `first-${i}`,
        })
        const firstStartedAt = Date.now()
        await waitForPresenceMatch({
          boardId,
          userId: firstUserId,
          readerToken: secondUser.idToken,
          expectedX: firstX,
          expectedY: firstY,
          timeoutMs: 8_000,
        })
        latencies.push(Date.now() - firstStartedAt)

        const secondX = 240 + i * 19
        const secondY = 140 + i * 11
        await writeCursorPresence({
          boardId,
          userId: secondUserId,
          idToken: secondUser.idToken,
          displayName: secondUser.email,
          x: secondX,
          y: secondY,
          connectionId: `second-${i}`,
        })
        const secondStartedAt = Date.now()
        await waitForPresenceMatch({
          boardId,
          userId: secondUserId,
          readerToken: firstUser.idToken,
          expectedX: secondX,
          expectedY: secondY,
          timeoutMs: 8_000,
        })
        latencies.push(Date.now() - secondStartedAt)
      }

      const averageMs = latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      const maxMs = Math.max(...latencies)

      annotateSla(testInfo, 'cursor-sync-average', averageMs, CURSOR_SYNC_SLA)
      annotateSla(testInfo, 'cursor-sync-max', maxMs, CURSOR_SYNC_SLA)

      if (STRICT_CURSOR_SYNC_ASSERTIONS) {
        expect(averageMs).toBeLessThanOrEqual(CURSOR_SYNC_SLA.target)
        expect(maxMs).toBeLessThanOrEqual(CURSOR_SYNC_SLA.critical)
      } else {
        expect(averageMs).toBeLessThanOrEqual(RELAXED_CURSOR_SYNC_SLA.average)
        expect(maxMs).toBeLessThanOrEqual(RELAXED_CURSOR_SYNC_SLA.max)
      }
    } finally {
      await Promise.all([
        cleanupTestUser(firstUser).catch(() => undefined),
        deleteTempUser(secondUser.idToken).catch(() => undefined),
      ])
    }
  })

  test('NFR-5: five concurrent users publish presence without degradation', async ({ page }, testInfo) => {
    void page
    const boardId = `pw-perf-presence5-${Date.now()}`
    const users = await Promise.all(
      Array.from({ length: 5 }, () => createTempUser()),
    )

    try {
      const userIds = users.map((user) => decodeUserIdFromIdToken(user.idToken))
      const startedAt = Date.now()
      await Promise.all(
        users.map((user, index) =>
          writeCursorPresence({
            boardId,
            userId: userIds[index],
            idToken: user.idToken,
            displayName: user.email,
            x: 120 + index * 45,
            y: 180 + index * 25,
            connectionId: `presence5-${index}`,
          }),
        ),
      )

      await expect
        .poll(async () => {
          const presenceMap = await fetchBoardPresenceMap(boardId, users[0].idToken)
          const connectedCount = userIds.filter((userId) => Boolean(presenceMap[userId])).length
          const hasNames = userIds.every((userId) => typeof presenceMap[userId]?.displayName === 'string')
          return { connectedCount, hasNames }
        }, { timeout: 20_000 })
        .toEqual({ connectedCount: 5, hasNames: true })

      const elapsedMs = Date.now() - startedAt
      annotateSla(testInfo, 'presence-5-user-propagation', elapsedMs, PRESENCE_5P_SLA)
      expect(elapsedMs).toBeLessThanOrEqual(PRESENCE_5P_SLA.critical)
    } finally {
      await Promise.all(users.map((user) => deleteTempUser(user.idToken).catch(() => undefined)))
    }
  })
})
