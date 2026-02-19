import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rulesSource = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')

test('TS-031 / FR-22: Firestore rules require owner/shared access and role-gated writes', () => {
  assert.equal(rulesSource.includes('function hasBoardAccess(boardId)'), true)
  assert.equal(rulesSource.includes('request.auth.uid in boardSharedWith(boardId)'), true)
  assert.equal(rulesSource.includes('function hasBoardEditAccess(boardId)'), true)
  assert.equal(rulesSource.includes('boardSharedRole(boardId, request.auth.uid) != "view"'), true)
  assert.equal(rulesSource.includes('allow update, delete: if isBoardOwner(boardId);'), true)
  assert.equal(rulesSource.includes('match /objects/{objectId} {'), true)
  assert.equal(rulesSource.includes('allow read: if hasBoardAccess(boardId);'), true)
  assert.equal(rulesSource.includes('allow write: if hasBoardEditAccess(boardId);'), true)
  assert.equal(rulesSource.includes('allow read, write: if isSignedIn();'), false)
})

test('TS-032 / FR-22: backend API enforces board access, edit role for AI, and owner-only share mutations', () => {
  assert.equal(functionsSource.includes('const isBoardShareRoute = req.path.endsWith(\'/boards/share\')'), true)
  assert.equal(functionsSource.includes('const accessResult = await ensureBoardAccess({ boardId, userId, createIfMissing: true })'), true)
  assert.equal(functionsSource.includes('if (!canUserEditBoard(accessResult.boardMeta, userId))'), true)
  assert.equal(functionsSource.includes('const roleInput = String(req.body?.role || \'edit\').trim().toLowerCase()'), true)
  assert.equal(functionsSource.includes('if (!boardMeta || boardMeta.ownerId !== userId)'), true)
  assert.equal(functionsSource.includes('resolveCollaboratorId'), true)
})
