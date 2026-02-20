import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const aiResponseSource = readFileSync(
  new URL('../e2e/performance/ai-response.spec.ts', import.meta.url),
  'utf8',
)
const multiUserSource = readFileSync(
  new URL('../e2e/performance/multi-user.spec.ts', import.meta.url),
  'utf8',
)
const scalingSource = readFileSync(
  new URL('../e2e/performance/scaling.spec.ts', import.meta.url),
  'utf8',
)
const simultaneousSource = readFileSync(
  new URL('../e2e/performance/simultaneous-movement.spec.ts', import.meta.url),
  'utf8',
)
const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')

test('HR-002 / FR-16: simple AI command SLA is enforced at PRD target (<2s)', () => {
  const match = aiResponseSource.match(
    /const SIMPLE_AI_SLA = \{ target: ([\d_]+), warning: ([\d_]+), critical: ([\d_]+) \}/,
  )
  assert.ok(match, 'SIMPLE_AI_SLA declaration not found')

  const target = Number(match[1].replaceAll('_', ''))
  assert.equal(target, 2_000)
  assert.equal(aiResponseSource.includes('expect(elapsedMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.target)'), true)
})

test('HR-002 / NFR-3: cursor sync SLA is enforced at 50ms average with 100ms max ceiling', () => {
  const match = multiUserSource.match(
    /const CURSOR_SYNC_SLA = \{ target: ([\d_]+), warning: ([\d_]+), critical: ([\d_]+) \}/,
  )
  assert.ok(match, 'CURSOR_SYNC_SLA declaration not found')

  const target = Number(match[1].replaceAll('_', ''))
  const critical = Number(match[3].replaceAll('_', ''))
  assert.equal(target, 50)
  assert.equal(critical, 100)
  assert.equal(
    multiUserSource.includes('expect(averageMs).toBeLessThanOrEqual(CURSOR_SYNC_SLA.target)'),
    true,
  )
  assert.equal(
    multiUserSource.includes('expect(maxMs).toBeLessThanOrEqual(CURSOR_SYNC_SLA.critical)'),
    true,
  )
})

test('TS-041 / T-089: viewport culling activates for large boards with expanded viewport bounds', () => {
  assert.equal(boardPageSource.includes('if (objects.length <= 160) {'), true)
  assert.equal(boardPageSource.includes('const expandedViewport = {'), true)
  assert.equal(boardPageSource.includes('const visibleChildrenByFrameId = new Set<string>()'), true)
  assert.equal(boardPageSource.includes('const visibleObjectIds = new Set(visible.map((boardObject) => boardObject.id))'), true)
})

test('TS-042 / T-090: scaling performance E2E covers 500 and 1000 object boards', () => {
  assert.equal(scalingSource.includes("seedBoardObjects(boardId, user.idToken, 500"), true)
  assert.equal(scalingSource.includes("seedBoardObjects(boardId, user.idToken, 1000"), true)
  assert.equal(scalingSource.includes('expect(objects.length).toBeGreaterThanOrEqual(500)'), true)
  assert.equal(scalingSource.includes('expect(objects.length).toBeGreaterThanOrEqual(1000)'), true)
})

test('NFR-5: simultaneous object movement stress test covers 10, 50, and 100 concurrent moving objects', () => {
  assert.equal(simultaneousSource.includes('pw-perf-simult-10-'), true)
  assert.equal(simultaneousSource.includes('pw-perf-simult-50-'), true)
  assert.equal(simultaneousSource.includes('pw-perf-simult-100-'), true)
  assert.equal(simultaneousSource.includes('simulateConcurrentObjectMoves'), true)
  assert.equal(simultaneousSource.includes('moving simultaneously'), true)
  assert.equal(simultaneousSource.includes('should not crash'), true)
})
