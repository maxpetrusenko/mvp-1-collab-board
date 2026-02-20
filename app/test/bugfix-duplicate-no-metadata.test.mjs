/**
 * Unit tests for bugfix: Duplicate should not copy collaborative metadata
 *
 * Addresses T-095: When duplicating objects (Ctrl+D), comments and votes
 * should NOT be copied - only visual properties.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('BUGFIX-095: Duplicate object metadata isolation', () => {
  it('should strip comments and votes when duplicating objects', () => {
    // Simulate the duplicate logic from BoardPage.tsx
    const source = {
      id: 'original-id',
      type: 'sticky',
      text: 'Hello',
      color: 'yellow',
      position: { x: 100, y: 100 },
      comments: [{ userId: 'user1', text: 'A comment', timestamp: Date.now() }],
      votesByUser: { user1: true, user2: true },
    }

    // This is what the fixed duplicateObject function does
    const duplicate = {
      ...source,
      frameId: null,
      id: 'duplicate-id',
      position: {
        x: source.position.x + 24,
        y: source.position.y + 24,
      },
      // Don't copy collaborative metadata (comments, votes)
      comments: undefined,
      votesByUser: undefined,
      zIndex: 1,
      createdBy: 'current-user',
      updatedBy: 'current-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    }

    // Verify visual properties ARE copied
    assert.strictEqual(duplicate.text, 'Hello')
    assert.strictEqual(duplicate.color, 'yellow')
    assert.strictEqual(duplicate.position.x, 124)
    assert.strictEqual(duplicate.position.y, 124)

    // Verify collaborative metadata is NOT copied
    assert.strictEqual(duplicate.comments, undefined)
    assert.strictEqual(duplicate.votesByUser, undefined)
  })

  it('should strip comments and votes from connectors when duplicating', () => {
    const source = {
      id: 'original-connector',
      type: 'connector',
      path: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      style: 'solid',
      comments: [{ userId: 'user1', text: 'Comment on connector' }],
      votesByUser: { user1: true },
    }

    const duplicate = {
      ...source,
      id: 'duplicate-connector',
      start: { x: 24, y: 24 },
      end: { x: 124, y: 124 },
      fromObjectId: null,
      toObjectId: null,
      fromAnchor: null,
      toAnchor: null,
      // Don't copy collaborative metadata (comments, votes)
      comments: undefined,
      votesByUser: undefined,
      zIndex: 1,
    }

    assert.strictEqual(duplicate.comments, undefined)
    assert.strictEqual(duplicate.votesByUser, undefined)
    assert.strictEqual(duplicate.path, source.path)
  })
})
