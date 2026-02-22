import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageSource = readBoardPageSource()
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const appErrorBoundarySource = readFileSync(
  new URL('../src/components/AppErrorBoundary.tsx', import.meta.url),
  'utf8',
)

test('RF-001: board object writes are centralized through helper callbacks', () => {
  assert.equal(boardPageSource.includes('const writeBoardObject = useCallback('), true)
  assert.equal(boardPageSource.includes('const writeBoardObjectPatch = useCallback('), true)
  assert.equal(boardPageSource.includes('const deleteBoardObjectById = useCallback('), true)

  const directSetDocWrites = (boardPageSource.match(/setDoc\(doc\((?:db|dbInstance), 'boards', boardId, 'objects'/g) || [])
    .length
  const directDeleteWrites = (
    boardPageSource.match(/deleteDoc\(doc\((?:db|dbInstance), 'boards', boardId, 'objects'/g) || []
  ).length

  assert.equal(directSetDocWrites, 1)
  assert.equal(directDeleteWrites, 1)
})

test('RF-003: realtime transport concerns are extracted into dedicated hooks', () => {
  assert.equal(boardPageSource.includes("import { useConnectionStatus } from '../hooks/useConnectionStatus'"), true)
  assert.equal(boardPageSource.includes("import { usePresence } from '../hooks/usePresence'"), true)
  assert.equal(boardPageSource.includes('useObjectSync({'), true)
})

test('RF-005: app root is protected by an error boundary fallback', () => {
  assert.equal(mainSource.includes("import { AppErrorBoundary } from './components/AppErrorBoundary'"), true)
  assert.equal(mainSource.includes('<AppErrorBoundary>'), true)
  assert.equal(mainSource.includes('</AppErrorBoundary>'), true)
  assert.equal(appErrorBoundarySource.includes('class AppErrorBoundary extends Component'), true)
  assert.equal(appErrorBoundarySource.includes('componentDidCatch('), true)
  assert.equal(appErrorBoundarySource.includes('data-testid="app-error-boundary-fallback"'), true)
})
