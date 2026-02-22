import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageSource = readBoardPageSource()

describe('BUGFIX-AI-COMMAND-PLACEMENT', () => {
  it('uses a freshness window for historical cursor fallback', () => {
    assert.ok(
      boardPageSource.includes('const AI_COMMAND_POINTER_MAX_AGE_MS = 5_000'),
      'AI command pointer freshness window constant missing',
    )
    assert.ok(
      boardPageSource.includes('const hasFreshLastWorldPointer ='),
      'AI command submit should compute pointer freshness',
    )
    assert.ok(
      boardPageSource.includes('lastPointerAge <= AI_COMMAND_POINTER_MAX_AGE_MS'),
      'AI command submit should reject stale historical pointers',
    )
  })

  it('falls back to viewport center when no fresh cursor is available', () => {
    assert.ok(
      boardPageSource.includes('const placementPointer = currentWorldPointer || (hasFreshLastWorldPointer ? lastWorldPointerRef.current : null)'),
      'AI command submit should prefer current/fresh pointer for placement',
    )
    assert.ok(
      boardPageSource.includes('const placementAnchor = placementPointer || viewportCenter'),
      'AI command submit should anchor to viewport center when pointer is unavailable',
    )
  })
})
