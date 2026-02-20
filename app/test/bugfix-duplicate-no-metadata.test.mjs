/**
 * Regression guard for T-095:
 * Duplicating objects must not copy collaborative metadata.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const boardPagePath = path.resolve(process.cwd(), 'src/pages/BoardPage.tsx')
const boardPageSource = readFileSync(boardPagePath, 'utf8')

const countMatches = (source, matcher) => (source.match(matcher) || []).length

describe('BUGFIX-095: duplicate strips comments and votes', () => {
  it('applies metadata stripping in both duplicate branches (connector + non-connector)', () => {
    const duplicateStart = boardPageSource.indexOf('const duplicateObject = useCallback(')
    const duplicateEnd = boardPageSource.indexOf('const duplicateSelected = useCallback(', duplicateStart)
    assert.ok(duplicateStart >= 0 && duplicateEnd > duplicateStart, 'duplicateObject function not found')

    const duplicateBody = boardPageSource.slice(duplicateStart, duplicateEnd)

    assert.ok(
      countMatches(duplicateBody, /comments:\s*\[\]/g) >= 2,
      'duplicateObject should clear comments for both connector and non-connector duplicates',
    )
    assert.ok(
      countMatches(duplicateBody, /votesByUser:\s*\{\}/g) >= 2,
      'duplicateObject should clear votesByUser for both connector and non-connector duplicates',
    )
  })
})
