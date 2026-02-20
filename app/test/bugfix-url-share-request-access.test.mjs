import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
const rulesSource = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

test('BUGFIX-URL-SHARE-001: board UI exposes URL sharing controls and denied-state access request CTA', () => {
  assert.equal(boardPageSource.includes('data-testid="share-link-role-select"'), true)
  assert.equal(boardPageSource.includes('data-testid="share-link-role-submit-button"'), true)
  assert.equal(boardPageSource.includes('data-testid="share-link-url-input"'), true)
  assert.equal(boardPageSource.includes('data-testid="board-access-request-button"'), true)
  assert.equal(boardPageSource.includes('action: \'request-access\''), true)
})

test('BUGFIX-URL-SHARE-002: backend supports request-access, link role updates, and approval flow', () => {
  assert.equal(functionsSource.includes("action === 'request-access'"), true)
  assert.equal(functionsSource.includes("action === 'set-link-access'"), true)
  assert.equal(functionsSource.includes("action === 'approve-request'"), true)
  assert.equal(functionsSource.includes("normalizeLinkAccessRole(req.body?.linkRole)"), true)
  assert.equal(functionsSource.includes("collection('accessRequests')"), true)
})

test('BUGFIX-URL-SHARE-003: Firestore rules allow link access and access-request writes', () => {
  assert.equal(rulesSource.includes('function boardLinkAccessRole(boardId)'), true)
  assert.equal(rulesSource.includes('boardLinkAccessRole(boardId) == "edit"'), true)
  assert.equal(rulesSource.includes('match /accessRequests/{requestUserId} {'), true)
  assert.equal(rulesSource.includes('allow create: if isSignedIn() && request.auth.uid == requestUserId;'), true)
})
