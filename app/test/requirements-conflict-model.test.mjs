import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')

test('FR-32: client-side object patches do not assign updatedAt from local Date.now()', () => {
  assert.equal(
    boardPageSource.includes('updatedAt: Date.now()'),
    false,
    'Found local timestamp writes in BoardPage patch path; FR-32 expects server-authoritative updatedAt',
  )
})
