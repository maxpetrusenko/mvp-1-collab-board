import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')

test('BUGFIX-DUPLICATE-EDIT-001: interaction mode is not downgraded before board metadata resolves', () => {
  assert.equal(boardPageSource.includes('if (!activeBoardMeta) {'), true)
  assert.equal(boardPageSource.includes("setInteractionMode('view')"), true)
  assert.equal(boardPageSource.includes('}, [activeBoardMeta, interactionMode, roleCanEditBoard])'), true)
})

test('BUGFIX-DUPLICATE-EDIT-002: board duplicate uses edit permission checks and metadata fallbacks', () => {
  assert.equal(boardPageSource.includes('const canEditBoardMeta = (boardMeta: BoardMeta, userId: string) => {'), true)
  assert.equal(boardPageSource.includes('return canEditBoardMeta(activeBoardMeta, userId)'), true)
  assert.equal(
    boardPageSource.includes('boards.find((candidate) => candidate.id === targetBoardId) ||'),
    true,
  )
  assert.equal(
    boardPageSource.includes('(currentBoardMeta?.id === targetBoardId ? currentBoardMeta : null) ||'),
    true,
  )
  assert.equal(
    boardPageSource.includes('(boardAccessMeta?.id === targetBoardId ? boardAccessMeta : null)'),
    true,
  )
  assert.equal(boardPageSource.includes("setBoardFormError('You need edit access to duplicate this board.')"), true)
  assert.equal(boardPageSource.includes('disabled={!canDuplicateBoard}'), true)
})

test('BUGFIX-DUPLICATE-EDIT-003: command-palette duplicate is gated by edit role and still calls duplicate action', () => {
  assert.equal(boardPageSource.includes("id: 'duplicate-current-board'"), true)
  assert.equal(boardPageSource.includes('if (!roleCanEditBoard) {'), true)
  assert.equal(boardPageSource.includes('void duplicateBoardMeta(boardId)'), true)
})
