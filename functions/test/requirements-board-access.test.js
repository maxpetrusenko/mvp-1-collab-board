const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')

const { __test } = require('../index')
const functionsSource = readFileSync(require.resolve('../index'), 'utf8')

test('FR-22: normalizeBoardMeta falls back ownerId to createdBy for legacy boards', () => {
  const board = __test.normalizeBoardMeta('legacy-board', {
    id: 'legacy-board',
    name: 'Legacy',
    createdBy: 'owner-1',
  })

  assert.equal(board.ownerId, 'owner-1')
  assert.deepEqual(board.sharedWith, [])
})

test('FR-22: normalizeBoardMeta backfills createdBy when only ownerId exists', () => {
  const board = __test.normalizeBoardMeta('owner-only-board', {
    id: 'owner-only-board',
    name: 'Owner only',
    ownerId: 'owner-2',
  })

  assert.equal(board.ownerId, 'owner-2')
  assert.equal(board.createdBy, 'owner-2')
  assert.deepEqual(board.sharedWith, [])
})

test('FR-22: canUserAccessBoard allows owner and shared collaborator only', () => {
  const board = {
    ownerId: 'owner-1',
    sharedWith: ['editor-1'],
    sharedRoles: {
      'editor-1': 'view',
    },
  }

  assert.equal(__test.canUserAccessBoard(board, 'owner-1'), true)
  assert.equal(__test.canUserAccessBoard(board, 'editor-1'), true)
  assert.equal(__test.canUserAccessBoard(board, 'viewer-2'), false)
})

test('FR-22: canUserEditBoard blocks view role and allows owner/editor', () => {
  const board = {
    ownerId: 'owner-1',
    sharedWith: ['editor-1', 'viewer-1', 'legacy-1'],
    sharedRoles: {
      'editor-1': 'edit',
      'viewer-1': 'view',
    },
  }

  assert.equal(__test.canUserEditBoard(board, 'owner-1'), true)
  assert.equal(__test.canUserEditBoard(board, 'editor-1'), true)
  assert.equal(__test.canUserEditBoard(board, 'viewer-1'), false)
  assert.equal(__test.canUserEditBoard(board, 'legacy-1'), true)
})

test('FR-22: collaborator resolver supports exact email and handle fallbacks', () => {
  assert.equal(functionsSource.includes("where('emailLower', '==', normalizedInput)"), true)
  assert.equal(functionsSource.includes("where('displayNameLower', '==', normalizedInput)"), true)
  assert.equal(functionsSource.includes("where('emailLower', '>=', emailPrefixStart)"), true)
  assert.equal(functionsSource.includes('Use full email or exact handle'), true)
})

test('FR-22: normalizeSharedRoles defaults collaborators to edit when role is missing', () => {
  const normalized = __test.normalizeSharedRoles(
    {
      'viewer-1': 'view',
      'editor-1': 'edit',
      'stranger-1': 'view',
    },
    ['viewer-1', 'editor-1', 'legacy-1'],
  )

  assert.deepEqual(normalized, {
    'viewer-1': 'view',
    'editor-1': 'edit',
    'legacy-1': 'edit',
  })
})

test('FR-22: share endpoint accepts role and AI endpoint enforces edit access', () => {
  assert.equal(functionsSource.includes("const roleInput = String(req.body?.role || 'edit').trim().toLowerCase()"), true)
  assert.equal(functionsSource.includes("sharedRoles: normalizedSharedRoles"), true)
  assert.equal(functionsSource.includes('if (!canUserEditBoard(accessResult.boardMeta, userId))'), true)
  assert.equal(functionsSource.includes('You have view-only access to this board.'), true)
})

test('FR-15: sticky parser accepts "note" alias to avoid slow LLM fallback', () => {
  const parsed = __test.parseStickyCommand('add note saying fast path')
  assert.equal(Boolean(parsed), true)
  assert.equal(parsed.shapeType, 'rectangle')
  assert.equal(parsed.texts[0], 'fast path')
})
