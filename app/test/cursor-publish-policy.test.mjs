import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const presenceHookSource = readFileSync(new URL('../src/hooks/usePresence.ts', import.meta.url), 'utf8')

const extractNumericConstant = (source, name) => {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d_]+)`))
  if (!match) {
    throw new Error(`Unable to extract ${name}`)
  }
  return Number(match[1].replaceAll('_', ''))
}

const CURSOR_PUBLISH_INTERVAL_MS = extractNumericConstant(
  presenceHookSource,
  'CURSOR_PUBLISH_INTERVAL_MS',
)
const CURSOR_MOVEMENT_EPSILON_PX = extractNumericConstant(
  presenceHookSource,
  'CURSOR_MOVEMENT_EPSILON_PX',
)

const shouldSuppressPoint = (left, right, epsilon) =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon

const simulateCursorPublishPolicy = ({ events, intervalMs, epsilonPx }) => {
  const publishes = []
  let lastCursorPublishAt = 0
  let pendingCursor = null
  let lastPublishedCursor = null
  let scheduledPublishAt = null

  const flushPublish = (publishedAt) => {
    if (!pendingCursor) {
      return
    }
    publishes.push({
      at: publishedAt,
      point: pendingCursor,
    })
    lastCursorPublishAt = publishedAt
    lastPublishedCursor = pendingCursor
    pendingCursor = null
  }

  for (const event of events) {
    while (scheduledPublishAt !== null && scheduledPublishAt <= event.at) {
      const scheduledAt = scheduledPublishAt
      scheduledPublishAt = null
      flushPublish(scheduledAt)
    }

    if (pendingCursor && shouldSuppressPoint(pendingCursor, event.point, epsilonPx)) {
      continue
    }
    if (
      lastPublishedCursor &&
      shouldSuppressPoint(lastPublishedCursor, event.point, epsilonPx) &&
      scheduledPublishAt === null
    ) {
      continue
    }

    pendingCursor = event.point
    const elapsedSinceLastPublish = event.at - lastCursorPublishAt

    if (elapsedSinceLastPublish >= intervalMs && scheduledPublishAt === null) {
      flushPublish(event.at)
      continue
    }

    if (scheduledPublishAt === null) {
      const waitMs = Math.max(0, intervalMs - elapsedSinceLastPublish)
      scheduledPublishAt = event.at + waitMs
    }
  }

  if (scheduledPublishAt !== null) {
    flushPublish(scheduledPublishAt)
  }

  return publishes
}

test('T-139 / NFR-3: cursor publish cadence stays within the 50ms SLA target', () => {
  assert.ok(CURSOR_PUBLISH_INTERVAL_MS <= 33)
  assert.ok(CURSOR_PUBLISH_INTERVAL_MS <= 50)
  assert.ok(CURSOR_MOVEMENT_EPSILON_PX >= 1)
})

test('T-139 / NFR-3: duplicate suppression ignores micro-jitter points within epsilon', () => {
  const base = { x: 640, y: 360 }
  const events = Array.from({ length: 80 }, (_, index) => ({
    at: 1_000 + index * 5,
    point: {
      x: base.x + (index % 2 === 0 ? 0.5 : -0.5),
      y: base.y + (index % 3 === 0 ? 0.4 : -0.4),
    },
  }))

  const publishes = simulateCursorPublishPolicy({
    events,
    intervalMs: CURSOR_PUBLISH_INTERVAL_MS,
    epsilonPx: CURSOR_MOVEMENT_EPSILON_PX,
  })

  assert.equal(publishes.length, 1)
  assert.ok(shouldSuppressPoint(publishes[0].point, base, CURSOR_MOVEMENT_EPSILON_PX))
})

test('T-139 / NFR-3: rapid cursor movement remains throttled to interval budget', () => {
  const events = Array.from({ length: 30 }, (_, index) => ({
    at: 2_000 + index * 5,
    point: {
      x: 100 + index * 12,
      y: 200 + index * 4,
    },
  }))

  const publishes = simulateCursorPublishPolicy({
    events,
    intervalMs: CURSOR_PUBLISH_INTERVAL_MS,
    epsilonPx: CURSOR_MOVEMENT_EPSILON_PX,
  })

  assert.ok(publishes.length >= 4, 'Expected multiple throttled publishes')

  const gaps = publishes.slice(1).map((entry, index) => entry.at - publishes[index].at)
  const minGap = Math.min(...gaps)
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length

  assert.ok(minGap >= CURSOR_PUBLISH_INTERVAL_MS - 1)
  assert.ok(avgGap >= CURSOR_PUBLISH_INTERVAL_MS - 0.5)
})
