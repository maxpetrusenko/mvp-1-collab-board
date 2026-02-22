import assert from 'node:assert/strict'
import test from 'node:test'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageSource = readBoardPageSource()

test('FR-32: client-side object patches do not assign updatedAt from local Date.now()', () => {
  assert.equal(
    boardPageSource.includes('updatedAt: Date.now()'),
    false,
    'Found local timestamp writes in BoardPage patch path; FR-32 expects server-authoritative updatedAt',
  )
})
