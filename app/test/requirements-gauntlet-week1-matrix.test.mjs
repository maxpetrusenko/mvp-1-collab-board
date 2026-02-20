import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const collabParitySource = readFileSync(new URL('../e2e/requirements-collab-parity.spec.ts', import.meta.url), 'utf8')
const collabUiSource = readFileSync(new URL('../e2e/collab.spec.ts', import.meta.url), 'utf8')
const reconnectSource = readFileSync(new URL('../e2e/requirements-reconnect-ux.spec.ts', import.meta.url), 'utf8')
const conflictModelSource = readFileSync(new URL('./requirements-conflict-model.test.mjs', import.meta.url), 'utf8')
const dragOrderingSource = readFileSync(new URL('./drag-write-ordering.test.mjs', import.meta.url), 'utf8')
const objectSyncPerfSource = readFileSync(new URL('../e2e/performance/object-sync-latency.spec.ts', import.meta.url), 'utf8')
const multiUserPerfSource = readFileSync(new URL('../e2e/performance/multi-user.spec.ts', import.meta.url), 'utf8')
const renderingPerfSource = readFileSync(new URL('../e2e/performance/rendering.spec.ts', import.meta.url), 'utf8')
const scalingPerfSource = readFileSync(new URL('../e2e/performance/scaling.spec.ts', import.meta.url), 'utf8')
const aiResponsePerfSource = readFileSync(new URL('../e2e/performance/ai-response.spec.ts', import.meta.url), 'utf8')
const aiConcurrencySource = readFileSync(new URL('../e2e/ai-concurrency.spec.ts', import.meta.url), 'utf8')
const criticalChecksSource = readFileSync(new URL('../../scripts/run-critical-checks.sh', import.meta.url), 'utf8')
const aiLogSource = readFileSync(new URL('../../docs/AI_DEVELOPMENT_LOG.md', import.meta.url), 'utf8')
const aiCostSource = readFileSync(new URL('../../docs/AI_COST_ANALYSIS.md', import.meta.url), 'utf8')

test('RT-FEATURES-001: realtime collaboration feature requirements have explicit automated coverage', () => {
  // Cursors + names + realtime movement
  assert.equal(multiUserPerfSource.includes('writeCursorPresence'), true)
  assert.equal(multiUserPerfSource.includes('displayName'), true)
  assert.equal(multiUserPerfSource.includes('waitForPresenceMatch'), true)

  // Object sync create/modify visible to collaborators
  assert.equal(collabParitySource.includes('FR-9/AC-2: syncs sticky create and move'), true)

  // Presence UI indication
  assert.equal(collabUiSource.includes('presence strip visible'), true)
  assert.equal(collabUiSource.includes('presence-dot'), true)

  // Conflict behavior documented and tested
  assert.equal(conflictModelSource.includes('FR-32'), true)
  assert.equal(dragOrderingSource.includes('supports multi-user concurrent drags by selecting the newest write'), true)

  // Disconnect/reconnect resilience
  assert.equal(reconnectSource.includes("setOffline(true)"), true)
  assert.equal(reconnectSource.includes("setOffline(false)"), true)

  // Persistence after refresh
  assert.equal(collabParitySource.includes('FR-14/AC-2: keeps shared board state consistent after collaborator refresh'), true)
  assert.equal(collabParitySource.includes('pageA.reload()'), true)
})

test('RT-SCENARIOS-001: required realtime testing scenarios are covered', () => {
  // 2 users editing simultaneously
  assert.equal(collabParitySource.includes('browser.newContext()'), true)
  assert.equal(collabParitySource.includes('contextA'), true)
  assert.equal(collabParitySource.includes('contextB'), true)

  // One user refresh mid-edit
  assert.equal(collabParitySource.includes('pageA.reload()'), true)

  // Rapid creation + movement sync performance
  assert.equal(objectSyncPerfSource.includes('rapid sticky/shape create+move'), true)
  assert.equal(objectSyncPerfSource.includes('createActions'), true)
  assert.equal(objectSyncPerfSource.includes('dragObjectByDelta'), true)

  // Network throttling/disconnect recovery
  assert.equal(criticalChecksSource.includes('--limit-rate 128'), true)
  assert.equal(criticalChecksSource.includes('THROTTLE_RETRY_RESP'), true)
  assert.equal(reconnectSource.includes("window.dispatchEvent(new Event('offline'))"), true)

  // 5+ users concurrent
  assert.equal(aiConcurrencySource.includes('five authenticated users can execute command burst'), true)
  assert.equal(multiUserPerfSource.includes('connectedCount: 5'), true)
})

test('RT-PERF-001: required performance targets are encoded in automated checks', () => {
  // Frame-rate target tracked for manipulation and zoom
  assert.equal(renderingPerfSource.includes('const DRAG_FPS_SLA = { target: 60'), true)
  assert.equal(renderingPerfSource.includes('const ZOOM_FPS_SLA = { target: 60'), true)

  // Object sync latency target <100ms
  assert.equal(objectSyncPerfSource.includes('const OBJECT_SYNC_SLA = { target: 100'), true)

  // Cursor sync latency target <50ms
  assert.equal(multiUserPerfSource.includes('const CURSOR_SYNC_SLA = { target: 50'), true)

  // 500+ object capacity
  assert.equal(scalingPerfSource.includes('seedBoardObjects(boardId, user.idToken, 500'), true)

  // 5+ user concurrent degradation checks
  assert.equal(multiUserPerfSource.includes('NFR-5: five concurrent users publish presence'), true)
})

test('AI-COVERAGE-001: shared AI state, breadth, and latency requirements are covered by automation', () => {
  // Shared AI state visibility and concurrency/idempotency
  assert.equal(collabParitySource.includes('FR-19: AI-created content becomes visible to other collaborators'), true)
  assert.equal(aiConcurrencySource.includes('concurrent authenticated commands preserve queue + idempotency'), true)

  // Single-step latency target
  assert.equal(aiResponsePerfSource.includes('const SIMPLE_AI_SLA = { target: 2_000'), true)
  assert.equal(aiResponsePerfSource.includes('expect(elapsedMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.target)'), true)
})

test('AI-DOCS-001: AI-first development and cost-analysis deliverables include required sections', () => {
  // AI development log template sections
  assert.equal(aiLogSource.includes('## 1) Tools and Workflow'), true)
  assert.equal(aiLogSource.includes('## 2) MCP Usage'), true)
  assert.equal(aiLogSource.includes('## 3) Effective Prompts'), true)
  assert.equal(aiLogSource.includes('## 4) Code Analysis'), true)
  assert.equal(aiLogSource.includes('## 5) Strengths and Limitations'), true)
  assert.equal(aiLogSource.includes('## 6) Key Learnings'), true)
  assert.ok((aiLogSource.match(/^\d+\.\s+"/gm) || []).length >= 3, 'Expected at least 3 concrete prompts')

  // Cost analysis dev spend + projections and assumptions
  assert.equal(aiCostSource.includes('Actual Development Spend'), true)
  assert.equal(aiCostSource.includes('100 users'), true)
  assert.equal(aiCostSource.includes('1,000 users'), true)
  assert.equal(aiCostSource.includes('10,000 users'), true)
  assert.equal(aiCostSource.includes('100,000 users'), true)
  assert.equal(aiCostSource.includes('Assumptions'), true)
  assert.equal(aiCostSource.includes('commands per user per session'), true)
  assert.equal(aiCostSource.includes('sessions per user per month'), true)
  assert.equal(aiCostSource.includes('tokens per command'), true)
})
