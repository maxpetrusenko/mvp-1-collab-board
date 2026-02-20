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
const objectSyncSource = readFileSync(
  new URL('../e2e/performance/object-sync-latency.spec.ts', import.meta.url),
  'utf8',
)
const renderingSource = readFileSync(
  new URL('../e2e/performance/rendering.spec.ts', import.meta.url),
  'utf8',
)
const extremeStressSource = readFileSync(
  new URL('../e2e/performance/stress-scale-5000-20users.spec.ts', import.meta.url),
  'utf8',
)
const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')
const objectSyncHookSource = readFileSync(new URL('../src/hooks/useObjectSync.ts', import.meta.url), 'utf8')
const presenceHookSource = readFileSync(new URL('../src/hooks/usePresence.ts', import.meta.url), 'utf8')

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

test('HR-002 / NFR-3: object sync latency target is encoded at <100ms with critical bound', () => {
  const match = objectSyncSource.match(
    /const OBJECT_SYNC_SLA = \{ target: ([\d_]+), warning: ([\d_]+), critical: ([\d_]+) \}/,
  )
  assert.ok(match, 'OBJECT_SYNC_SLA declaration not found')

  const target = Number(match[1].replaceAll('_', ''))
  const critical = Number(match[3].replaceAll('_', ''))
  assert.equal(target, 100)
  assert.ok(critical >= target, 'Critical bound must be >= target')
  assert.equal(objectSyncSource.includes('object-sync-create-average'), true)
  assert.equal(objectSyncSource.includes('object-sync-move-average'), true)
})

test('HR-002 / NFR-4: frame-rate targets are configured at 60 FPS for drag and zoom interactions', () => {
  assert.equal(renderingSource.includes('const DRAG_FPS_SLA = { target: 60'), true)
  assert.equal(renderingSource.includes('const ZOOM_FPS_SLA = { target: 60'), true)
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

test('NFR-5: 5+ concurrent users coverage includes explicit five-user presence propagation', () => {
  assert.equal(multiUserSource.includes('five concurrent users publish presence'), true)
  assert.equal(multiUserSource.includes('connectedCount: 5'), true)
  assert.equal(multiUserSource.includes('const PRESENCE_5P_SLA = { target:'), true)
})

test('NFR-5 (stress): 5000-card / 20-user simulation harness exists and is opt-in', () => {
  assert.equal(extremeStressSource.includes('const TARGET_OBJECT_COUNT = 5_000'), true)
  assert.equal(extremeStressSource.includes('const SIMULATED_USERS = Math.max(20'), true)
  assert.equal(extremeStressSource.includes('STRESS_SIMULATED_USERS'), true)
  assert.equal(extremeStressSource.includes('Set RUN_EXTREME_STRESS=1'), true)
  assert.equal(extremeStressSource.includes('shareBoardWithUser'), true)
  assert.equal(extremeStressSource.includes('writeCursorPresence'), true)
  assert.equal(extremeStressSource.includes('patchObjectPosition'), true)
})

test('NFR-5 stability: object sync hook coalesces snapshots and avoids drag/resize subscription churn', () => {
  assert.equal(objectSyncHookSource.includes('const SNAPSHOT_FLUSH_MS = 16'), true)
  assert.equal(objectSyncHookSource.includes('const pendingSnapshotRef = useRef<BoardObject[] | null>(null)'), true)
  assert.equal(objectSyncHookSource.includes('const snapshotFlushTimeoutRef = useRef<number | null>(null)'), true)
  assert.equal(objectSyncHookSource.includes('scheduleSnapshotFlush()'), true)
  assert.equal(objectSyncHookSource.includes('pendingSnapshotRef.current = nextObjects'), true)
  assert.equal(objectSyncHookSource.includes('const draggingObjectIdRef = useRef<string | null>(draggingObjectId)'), true)
  assert.equal(objectSyncHookSource.includes('const draggingConnectorIdRef = useRef<string | null>(draggingConnectorId)'), true)
  assert.equal(objectSyncHookSource.includes('const resizingObjectIdRef = useRef<string | null>(resizingObjectId)'), true)
  assert.equal(
    objectSyncHookSource.includes('if (localOverride.mode === \'dragging\') {\n            const draggingObjectIdValue = draggingObjectIdRef.current'),
    true,
  )
  assert.equal(
    objectSyncHookSource.includes('if (localOverride.mode === \'resizing\') {\n            const resizingObjectIdValue = resizingObjectIdRef.current'),
    true,
  )
})

test('NFR-5 stability: presence hook batches RTDB cursor fan-out and prunes stale entries', () => {
  assert.equal(presenceHookSource.includes('const PRESENCE_STATE_FLUSH_MS = 50'), true)
  assert.equal(presenceHookSource.includes('const PRESENCE_STALE_THRESHOLD_MS = 2 * 60_000'), true)
  assert.equal(presenceHookSource.includes('const MAX_PRESENCE_ENTRIES = 200'), true)
  assert.equal(presenceHookSource.includes('const pendingCursorsRef = useRef<Record<string, CursorPresence> | null>(null)'), true)
  assert.equal(presenceHookSource.includes('const stateFlushTimeoutRef = useRef<number | null>(null)'), true)
  assert.equal(presenceHookSource.includes('scheduleCursorStateFlush()'), true)
  assert.equal(presenceHookSource.includes('pendingCursorsRef.current = next || {}'), true)
  assert.equal(presenceHookSource.includes('return now - lastSeen <= PRESENCE_STALE_THRESHOLD_MS'), true)
})
