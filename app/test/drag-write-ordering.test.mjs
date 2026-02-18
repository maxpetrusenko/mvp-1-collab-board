import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Resolve final drag position from potentially out-of-order writes.
 * Newer updatedAt wins; ties break on dragSessionId then sequence.
 */
const shouldApplyDragUpdate = (current, incoming) => {
  if (!current) {
    return true
  }

  if (incoming.updatedAt !== current.updatedAt) {
    return incoming.updatedAt > current.updatedAt
  }

  if (incoming.dragSessionId !== current.dragSessionId) {
    return incoming.dragSessionId > current.dragSessionId
  }

  return incoming.sequence >= current.sequence
}

const resolveFinalDragPosition = (updates) => {
  let latest = null

  for (const update of updates) {
    if (shouldApplyDragUpdate(latest, update)) {
      latest = update
    }
  }

  return latest ? latest.position : null
}

test('keeps drag-end position when older move arrives after release write', () => {
  const updatesInArrivalOrder = [
    {
      position: { x: 120, y: 140 },
      updatedAt: 1_000,
      dragSessionId: 'user-a-session-1',
      sequence: 1,
    },
    {
      position: { x: 360, y: 240 }, // drag end release position
      updatedAt: 1_060,
      dragSessionId: 'user-a-session-1',
      sequence: 6,
    },
    {
      position: { x: 210, y: 180 }, // older in-flight move arriving late
      updatedAt: 1_020,
      dragSessionId: 'user-a-session-1',
      sequence: 3,
    },
  ]

  assert.deepEqual(resolveFinalDragPosition(updatesInArrivalOrder), { x: 360, y: 240 })
})

test('supports multi-user concurrent drags by selecting the newest write', () => {
  const updatesInArrivalOrder = [
    {
      position: { x: 460, y: 260 }, // user A final
      updatedAt: 2_000,
      dragSessionId: 'user-a-session-7',
      sequence: 4,
    },
    {
      position: { x: 180, y: 420 }, // user B final, later timestamp
      updatedAt: 2_030,
      dragSessionId: 'user-b-session-2',
      sequence: 5,
    },
    {
      position: { x: 440, y: 250 }, // stale user A move arrives late
      updatedAt: 1_990,
      dragSessionId: 'user-a-session-7',
      sequence: 3,
    },
  ]

  assert.deepEqual(resolveFinalDragPosition(updatesInArrivalOrder), { x: 180, y: 420 })
})

test('uses deterministic tiebreakers when timestamps are equal', () => {
  const updatesInArrivalOrder = [
    {
      position: { x: 300, y: 300 },
      updatedAt: 3_000,
      dragSessionId: 'user-a-session-9',
      sequence: 4,
    },
    {
      position: { x: 340, y: 330 },
      updatedAt: 3_000,
      dragSessionId: 'user-a-session-9',
      sequence: 6,
    },
  ]

  assert.deepEqual(resolveFinalDragPosition(updatesInArrivalOrder), { x: 340, y: 330 })
})
