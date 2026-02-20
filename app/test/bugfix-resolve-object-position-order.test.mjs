import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

test('BUGFIX-TDZ-001: resolveObjectPosition/resolveObjectSize are declared before first usage', () => {
  const boardPagePath = path.resolve(process.cwd(), 'src/pages/BoardPage.tsx')
  const source = readFileSync(boardPagePath, 'utf8')

  const resolveObjectPositionIndex = source.indexOf('const resolveObjectPosition = useCallback(')
  const resolveObjectSizeIndex = source.indexOf('const resolveObjectSize = useCallback(')
  const firstResolveObjectPositionUsage = source.indexOf('resolveObjectPosition(')
  const firstResolveObjectSizeUsage = source.indexOf('resolveObjectSize(')

  assert.ok(resolveObjectPositionIndex > -1, 'resolveObjectPosition callback must exist')
  assert.ok(resolveObjectSizeIndex > -1, 'resolveObjectSize callback must exist')
  assert.ok(firstResolveObjectPositionUsage > -1, 'resolveObjectPosition must be used at least once')
  assert.ok(firstResolveObjectSizeUsage > -1, 'resolveObjectSize must be used at least once')

  assert.ok(
    resolveObjectPositionIndex < firstResolveObjectPositionUsage,
    'resolveObjectPosition must be declared before usage to avoid TDZ errors',
  )
  assert.ok(
    resolveObjectSizeIndex < firstResolveObjectSizeUsage,
    'resolveObjectSize must be declared before usage to avoid TDZ errors',
  )
})
