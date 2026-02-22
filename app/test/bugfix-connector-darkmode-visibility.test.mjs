import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const primitivesSource = readFileSync(
  resolve(process.cwd(), 'src/pages/boardPageRuntimePrimitives.tsx'),
  'utf8',
)

test('BUGFIX-CONNECTOR-DARKMODE-VISIBILITY: connector defaults start with visible blue', () => {
  assert.match(
    primitivesSource,
    /const CONNECTOR_COLOR_OPTIONS = \['#1d4ed8', '#0f172a', '#dc2626', '#0f766e', '#6d28d9'\]/,
    'Expected connector color defaults to prioritize visible blue in dark mode',
  )
})
